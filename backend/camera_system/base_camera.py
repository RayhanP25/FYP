# backend/camera_system/base_camera.py
from abc import ABC, abstractmethod
import numpy as np

class CameraStream(ABC):
    """
    The blueprint for all camera inputs. 
    Every new camera type MUST implement these methods.
    """
    
    @abstractmethod
    def get_frame(self) -> np.ndarray:
        """Grabs the latest frame from the camera."""
        pass

    @abstractmethod
    def stop(self):
        """Safely shuts down the camera connection."""
        pass