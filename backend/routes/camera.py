"""
camera.py  -- native synchronized stereo capture (no OBS required)

Supports two source modes (set CAMERA_MODE in backend/.env):
    CAMERA_MODE="WEB"  -> two phone/IP cameras via PHONE_1_IP / PHONE_2_IP
                          (e.g. DroidCam  http://<ip>:4747/video). Each phone is
                          its own WiFi stream, so there is no USB-bus contention.
    CAMERA_MODE="USB"  -> two USB webcams via CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX

One background thread grabs both sources back-to-back (grab()+grab() then
retrieve()+retrieve()) to minimise the L/R capture offset, and publishes the
latest synchronized (left, right, timestamp) pair. Live preview = MJPEG in an
<img>. Recording writes a side-by-side MP4, uploads to MinIO, makes a videos doc.
"""

import os
import time
import asyncio
import threading
import tempfile
import uuid
from datetime import datetime

import cv2
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from database import client, database_name
from minio_client import minio_client
from routes.users import get_current_user

router = APIRouter(prefix="/api/camera", tags=["camera"])

CAMERA_MODE = os.getenv("CAMERA_MODE", "USB").upper()
PHONE_1_IP = os.getenv("PHONE_1_IP", "")
PHONE_2_IP = os.getenv("PHONE_2_IP", "")
LEFT_INDEX = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
RIGHT_INDEX = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))
CAP_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAP_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
CAP_FPS = int(os.getenv("CAMERA_FPS", "30"))
OPEN_TIMEOUT = float(os.getenv("CAMERA_OPEN_TIMEOUT_SEC", "10"))
BUCKET = os.getenv("MINIO_BUCKET", "sport-pose-videos")


def _sources():
    if CAMERA_MODE == "WEB":
        if not PHONE_1_IP or not PHONE_2_IP:
            raise HTTPException(status_code=500,
                                detail="CAMERA_MODE=WEB but PHONE_1_IP / PHONE_2_IP are not set in .env")
        return PHONE_1_IP, PHONE_2_IP, "phone"
    return LEFT_INDEX, RIGHT_INDEX, "usb"


def _compose(fL, fR):
    if fL.shape[0] != fR.shape[0]:
        scale = fL.shape[0] / fR.shape[0]
        fR = cv2.resize(fR, (int(fR.shape[1] * scale), fL.shape[0]))
    return cv2.hconcat([fL, fR])


def _open_writer(path, w, h, fps):
    for codec in ("avc1", "mp4v"):
        wr = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*codec), fps, (w, h))
        if wr.isOpened():
            return wr
        wr.release()
    raise RuntimeError("No usable video codec (avc1/mp4v both failed)")


def _open_source(source, timeout):
    box = {}

    def worker():
        if isinstance(source, str):
            cap = cv2.VideoCapture(source)
        else:
            backend = cv2.CAP_DSHOW if os.name == "nt" else 0
            cap = cv2.VideoCapture(source, backend)
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAP_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAP_HEIGHT)
            cap.set(cv2.CAP_PROP_FPS, CAP_FPS)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        box["cap"] = cap

    th = threading.Thread(target=worker, daemon=True)
    th.start()
    th.join(timeout)
    if th.is_alive():
        return None
    cap = box.get("cap")
    if cap is None or not cap.isOpened():
        return None
    ok, _ = cap.read()
    if not ok:
        cap.release()
        return None
    return cap


def _fail_msg(side, source, label):
    if label == "phone":
        return (f"Could not connect to the {side} phone camera at {source}. "
                f"Make sure the DroidCam/IP-Webcam app is running, the phone is on the "
                f"same WiFi, and the URL opens in a browser. Then retry.")
    return (f"Could not open the {side} USB camera (index {source}). "
            f"Close OBS/Zoom/Teams, or fix CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX in .env.")


class StereoManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.capL = self.capR = None
        self.running = False
        self.thread = None
        self.latest = None
        self._lastL = None
        self._lastR = None

    def start(self):
        with self.lock:
            if self.running:
                return
            srcL, srcR, label = _sources()
            self.capL = _open_source(srcL, OPEN_TIMEOUT)
            if self.capL is None:
                raise HTTPException(status_code=503, detail=_fail_msg("left", srcL, label))
            self.capR = _open_source(srcR, OPEN_TIMEOUT)
            if self.capR is None:
                self.capL.release(); self.capL = None
                raise HTTPException(status_code=503, detail=_fail_msg("right", srcR, label))
            self.running = True
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()

    def _loop(self):
        # Sequential reads + last-good-frame caching. On a single shared USB bus
        # two cameras cannot be grabbed simultaneously, so we read them one after
        # another and keep the latest good frame from each side. Sync is therefore
        # software-level (a few ms apart), not hardware genlock.
        while self.running:
            okL, fL = self.capL.read()
            if okL:
                self._lastL = fL
            okR, fR = self.capR.read()
            if okR:
                self._lastR = fR
            ts = time.time()
            if self._lastL is not None and self._lastR is not None:
                with self.lock:
                    self.latest = (self._lastL, self._lastR, ts)
            else:
                time.sleep(0.01)

    def get_latest(self):
        with self.lock:
            return self.latest

    def stop(self):
        with self.lock:
            self.running = False
        if self.thread:
            self.thread.join(timeout=1.5)
        with self.lock:
            if self.capL:
                self.capL.release()
            if self.capR:
                self.capR.release()
            self.capL = self.capR = None
            self.latest = None
            self._lastL = None
            self._lastR = None


manager = StereoManager()


class Recorder:
    def __init__(self):
        self.active = False
        self.thread = None
        self.path = None
        self.frames = 0

    def start(self):
        if self.active:
            return
        if manager.get_latest() is None:
            raise HTTPException(status_code=409, detail="Feed not ready. Start the live feed first.")
        self.path = tempfile.mktemp(suffix="_stereo.mp4")
        self.frames = 0
        self.active = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        pair = manager.get_latest()
        combo = _compose(pair[0], pair[1])
        h, w = combo.shape[:2]
        writer = _open_writer(self.path, w, h, CAP_FPS)
        interval = 1.0 / CAP_FPS
        next_t = time.time()
        while self.active:
            pair = manager.get_latest()
            if pair is not None:
                writer.write(_compose(pair[0], pair[1]))
                self.frames += 1
            next_t += interval
            sleep = next_t - time.time()
            if sleep > 0:
                time.sleep(sleep)
            else:
                next_t = time.time()
        writer.release()

    def stop(self):
        if not self.active:
            raise HTTPException(status_code=409, detail="Not recording.")
        self.active = False
        if self.thread:
            self.thread.join(timeout=3)
        return self.path, self.frames


recorder = Recorder()


@router.post("/start-feed")
def start_feed(current_user: dict = Depends(get_current_user)):
    manager.start()
    return {"status": "live", "mode": CAMERA_MODE, "fps": CAP_FPS}


@router.post("/stop-feed")
def stop_feed(current_user: dict = Depends(get_current_user)):
    if recorder.active:
        raise HTTPException(status_code=409, detail="Stop recording before stopping the feed.")
    manager.stop()
    return {"status": "idle"}


@router.get("/status")
def status(current_user: dict = Depends(get_current_user)):
    return {"live": manager.running, "recording": recorder.active,
            "mode": CAMERA_MODE, "fps": CAP_FPS}


async def _mjpeg_generator():
    # ASYNC generator: never blocks the event loop, is cancellable, and lets
    # the server shut down / reload cleanly even while a preview is open.
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
    interval = 1.0 / CAP_FPS
    while manager.running:
        pair = manager.get_latest()
        if pair is None:
            await asyncio.sleep(0.03)
            continue
        ok, jpg = cv2.imencode(".jpg", _compose(pair[0], pair[1]),
                               [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            yield boundary + jpg.tobytes() + b"\r\n"
        await asyncio.sleep(interval)


@router.get("/stream")
def stream():
    if not manager.running:
        raise HTTPException(status_code=409, detail="Feed not started.")
    return StreamingResponse(_mjpeg_generator(),
                             media_type="multipart/x-mixed-replace; boundary=frame")


@router.post("/start-recording")
def start_recording(current_user: dict = Depends(get_current_user)):
    if not manager.running:
        manager.start()
    recorder.start()
    return {"status": "recording"}


@router.post("/stop-recording")
def stop_recording(current_user: dict = Depends(get_current_user)):
    path, frames = recorder.stop()
    object_name = f"stereo_{uuid.uuid4()}.mp4"
    file_size = os.path.getsize(path) if os.path.exists(path) else 0
    try:
        with open(path, "rb") as f:
            minio_client.put_object(bucket_name=BUCKET, object_name=object_name,
                                    data=f, length=-1, part_size=10 * 1024 * 1024,
                                    content_type="video/mp4")
    finally:
        if os.path.exists(path):
            os.unlink(path)

    now = datetime.now()
    friendly = f"Stereo recording {now:%Y-%m-%d %H-%M-%S}.mp4"
    # NOTE: field names match routes/upload.py so this lists/plays like an upload
    doc = {
        "user_id": str(current_user["_id"]),
        "bucket_name": BUCKET,
        "object_name": object_name,
        "original_filename": friendly,
        "content_type": "video/mp4",
        "file_size": file_size,
        "uploaded_at": now,
        # extra metadata (safe to keep)
        "source": "stereo_camera",
        "layout": "side_by_side",
        "fps": CAP_FPS,
        "frames": frames,
    }
    result = client[database_name]["videos"].insert_one(doc)
    return {"status": "saved", "video_id": str(result.inserted_id),
            "object_name": object_name, "frames": frames}
