"""
camera.py  -- native synchronized stereo capture (no OBS required)

Supports two source modes (set CAMERA_MODE in backend/.env):
    CAMERA_MODE="WEB"  -> two phone/IP cameras via PHONE_1_IP / PHONE_2_IP
                          (e.g. DroidCam  http://<ip>:4747/video). Each phone is
                          its own WiFi stream, so there is no USB-bus contention.
    CAMERA_MODE="USB"  -> two USB webcams via CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX

Each camera has its OWN reader thread (so one slow read never blocks the other)
and publishes its latest frame with a capture timestamp. On Windows USB cameras
are opened with Media Foundation (CAP_MSMF): DirectShow ignored the MJPG request,
left the cameras in uncompressed YUY2 and capped them at ~10 fps (measured
2026-10-08 with cam_fps_test.py: DSHOW 10.2 fps, MSMF 30.0 fps per camera).
The recorder writes one frame per NEW left-camera frame (no wall-clock filler),
and the live preview is sent at a lower rate/size so it does not starve capture. Live preview = MJPEG in an
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

router = APIRouter(prefix="/camera", tags=["camera"])

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
# Windows capture API for USB cameras: "msmf" (default, gets MJPG -> 30 fps) or "dshow"
CAMERA_API = os.getenv("CAMERA_API", "msmf").lower()
# Live preview: lower rate + size than the recording, so it doesn't steal CPU from capture
PREVIEW_FPS = float(os.getenv("PREVIEW_FPS", "15"))
PREVIEW_SCALE = float(os.getenv("PREVIEW_SCALE", "0.5"))


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
            if os.name == "nt":
                backend = cv2.CAP_DSHOW if CAMERA_API == "dshow" else cv2.CAP_MSMF
            else:
                backend = 0
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
        # The open is still blocked inside cv2. Reap it in the background so the
        # camera is released once the call finally returns instead of being held
        # forever by this abandoned thread.
        def reaper():
            th.join()
            cap = box.get("cap")
            if cap is not None:
                cap.release()
        threading.Thread(target=reaper, daemon=True).start()
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


class _CamReader:
    """One thread per camera: keeps reading as fast as the camera delivers and
    stores the newest frame + its capture time + a sequence number."""

    def __init__(self, cap, name):
        self.cap, self.name = cap, name
        self.lock = threading.Lock()
        self.frame, self.ts, self.seq = None, 0.0, 0
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while self.running:
            ok, f = self.cap.read()
            if not ok:
                time.sleep(0.005)
                continue
            ts = time.time()
            with self.lock:
                self.frame, self.ts, self.seq = f, ts, self.seq + 1

    def get(self):
        with self.lock:
            return self.frame, self.ts, self.seq

    def stop(self):
        self.running = False
        self.thread.join(timeout=1.5)
        self.cap.release()


class StereoManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.readerL = self.readerR = None
        self.running = False

    def start(self):
        with self.lock:
            if self.running:
                return
            srcL, srcR, label = _sources()
            # Open both cameras in parallel: MSMF opens can take 15-25s each on
            # Windows, so sequential opens can exceed the frontend's timeout.
            caps = {}

            def open_side(key, src):
                caps[key] = _open_source(src, OPEN_TIMEOUT)

            threads = [threading.Thread(target=open_side, args=("L", srcL), daemon=True),
                       threading.Thread(target=open_side, args=("R", srcR), daemon=True)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            capL, capR = caps.get("L"), caps.get("R")
            if capL is None:
                if capR is not None:
                    capR.release()
                raise HTTPException(status_code=503, detail=_fail_msg("left", srcL, label))
            if capR is None:
                capL.release()
                raise HTTPException(status_code=503, detail=_fail_msg("right", srcR, label))
            self.readerL = _CamReader(capL, "left")
            self.readerR = _CamReader(capR, "right")
            self.running = True

    def get_latest(self):
        """(left, right, ts_left, seq_left) or None until both cameras delivered a frame."""
        if not self.running:
            return None
        fL, tL, sL = self.readerL.get()
        fR, _, _ = self.readerR.get()
        if fL is None or fR is None:
            return None
        return fL, fR, tL, sL

    def stop(self):
        with self.lock:
            self.running = False
            for r in (self.readerL, self.readerR):
                if r is not None:
                    r.stop()
            self.readerL = self.readerR = None


manager = StereoManager()


class Recorder:
    """Writes one side-by-side frame for every NEW left-camera frame.
    If the camera really skipped frames (gap > 1.5 frame periods) the last frame is
    repeated to keep the video's duration correct; those repeats are counted
    (dup_frames) so a bad recording is visible instead of hidden."""

    def __init__(self):
        self.active = False
        self.thread = None
        self.path = None
        self.frames = 0
        self.dup_frames = 0
        self.real_fps = 0.0

    def start(self):
        if self.active:
            return
        t0 = time.time()
        while manager.get_latest() is None and time.time() - t0 < 3:
            time.sleep(0.05)
        if manager.get_latest() is None:
            raise HTTPException(status_code=409, detail="Feed not ready. Start the live feed first.")
        self.path = tempfile.mktemp(suffix="_stereo.mp4")
        self.frames = self.dup_frames = 0
        self.real_fps = 0.0
        self.active = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        fL, fR, ts, seq = manager.get_latest()
        combo = _compose(fL, fR)
        h, w = combo.shape[:2]
        writer = _open_writer(self.path, w, h, CAP_FPS)
        period = 1.0 / CAP_FPS
        start_ts, last_seq, real = ts, seq - 1, 0
        while self.active:
            pair = manager.get_latest()
            if pair is None or pair[3] == last_seq:
                time.sleep(0.002)                     # wait for the next real frame
                continue
            fL, fR, ts, seq = pair
            last_seq = seq
            combo = _compose(fL, fR)
            # frames this timestamp should be at; fill only genuine camera gaps
            target = int(round((ts - start_ts) / period)) + 1
            n = max(1, target - self.frames) if target - self.frames > 1.5 else 1
            for _ in range(n):
                writer.write(combo)
            self.frames += n
            self.dup_frames += n - 1
            real += 1
        writer.release()
        dur = max(1e-6, self.frames / CAP_FPS)
        self.real_fps = real / dur

    def stop(self):
        if not self.active:
            raise HTTPException(status_code=409, detail="Not recording.")
        self.active = False
        if self.thread:
            self.thread.join(timeout=5)
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
    # Sent at PREVIEW_FPS and PREVIEW_SCALE (default 15 fps, half size) so the
    # preview does not compete with capture/recording for CPU.
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
    interval = 1.0 / max(1.0, PREVIEW_FPS)
    while manager.running:
        pair = manager.get_latest()
        if pair is None:
            await asyncio.sleep(0.03)
            continue
        img = _compose(pair[0], pair[1])
        if PREVIEW_SCALE != 1.0:
            img = cv2.resize(img, None, fx=PREVIEW_SCALE, fy=PREVIEW_SCALE, interpolation=cv2.INTER_AREA)
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
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
    dup_frames, real_fps = recorder.dup_frames, round(recorder.real_fps, 1)
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
        "dup_frames": dup_frames,      # frames repeated to fill real camera gaps
        "real_fps": real_fps,          # new images per second actually captured
    }
    result = client[database_name]["videos"].insert_one(doc)
    return {"status": "saved", "video_id": str(result.inserted_id),
            "object_name": object_name, "frames": frames,
            "dup_frames": dup_frames, "real_fps": real_fps}