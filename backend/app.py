from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import client, database_name
from routes import users, ping, upload, pose, camera, calibration, dashboard, edits, account

'''cd .venv/Scripts
 .\Activate.ps1
 cd ../..
 uvicorn app:app --host 0.0.0.0 --port 8000 --reload'''

app = FastAPI()

db = client[database_name]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the page read a download's file name (otherwise the browser hides this header from it).
    expose_headers=["Content-Disposition"],
)

app.include_router(ping.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(pose.router, prefix="/api")
app.include_router(camera.router, prefix="/api")
app.include_router(calibration.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(edits.router, prefix="/api")
app.include_router(account.router, prefix="/api")


@app.get("/api/progress/{key}")
def get_progress(key: str, current_user: dict = Depends(users.get_current_user)):
    """How far a long job is (saving a recording, an upload, an analysis, a download). See progress.py."""
    import progress
    p = progress.get(key)
    if p is None:
        raise HTTPException(status_code=404, detail="No such job (yet)")
    return p


@app.on_event("startup")
def _report_video_backend():
    # Probes NVENC / libx264 once and logs which one this machine will use.
    import threading, video_io
    threading.Thread(target=lambda: print(video_io.describe()), daemon=True).start()
    # Videos whose upload to cloud storage was cut off (server stopped) are sent again.
    import background_upload
    threading.Thread(target=background_upload.resume_pending, daemon=True).start()
