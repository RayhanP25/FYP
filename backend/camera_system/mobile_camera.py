# backend/camera_system/mobile_camera.py
import cv2
import threading
import numpy as np
from .base_camera import CameraStream

class MobileCamera(CameraStream):
    def __init__(self, ip_url: str):
        self.url = ip_url
        self.capture = cv2.VideoCapture(self.url)
        
        if not self.capture.isOpened():
            raise ValueError(f"Could not connect to camera at {self.url}")
            
        self.ret, self.frame = self.capture.read()
        self.stopped = False
        
        # Start the background thread
        self.thread = threading.Thread(target=self._update, args=())
        self.thread.daemon = True
        self.thread.start()

    def _update(self):
        """Constantly pulls the newest frame in the background."""
        while not self.stopped:
            ret, frame = self.capture.read()
            if ret:
                self.frame = frame

    def get_frame(self) -> np.ndarray:
        """Returns the most recent frame."""
        return self.frame

    def stop(self):
        """Stops the thread and releases the camera."""
        self.stopped = True
        self.thread.join()
        self.capture.release()