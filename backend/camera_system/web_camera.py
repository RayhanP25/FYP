import cv2
import threading
import numpy as np
from typing import List

from .base_camera import CameraStream


def probe_camera_indices(max_index: int = 10) -> List[int]:
    """Return indices that OpenCV can open and read at least one frame from."""
    available: List[int] = []
    for index in range(max_index):
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(index)
        if not cap.isOpened():
            continue
        ret, _ = cap.read()
        cap.release()
        if ret:
            available.append(index)
    return available


class WebCamera(CameraStream):
    def __init__(self, index: int, width: int = 1280, height: int = 720):
        self.index = index
        self.cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(index)

        if not self.cap.isOpened():
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

    @property
    def is_open(self) -> bool:
        return self.cap.isOpened() and not self.stopped
