import urllib.request

def download_pose_model():
    """Download MediaPipe pose landmarker model."""
    url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
    
    try:
        print("Downloading MediaPipe pose landmarker model...")
        urllib.request.urlretrieve(url, "pose_landmarker.task")
        print("Model downloaded successfully!")
        return True
    except Exception as e:
        print(f"Failed to download model: {e}")
        return False

if __name__ == "__main__":
    download_pose_model()
