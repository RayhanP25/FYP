import logging
import sys
import threading
import cv2
import numpy as np
from typing import List, Optional

from .base_camera import CameraStream

logger = logging.getLogger(__name__)

OPEN_TIMEOUT_SEC = float(__import__("os").getenv("CAMERA_OPEN_TIMEOUT_SEC", "10"))


def _capture_backends() -> List[int]:
    """Prefer MSMF on Windows — DSHOW often hangs on missing indices."""
    if sys.platform == "win32":
        return [cv2.CAP_MSMF, cv2.CAP_DSHOW, 0]
    return [0]


def open_capture(index: int):
    """Open VideoCapture, trying multiple backends."""
    last_cap = None
    for backend in _capture_backends():
        cap = cv2.VideoCapture(index, backend) if backend else cv2.VideoCapture(index)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            return cap
        cap.release()
        last_cap = cap
    if last_cap is not None:
        last_cap.release()
    return None


def _probe_index(index: int, timeout: float = 3.0) -> bool:
    result = {"ok": False}

    def worker():
        cap = open_capture(index)
        if cap is None:
            return
        ret, _ = cap.read()
        cap.release()
        result["ok"] = bool(ret)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    thread.join(timeout)
    return result["ok"]


def probe_camera_indices(max_index: int = 6) -> List[int]:
    """Return indices that can be opened and read within a short timeout."""
    available: List[int] = []
    for index in range(max_index):
        if _probe_index(index):
            available.append(index)
    return available


def open_web_camera(index: int, timeout: float = OPEN_TIMEOUT_SEC) -> "WebCamera":
    """Construct WebCamera in a worker thread so a bad index cannot hang the API."""
    box: dict = {}
    error: dict = {}

    def worker():
        try:
            box["camera"] = WebCamera(index)
        except Exception as exc:
            error["exc"] = exc

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    thread.join(timeout)

    if thread.is_alive():
        raise TimeoutError(
            f"Timed out after {timeout}s opening webcam index {index}. "
            "Close other apps using the camera or set CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX."
        )
    if "exc" in error:
        raise error["exc"]
    if "camera" not in box:
        raise RuntimeError(f"Failed to open webcam index {index}")
    return box["camera"]


class WebCamera(CameraStream):
    def __init__(self, index: int, width: int = 1280, height: int = 720):
        self.index = index
        self.cap = open_capture(index)

        if self.cap is None:
            raise ValueError(f"Could not open webcam at index {index}")

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        self.ret, self.frame = self.cap.read()
        if not self.ret or self.frame is None:
            self.cap.release()
            raise ValueError(f"Could not read from webcam at index {index}")

        self.stopped = False
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()
        logger.info("Webcam index %s opened (%sx%s)", index, width, height)

    def _update(self):
        while not self.stopped:
            ret, frame = self.cap.read()
            if ret:
                self.frame = frame

    def get_frame(self) -> np.ndarray:
        return self.frame

    def stop(self):
        self.stopped = True
        if self.thread.is_alive():
            self.thread.join(timeout=2.0)
        if self.cap.isOpened():
            self.cap.release()
        logger.info("Webcam index %s released", self.index)

    @property
    def is_open(self) -> bool:
        return self.cap.isOpened() and not self.stopped
