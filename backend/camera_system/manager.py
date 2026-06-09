import logging
import os
import threading
import time
from typing import Optional

from .web_camera import WebCamera, open_web_camera, probe_camera_indices

logger = logging.getLogger(__name__)

_start_lock = threading.Lock()
_LOCK_TIMEOUT_SEC = 25


def _env_indices() -> tuple[int, int]:
    return (
        int(os.getenv("CAMERA_LEFT_INDEX", "1")),
        int(os.getenv("CAMERA_RIGHT_INDEX", "2")),
    )


def _camera_alive(camera: Optional[WebCamera]) -> bool:
    if camera is None or not camera.is_open:
        return False
    frame = camera.get_frame()
    return frame is not None and frame.size > 0


class StereoCameraManager:
    """Manages left and right USB webcams for stereo capture."""

    def __init__(self):
        self.left: Optional[WebCamera] = None
        self.right: Optional[WebCamera] = None
        self.left_index, self.right_index = _env_indices()

    def _force_release(self) -> None:
        for cam in (self.left, self.right):
            if cam:
                try:
                    cam.stop()
                except Exception:
                    cam.stopped = True
                    cam.is_open = False
        self.left = None
        self.right = None
        time.sleep(0.3)

    def _open_pair(self, left_idx: int, right_idx: int) -> dict:
        """Open right before left — on Windows the first-opened device often loses its stream."""
        errors: dict = {}
        self._force_release()

        try:
            self.right = open_web_camera(right_idx)
        except Exception as exc:
            errors["right"] = str(exc)
            self.right = None
            logger.warning("Right camera (index %s) failed: %s", right_idx, exc)

        time.sleep(0.4)

        try:
            self.left = open_web_camera(left_idx)
        except Exception as exc:
            errors["left"] = str(exc)
            self.left = None
            logger.warning("Left camera (index %s) failed: %s", left_idx, exc)
            if self.right:
                self.right.stop()
                self.right = None

        return errors

    def _build_result(self, errors: dict | None = None) -> dict:
        errors = errors or {}
        left_ok = _camera_alive(self.left)
        right_ok = _camera_alive(self.right)
        return {
            "started": left_ok and right_ok,
            "left_index": self.left_index,
            "right_index": self.right_index,
            "left_connected": left_ok,
            "right_connected": right_ok,
            "errors": errors or None,
        }

    def start(self, *, allow_auto_index: bool = True) -> dict:
        if not _start_lock.acquire(timeout=_LOCK_TIMEOUT_SEC):
            return {
                "started": False,
                "error": "Camera system is busy. Click Stop Live Feed, wait a few seconds, then try again.",
            }
        try:
            return self._start_locked(allow_auto_index=allow_auto_index)
        finally:
            _start_lock.release()

    def _start_locked(self, *, allow_auto_index: bool = True) -> dict:
        self.left_index, self.right_index = _env_indices()

        if self.left_index == self.right_index:
            return {
                "started": False,
                "error": "Left and right camera indices must be different.",
                "left_index": self.left_index,
                "right_index": self.right_index,
            }

        logger.info("Starting stereo (left=%s, right=%s)", self.left_index, self.right_index)
        errors = self._open_pair(self.left_index, self.right_index)
        time.sleep(0.6)
        result = self._build_result(errors)

        if result["started"]:
            logger.info("Stereo start OK: %s", result)
            return result

        # One quick retry with indices swapped (labels stay left/right in UI).
        logger.info("Retrying with swapped indices (%s, %s)", self.right_index, self.left_index)
        self.left_index, self.right_index = self.right_index, self.left_index
        errors = self._open_pair(self.left_index, self.right_index)
        time.sleep(0.6)
        result = self._build_result(errors)
        result["auto_configured"] = True

        if result["started"]:
            logger.info("Stereo start OK (swapped): %s", result)
            return result

        result["error"] = "Failed to start both cameras."
        result["hint"] = (
            "Close Zoom/Teams/OBS. In backend/.env try CAMERA_LEFT_INDEX=2 and "
            "CAMERA_RIGHT_INDEX=1, then restart the backend."
        )
        if allow_auto_index:
            result["detected_indices"] = probe_camera_indices()
        return result

    def stop(self) -> dict:
        if not _start_lock.acquire(timeout=_LOCK_TIMEOUT_SEC):
            self._force_release()
            return {"stopped": True, "warning": "Forced release while camera lock was busy"}
        try:
            self._force_release()
            return {"stopped": True}
        finally:
            _start_lock.release()

    def status(self) -> dict:
        return {
            "active": self.left is not None
            and self.right is not None
            and self.left.is_open
            and self.right.is_open,
            "left_index": self.left_index,
            "right_index": self.right_index,
            "left_connected": self.left is not None and self.left.is_open,
            "right_connected": self.right is not None and self.right.is_open,
        }

    @staticmethod
    def list_available() -> dict:
        indices = probe_camera_indices()
        return {"available_indices": indices}
