import os
from typing import Optional

from .web_camera import WebCamera, probe_camera_indices


class StereoCameraManager:
    """Manages left and right USB webcams for stereo capture."""

    def __init__(self):
        self.left: Optional[WebCamera] = None
        self.right: Optional[WebCamera] = None
        self.left_index = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
        self.right_index = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))

    def start(self) -> dict:
        if self.left_index == self.right_index:
            return {
                "started": False,
                "error": "Left and right camera indices must be different.",
                "left_index": self.left_index,
                "right_index": self.right_index,
            }

        self.stop()
        errors = {}

        try:
            self.left = WebCamera(self.left_index)
        except Exception as exc:
            errors["left"] = str(exc)
            self.left = None

        try:
            self.right = WebCamera(self.right_index)
        except Exception as exc:
            errors["right"] = str(exc)
            self.right = None
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
        if errors:
            result["errors"] = errors
        if not started and not errors:
            result["error"] = "Failed to start both cameras."
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
