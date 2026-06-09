import logging
import os
import sys
import threading
from typing import List

import cv2
import numpy as np

from .base_camera import CameraStream

logger = logging.getLogger(__name__)

OPEN_TIMEOUT_SEC = float(os.getenv("CAMERA_OPEN_TIMEOUT_SEC", "5"))
OPEN_TIMEOUT_MS = int(os.getenv("CAMERA_OPEN_TIMEOUT_MS", "3000"))


def _capture_backends() -> List[int]:
    """Prefer DSHOW on Windows — MSMF can remap indices (e.g. index 1 → built-in cam)."""
    if sys.platform == "win32":
        return [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    return [cv2.CAP_ANY]


def open_capture(index: int):
    for backend in _capture_backends():
        try:
            cap = cv2.VideoCapture(index, backend)
            if sys.platform == "win32" and backend == cv2.CAP_DSHOW:
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, OPEN_TIMEOUT_MS)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
            cap.release()
        except Exception:
            continue
    return None


def _probe_index(index: int, timeout: float = 1.5) -> bool:
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


def probe_camera_indices(max_index: int = 4) -> List[int]:
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
    def __init__(self, index: int, width: int = 640, height: int = 480):
        self.index = index
        self.cap = open_capture(index)
        if self.cap is None:
            raise ValueError(f"Could not open webcam at index {index}")

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        self.ret, self.frame = self.cap.read()
        if not self.ret or self.frame is None:
            self.cap.release()
            raise ValueError(f"Could not read from webcam index {index}")

        self.stopped = False
        self.is_open = True
        self._frame_lock = threading.Lock()
        self._read_failures = 0
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()
        h, w = self.frame.shape[:2]
        logger.info("Webcam index %s opened (%sx%s), actual frame %sx%s", index, width, height, w, h)

    def _update(self):
        while not self.stopped and self.is_open:
            ret, frame = self.cap.read()
            if ret and frame is not None:
                with self._frame_lock:
                    self.frame = frame
                self._read_failures = 0
            else:
                self._read_failures += 1
                if self._read_failures >= 30:
                    self.is_open = False
                    break

    def get_frame(self) -> np.ndarray | None:
        if not self.is_open:
            return None
        with self._frame_lock:
            return None if self.frame is None else self.frame.copy()

    def stop(self):
        self.stopped = True
        self.is_open = False
        if self.thread.is_alive():
            self.thread.join(timeout=0.5)
        try:
            if self.cap is not None:
                self.cap.release()
        except Exception:
            pass
        self.cap = None
        logger.info("Webcam index %s released", self.index)
