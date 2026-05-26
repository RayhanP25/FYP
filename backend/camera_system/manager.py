import logging
import os
from typing import Optional

from .web_camera import WebCamera, open_web_camera, probe_camera_indices

logger = logging.getLogger(__name__)


class StereoCameraManager:
    """Manages left and right USB webcams for stereo capture."""

    def __init__(self):
        self.left: Optional[WebCamera] = None
        self.right: Optional[WebCamera] = None
        self.left_index = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
        self.right_index = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))

    def start(self, *, allow_auto_index: bool = True) -> dict:
        if self.left_index == self.right_index:
            return {
                "started": False,
                "error": "Left and right camera indices must be different.",
                "left_index": self.left_index,
                "right_index": self.right_index,
            }

        logger.info(
            "Starting stereo cameras (left=%s, right=%s)",
            self.left_index,
            self.right_index,
        )
        self.stop()
        errors = {}

        try:
            self.left = open_web_camera(self.left_index)
        except Exception as exc:
            errors["left"] = str(exc)
            self.left = None
            logger.warning("Left camera failed: %s", exc)

        try:
            self.right = open_web_camera(self.right_index)
        except Exception as exc:
            errors["right"] = str(exc)
            self.right = None
            logger.warning("Right camera failed: %s", exc)
            if self.left:
                self.left.stop()
                self.left = None

        started = self.left is not None and self.right is not None
        result = {
            "started": started,
            "left_index": self.left_index,
            "right_index": self.right_index,
            "left_connected": self.left is not None,
            "right_connected": self.right is not None,
        }

        available = probe_camera_indices()
        if not started:
            if len(available) < 2:
                result["error"] = (
                    f"Need two webcams but only found {len(available)} at index "
                    f"{available if available else 'none'}. Plug in both USB cameras "
                    "and close other apps using them."
                )
            elif errors:
                result["errors"] = errors
                result["hint"] = (
                    f"Detected indices: {available}. "
                    "Create backend/.env with CAMERA_LEFT_INDEX and CAMERA_RIGHT_INDEX."
                )
            if allow_auto_index and len(available) >= 2:
                pair = (available[0], available[1])
                if (self.left_index, self.right_index) != pair:
                    logger.info("Retrying with auto-detected indices %s", pair)
                    self.left_index, self.right_index = pair
                    retry = self.start(allow_auto_index=False)
                    retry["auto_configured"] = True
                    return retry
        elif errors:
            result["errors"] = errors

        if not started and "error" not in result:
            result["error"] = "Failed to start both cameras."

        logger.info("Stereo start result: %s", result)
        return result

    def stop(self) -> dict:
        if self.left:
            self.left.stop()
            self.left = None
        if self.right:
            self.right.stop()
            self.right = None
        return {"stopped": True}

    def status(self) -> dict:
        return {
            "active": self.left is not None and self.right is not None,
            "left_index": self.left_index,
            "right_index": self.right_index,
            "left_connected": self.left is not None and self.left.is_open,
            "right_connected": self.right is not None and self.right.is_open,
        }

    @staticmethod
    def list_available() -> dict:
        indices = probe_camera_indices()
        return {"available_indices": indices}
