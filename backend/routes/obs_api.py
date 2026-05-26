# backend/routes/obs_api.py
import obsws_python as obs
from fastapi import APIRouter

router = APIRouter(prefix="/api/obs", tags=["OBS Integration"])

# Initialize OBS WebSocket Client
# Ensure OBS is running, WebSocket is enabled on port 4455, and the password matches
try:
    obs_client = obs.ReqClient(host='localhost', port=4455, password='fyp_password')
    print("Successfully connected to OBS WebSocket.")
except Exception as e:
    print(f"Warning: Could not connect to OBS. Is OBS running? Error: {e}")
    obs_client = None

@router.post("/start-recording")
def start_recording():
    if not obs_client:
        return {"error": "OBS is not connected."}
    try:
        obs_client.start_record()
        return {"message": "OBS recording started successfully."}
    except Exception as e:
        return {"error": str(e)}

@router.post("/stop-recording")
def stop_recording():
    if not obs_client:
        return {"error": "OBS is not connected."}
    try:
        response = obs_client.stop_record()
        # OBS returns the absolute path where the video was saved
        video_path = response.output_path
        
        # NOTE FOR SPRINT 2: Add your MinIO upload logic here using 'video_path'
        
        return {
            "message": "OBS recording stopped.",
            "file_saved_at": video_path
        }
    except Exception as e:
        return {"error": str(e)}