"""
camera.py  -- native synchronized stereo capture (no OBS required)

Uses two USB webcams via CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX, or the left/right picked in the app
(Cameras dialog -> backend/camera_settings.json, which overrides .env on this PC).

Each camera has its OWN reader thread (so one slow read never blocks the other)
and publishes its latest frame with a capture timestamp. On Windows USB cameras
are opened with Media Foundation (CAP_MSMF): DirectShow ignored the MJPG request,
left the cameras in uncompressed YUY2 and capped them at ~10 fps (measured
2026-10-08 with cam_fps_test.py: DSHOW 10.2 fps, MSMF 30.0 fps per camera).
The recorder writes one frame per NEW left-camera frame (no wall-clock filler),
and the live preview is sent at a lower rate/size so it does not starve capture. Live preview = MJPEG in an
<img>. A recording is saved as two full-size MP4s (left and right camera, encoded on the GPU), kept on this PC
for the analysis and sent to cloud storage in the background, with a videos doc (layout "stereo_pair").
"""

import base64
import json
import os
import time
import asyncio
import threading
import tempfile
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import cv2
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

import background_upload
import calibration_store
import media_cache
import progress
import video_io
from database import client, database_name
from minio_client import BUCKET, minio_client
from pydantic import BaseModel

from routes.users import get_current_user, require_admin

router = APIRouter(prefix="/camera", tags=["camera"])

LEFT_INDEX = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
RIGHT_INDEX = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))
CAP_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAP_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
CAP_FPS = int(os.getenv("CAMERA_FPS", "30"))
OPEN_TIMEOUT = float(os.getenv("CAMERA_OPEN_TIMEOUT_SEC", "10"))
# Windows capture API for USB cameras: "msmf" (default, gets MJPG -> 30 fps) or "dshow"
CAMERA_API = os.getenv("CAMERA_API", "msmf").lower()
# Live preview: lower rate + size than the recording, so it doesn't steal CPU from capture
PREVIEW_FPS = float(os.getenv("PREVIEW_FPS", "30"))
PREVIEW_SCALE = float(os.getenv("PREVIEW_SCALE", "0.5"))
SCAN_MAX = int(os.getenv("CAMERA_SCAN_MAX", "6"))          # camera indices 0..SCAN_MAX-1 are tried by a scan

# Which camera is left / right, as picked in the app. Kept per PC (each has its own cameras), not in git.
SETTINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "camera_settings.json")


def _load_settings():
    global LEFT_INDEX, RIGHT_INDEX
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            d = json.load(f)
        LEFT_INDEX, RIGHT_INDEX = int(d["left"]), int(d["right"])
    except FileNotFoundError:
        pass
    except Exception as ex:
        print(f"camera: ignoring {SETTINGS_PATH} ({ex!r}); using CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX")


_load_settings()


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


def _open_source(index, timeout):
    box = {}

    def worker():
        if os.name == "nt":
            backend = cv2.CAP_DSHOW if CAMERA_API == "dshow" else cv2.CAP_MSMF
        else:
            backend = 0
        cap = cv2.VideoCapture(index, backend)
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


def _fail_msg(side, index):
    return (f"Could not open the {side} USB camera (index {index}). "
            f"Close OBS/Zoom/Teams, or pick the right cameras with the Cameras button.")


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
            # Open both cameras in parallel: MSMF opens can take 15-25s each on
            # Windows, so sequential opens can exceed the frontend's timeout.
            caps = {}

            def open_side(key, index):
                caps[key] = _open_source(index, OPEN_TIMEOUT)

            threads = [threading.Thread(target=open_side, args=("L", LEFT_INDEX), daemon=True),
                       threading.Thread(target=open_side, args=("R", RIGHT_INDEX), daemon=True)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            capL, capR = caps.get("L"), caps.get("R")
            if capL is None:
                if capR is not None:
                    capR.release()
                raise HTTPException(status_code=503, detail=_fail_msg("left", LEFT_INDEX))
            if capR is None:
                capL.release()
                raise HTTPException(status_code=503, detail=_fail_msg("right", RIGHT_INDEX))
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
    """Records in two stages so 2K stereo keeps up with the cameras.

    1. While recording, every NEW left-camera frame pair is saved as two JPEG stills by a small
       thread pool (JPEG encoding is fast and runs in parallel; OpenCV releases the GIL).
    2. On stop, the stills are put into the side-by-side MP4 at CAP_FPS. Real camera gaps
       (gap > 1.5 frame periods) are filled by repeating the previous frame so the duration stays
       correct; those repeats are counted (dup_frames) so a bad recording is visible.

    Encoding a 5120x1440 MP4 frame on the CPU is far slower than 30 fps, so doing it live (the old
    way) fell behind and filled the video with repeats (measured: 0.8 real fps at 2K). Now that cost
    is paid once after recording, and stop-recording takes a little longer instead."""

    MAX_PENDING = int(os.getenv("RECORD_MAX_PENDING", "90"))   # stills waiting to be written

    def __init__(self):
        self.active = False
        self.thread = None
        self.path = None
        self.frames = 0
        self.dup_frames = 0
        self.dropped = 0
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
        self.dir = tempfile.mkdtemp(prefix="rec_")
        self.stills = []                   # (timestamp, left jpg path, right jpg path), in capture order
        self.frames = self.dup_frames = self.dropped = 0
        self.real_fps = 0.0
        self.encoder = None
        self.active = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _save_pair(self, k, fL, fR):
        pL, pR = os.path.join(self.dir, f"{k:06d}_L.jpg"), os.path.join(self.dir, f"{k:06d}_R.jpg")
        cv2.imwrite(pL, fL, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(pR, fR, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return pL, pR

    def _capture_loop(self):
        pool = ThreadPoolExecutor(max_workers=int(os.getenv("RECORD_WORKERS", "4")))
        jobs = []
        last_seq = manager.get_latest()[3] - 1
        while self.active:
            pair = manager.get_latest()
            if pair is None or pair[3] == last_seq:
                time.sleep(0.002)                     # wait for the next real frame
                continue
            fL, fR, ts, seq = pair
            last_seq = seq
            if sum(not j.done() for _, j in jobs[-self.MAX_PENDING - 1:]) >= self.MAX_PENDING:
                self.dropped += 1                     # disk can't keep up: skip, gap gets filled later
                continue
            jobs.append((ts, pool.submit(self._save_pair, len(jobs), fL, fR)))
        pool.shutdown(wait=True)
        self.stills = [(ts, *j.result()) for ts, j in jobs]

    def _encode(self):
        """Write the stills into two MP4s, one per camera, at full size. Each is at most 2560 wide, so the GPU
        encoder (NVENC, max 4096) takes them; the two run at the same time. Real camera gaps are filled by
        repeating the previous still so the duration stays right."""
        if not self.stills:
            raise HTTPException(status_code=500, detail="No frames were recorded.")
        period = 1.0 / CAP_FPS
        start_ts = self.stills[0][0]
        repeats, written = [], 0                 # how many times each still is written
        for ts, _, _ in self.stills:
            target = int(round((ts - start_ts) / period)) + 1
            n = max(1, target - written) if target - written > 1.5 else 1
            repeats.append(n)
            written += n
        self.frames, self.dup_frames = written, written - len(self.stills)
        self.path = tempfile.mktemp(suffix="_L.mp4")
        self.path_right = tempfile.mktemp(suffix="_R.mp4")
        progress.stage("Preparing the video", total=2 * written)
        errors = []

        def ffmpeg_side(col, path):
            """FFmpeg reads the stills itself (a concat list with each still's duration, so gaps repeat the
            previous one) and encodes on the GPU: no frame passes through Python."""
            import subprocess
            exe = video_io.ffmpeg_exe()
            first = cv2.imread(self.stills[0][col])
            h, w = first.shape[:2]
            enc = video_io.pick_encoder(w, h)
            if not exe or not enc:
                return False
            lst = os.path.join(self.dir, f"list_{col}.txt")
            with open(lst, "w", encoding="utf-8") as f:
                for still, n in zip(self.stills, repeats):
                    f.write(f"file '{still[col].replace(chr(92), '/')}'\nduration {n * period:.6f}\n")
                f.write(f"file '{self.stills[-1][col].replace(chr(92), '/')}'\n")   # concat needs the last one twice
            cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
                   "-fps_mode", "cfr", "-r", str(CAP_FPS), "-frames:v", str(written),
                   "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", enc, *video_io._ENCODERS[enc],
                   "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", path]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            last = 0
            for line in proc.stdout:              # "frame=123" lines: progress for the page
                if line.startswith("frame="):
                    try:
                        n = int(line.split("=", 1)[1])
                        progress.add(n - last)
                        last = n
                    except ValueError:
                        pass
            err = proc.stderr.read()
            if proc.wait() != 0 or not os.path.exists(path):
                print(f"recording: ffmpeg could not write the video ({err[-300:]}); using the slower way")
                progress.add(-last)
                return False
            progress.add(written - last)
            self.encoder = enc
            return True

        def write_side(col, path):
            if ffmpeg_side(col, path):
                return
            writer = None                         # fallback: decode each still here and pipe it to the encoder
            try:
                for (still, n) in zip(self.stills, repeats):
                    img = cv2.imread(still[col])
                    if writer is None:
                        h, w = img.shape[:2]
                        writer = video_io.open_writer(path, w, h, CAP_FPS)
                        self.encoder = writer.encoder
                    for _ in range(n):
                        writer.write(img)
                    progress.add(n)
            except Exception as ex:
                errors.append(ex)
            finally:
                if writer is not None:
                    writer.release()

        threads = [threading.Thread(target=progress.wrap(write_side), args=(1, self.path)),
                   threading.Thread(target=progress.wrap(write_side), args=(2, self.path_right))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        shutil.rmtree(self.dir, ignore_errors=True)
        if errors:
            raise HTTPException(status_code=500, detail=f"Could not save the recording: {errors[0]}")
        self.real_fps = len(self.stills) / max(1e-6, self.frames / CAP_FPS)

    def stop(self):
        if not self.active:
            raise HTTPException(status_code=409, detail="Not recording.")
        self.active = False
        if self.thread:
            self.thread.join()
        self._encode()
        return self.path, self.path_right, self.frames


recorder = Recorder()


# ---- choosing which camera is left / right ----

class CameraSettings(BaseModel):
    left: int
    right: int


def _cameras_free():
    if recorder.active:
        raise HTTPException(status_code=409, detail="Stop the recording first.")
    if manager.running:
        raise HTTPException(status_code=409, detail="Stop the live feed (or end the calibration session) first.")


@router.get("/settings")
def get_settings(current_user: dict = Depends(get_current_user)):
    return dict(left=LEFT_INDEX, right=RIGHT_INDEX, width=CAP_WIDTH, height=CAP_HEIGHT,
                saved=os.path.exists(SETTINGS_PATH))


@router.put("/settings")
def put_settings(body: CameraSettings, current_user: dict = Depends(require_admin)):
    global LEFT_INDEX, RIGHT_INDEX
    if body.left == body.right:
        raise HTTPException(status_code=422, detail="Left and right must be different cameras.")
    if not (0 <= body.left < 64 and 0 <= body.right < 64):
        raise HTTPException(status_code=422, detail="Camera index out of range.")
    with manager.lock:
        _cameras_free()
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(dict(left=body.left, right=body.right), f)
        LEFT_INDEX, RIGHT_INDEX = body.left, body.right
    return get_settings(current_user)


_scan_lock = threading.Lock()


@router.post("/devices/scan")
def scan_devices(current_user: dict = Depends(require_admin)):
    """Open every camera index once: what size it really delivers, and a small snapshot to tell them apart."""
    if not _scan_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A scan is already running.")
    try:
        with manager.lock:                       # nobody starts the feed while the cameras are being probed
            _cameras_free()
            found = {}

            def probe(i):
                cap = _open_source(i, OPEN_TIMEOUT)
                if cap is None:
                    return
                try:
                    frame = None
                    for _ in range(5):           # a few frames so exposure settles and the size is final
                        ok, f = cap.read()
                        if ok:
                            frame = f
                    if frame is None:
                        return
                    h, w = frame.shape[:2]
                    thumb = cv2.resize(frame, (320, max(1, int(320 * h / w))), interpolation=cv2.INTER_AREA)
                    ok, jpg = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    found[i] = dict(index=i, width=w, height=h,
                                    preview="data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode() if ok else None)
                finally:
                    cap.release()

            threads = [threading.Thread(target=probe, args=(i,), daemon=True) for i in range(SCAN_MAX)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        return dict(devices=[found[i] for i in sorted(found)], left=LEFT_INDEX, right=RIGHT_INDEX,
                    width=CAP_WIDTH, height=CAP_HEIGHT)
    finally:
        _scan_lock.release()


@router.post("/start-feed")
def start_feed(current_user: dict = Depends(get_current_user)):
    manager.start()
    return {"status": "live", "mode": "USB", "fps": CAP_FPS}


@router.post("/stop-feed")
def stop_feed(current_user: dict = Depends(get_current_user)):
    if recorder.active:
        raise HTTPException(status_code=409, detail="Stop recording before stopping the feed.")
    manager.stop()
    return {"status": "idle"}


@router.get("/status")
def status(current_user: dict = Depends(get_current_user)):
    return {"live": manager.running, "recording": recorder.active,
            "mode": "USB", "fps": CAP_FPS}


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
def stop_recording(job: str = None, current_user: dict = Depends(get_current_user)):
    if job:
        progress.start(job, ["Preparing the video"])
    try:
        path, path_right, frames = recorder.stop()
    except Exception as ex:
        progress.finish(job, error=str(getattr(ex, "detail", ex)))
        raise
    dup_frames, real_fps = recorder.dup_frames, round(recorder.real_fps, 1)
    base = uuid.uuid4()
    object_name, object_name_right = f"stereo_{base}_L.mp4", f"stereo_{base}_R.mp4"
    cached = [media_cache.put(object_name, path, move=True), media_cache.put(object_name_right, path_right, move=True)]
    sizes = []
    for c, tmp in zip(cached, (path, path_right)):
        sizes.append(os.path.getsize(c or tmp) if os.path.exists(c or tmp) else 0)
    file_size = sum(sizes)

    now = datetime.now()
    friendly = f"Recording {now:%Y-%m-%d %H-%M-%S}.mp4"
    # NOTE: field names match routes/upload.py so this lists/plays like an upload
    doc = {
        "user_id": str(current_user["_id"]),
        "bucket_name": BUCKET,
        "object_name": object_name,
        "original_filename": friendly,
        "content_type": "video/mp4",
        "file_size": file_size,
        "uploaded_at": now,
        "source": "stereo_camera",
        "layout": "stereo_pair",            # object_name = left camera, object_name_right = right camera
        "object_name_right": object_name_right,
        "recorded_by": str(current_user["_id"]),
        "uploading": True,                  # set False once both files are in cloud storage
        "fps": CAP_FPS,
        "frames": frames,
        "dup_frames": dup_frames,      # frames repeated to fill real camera gaps
        "real_fps": real_fps,          # new images per second actually captured
        "dropped_frames": recorder.dropped,  # camera frames skipped because saving fell behind
    }
    try:                                   # which calibration this was filmed with (see calibration_store.py)
        cal = calibration_store.active()
        if cal:
            doc["calibration_id"], doc["calibration_setup"] = str(cal["_id"]), cal.get("setup")
    except Exception as ex:                # never lose a recording over this
        print(f"calibration library unavailable: {ex!r}")
    result = client[database_name]["videos"].insert_one(doc)
    files = [(object_name, cached[0] or path), (object_name_right, cached[1] or path_right)]
    background_upload.send(result.inserted_id, files)
    progress.finish(job)
    return {"status": "saved", "video_id": str(result.inserted_id),
            "object_name": object_name, "frames": frames,
            "dup_frames": dup_frames, "real_fps": real_fps,
            "dropped_frames": recorder.dropped, "encoder": recorder.encoder}