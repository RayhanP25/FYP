"""
calibration.py -- stereo calibration from the browser (admin only).

Same capture / calibrate / floor-level logic as stereo_calibrate.py, but driven by the buttons on the
Calibration page. It reuses the cameras already held by routes/camera.py, so the live feed and the
calibration never open USB cameras twice. Output is backend/calibration.npz, the file routes/pose.py
uses for stereo videos; each result is also saved in the calibration library (calibration_store.py)
under the setup name chosen when the session started, so setups can be switched later.

Calibrate and floor take a while, so they run in a background thread; the page polls /status until
`job` clears.
"""

import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import calibration_store as store
import stereo_calibrate as sc
from routes.camera import manager, recorder
from routes.users import require_admin

router = APIRouter(prefix="/calibration", tags=["calibration"])

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CALIB_PATH = os.path.join(BACKEND_DIR, "calibration.npz")
SESSIONS_DIR = os.path.join(BACKEND_DIR, "calib_sessions")
PREVIEW_FPS = float(os.getenv("CALIB_PREVIEW_FPS", "30"))
AIM_PAIRS = 25


class _State:
    def __init__(self):
        self.lock = threading.Lock()
        self.session = None      # sc.CalibrationSession while a session is open
        self.grab = None         # frame source for the open session
        self.job = None          # "calibrate" | "floor" while running in the background
        self.setup = None        # setup name the session's calibration is saved under
        self.entry_id = None     # library entry made by this session's calibrate
        self.message, self.message_t = "", 0.0


state = _State()


def _say(text):
    state.message, state.message_t = text, time.time()


def _next_pair(seen=None, timeout=1.0):
    """Newest camera pair whose sequence number differs from `seen`, or None on timeout."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        pair = manager.get_latest()
        if pair is not None and pair[3] != seen:
            return pair
        time.sleep(0.005)
    return None


def _frame_source():
    """grab() for stereo_calibrate: returns only frames that arrived since the previous grab."""
    last = None

    def grab():
        nonlocal last
        pair = _next_pair(last)
        if pair is None:
            return None, None
        last = pair[3]
        return pair[0], pair[1]
    return grab


def _active_session():
    if recorder.active:
        raise HTTPException(status_code=409, detail="Stop the camera recording first.")
    if state.session is None:
        raise HTTPException(status_code=409, detail="Start a calibration session first.")
    if state.job:
        raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")
    return state.session


def _start_job(kind, fn):
    state.job = kind

    def work():
        try:
            fn()
            _say(f"{kind} finished -- see the report")
        except Exception as ex:
            _say(f"{kind} failed: {ex}")
        finally:
            state.job = None
    threading.Thread(target=work, daemon=True).start()


def _calibration_info():
    """Summary of the active calibration.npz (None if there is none yet)."""
    if not os.path.exists(CALIB_PATH):
        return None
    d = sc.load(CALIB_PATH)
    meta = json.loads(str(d["meta_json"])) if "meta_json" in d else {}
    info = dict(
        updated_at=datetime.fromtimestamp(os.path.getmtime(CALIB_PATH)).isoformat(timespec="seconds"),
        rms=float(d["rms"]), square_mm=float(d["square_mm"]), pairs=int(d["n_pairs"]),
        camera_size=[int(v) for v in np.asarray(d["size1"]).ravel()[:2]],
        floor_set="R_level" in d,
        baseline_mm=round(float(np.linalg.norm(np.asarray(d["T"], float))), 1),
        calibrated_at=meta.get("date"),
        report=meta.get("report", []), floor_report=meta.get("floor_report", []),
        id=None, setup=None,
    )
    if not state.job:                  # don't race the job that is writing calibration.npz
        try:
            doc = store.active()
            if doc:
                info.update(id=str(doc["_id"]), setup=doc.get("setup"))
        except Exception as ex:        # the library is optional for this page; report and carry on
            print(f"calibration library unavailable: {ex!r}")
    return info


def _session_info(s):
    lines, ok = s.cov.summary()
    return dict(folder=s.folder, pairs=len(s.objpoints), min_pairs=sc.MIN_PAIRS, aim_pairs=AIM_PAIRS,
                checks=[dict(text=t, ok=bool(g)) for t, g in zip(lines, ok.values())],
                saved=len(s.saved), camera_size=list(s.sizeL), setup=state.setup)


@router.get("/status")
def status(current_user: dict = Depends(require_admin)):
    pair = manager.get_latest() if manager.running else None
    camera_size = [pair[0].shape[1], pair[0].shape[0]] if pair is not None else None
    calib = _calibration_info()
    s = state.session
    size_mismatch = bool(calib and camera_size and calib["camera_size"] != camera_size)
    return dict(live=manager.running, recording=recorder.active, camera_size=camera_size,
                session=_session_info(s) if s else None, calibration=calib, size_mismatch=size_mismatch,
                job=state.job, message=state.message if time.time() - state.message_t < 6 else "")


class _BoardDetector:
    """Finds the board in the newest pair on a background thread, both views in parallel (OpenCV releases the GIL)."""
    def __init__(self):
        self.det = ((False, None), (False, None))
        self.running = True
        self.pool = ThreadPoolExecutor(max_workers=2)
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        seen = None
        while self.running and manager.running:
            pair = manager.get_latest()
            if pair is None or pair[3] == seen:
                time.sleep(0.01)
                continue
            seen = pair[3]
            jobs = [self.pool.submit(sc.find_corners, sc.gray(f), 0.33) for f in pair[:2]]
            self.det = tuple(j.result() for j in jobs)
        self.pool.shutdown(wait=False)

    def stop(self):
        self.running = False


def _preview_frames(s):
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
    interval = 1.0 / max(1.0, PREVIEW_FPS)
    detector = _BoardDetector()
    try:
        while manager.running and state.session is s:
            t0 = time.time()
            pair = manager.get_latest()
            if pair is None:
                time.sleep(0.03)
                continue
            msg = state.message if time.time() - state.message_t < 3 else ""
            img = sc.render_preview(pair[0], pair[1], s.cov, msg, det=detector.det)
            ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ok:
                yield boundary + jpg.tobytes() + b"\r\n"
            time.sleep(max(0.0, interval - (time.time() - t0)))
    finally:
        detector.stop()


@router.get("/preview")
def preview(current_user: dict = Depends(require_admin)):
    if state.session is None or not manager.running:
        raise HTTPException(status_code=409, detail="Start a calibration session first.")
    return StreamingResponse(_preview_frames(state.session),
                             media_type="multipart/x-mixed-replace; boundary=frame")


class SessionStart(BaseModel):
    setup: str = ""


@router.post("/session/start")
def start_session(body: SessionStart = SessionStart(), current_user: dict = Depends(require_admin)):
    with state.lock:
        if recorder.active:
            raise HTTPException(status_code=409, detail="Stop the camera recording first.")
        if state.session is not None:
            return {"status": "active"}
        manager.start()
        pair = _next_pair(timeout=5)
        if pair is None:
            raise HTTPException(status_code=503, detail="The cameras are not delivering frames yet. Try again.")
        (h, w), (hr, wr) = pair[0].shape[:2], pair[1].shape[:2]
        if (w, h) != (wr, hr):
            raise HTTPException(status_code=409, detail=(
                f"Left camera delivers {w}x{h} but right delivers {wr}x{hr}. Both must match for stereo "
                f"calibration -- set CAMERA_WIDTH/CAMERA_HEIGHT in backend/.env to a size both cameras "
                f"support (e.g. 1280x720 or 640x480) and restart the backend."))
        folder = os.path.join(SESSIONS_DIR, datetime.now().strftime("%Y-%m-%d_%H%M%S"))
        state.session = sc.CalibrationSession(folder, (w, h), (wr, hr), out=CALIB_PATH, meta=dict(
            date=datetime.now().isoformat(timespec="seconds"), session=folder,
            board=list(sc.CHECKERBOARD), square_mm=sc.SQUARE_MM, source="web"))
        state.grab = _frame_source()
        state.setup = body.setup.strip() or store.UNASSIGNED
        state.entry_id = None
        _say("Session started. Hold the board in both views and press Capture.")
    return {"status": "active"}


@router.post("/session/stop")
def stop_session(current_user: dict = Depends(require_admin)):
    with state.lock:
        if state.job:
            raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")
        state.session, state.grab = None, None
        if not recorder.active:
            manager.stop()
    return {"status": "idle"}


@router.post("/capture")
def capture(current_user: dict = Depends(require_admin)):
    with state.lock:
        s = _active_session()
        res, why = sc.capture_still(state.grab)
        if res is None:
            _say(why)
            return {"ok": False, "message": why}
        k = s.add(*res)
        msg = f"captured pair #{k} ({len(s.objpoints)} in total)"
        _say(msg)
    return {"ok": True, "message": msg}


@router.post("/undo")
def undo(current_user: dict = Depends(require_admin)):
    with state.lock:
        s = _active_session()
        if not s.saved:
            raise HTTPException(status_code=409, detail="Nothing to undo in this session.")
        _say(f"undo -> {s.undo()} pairs")
    return {"ok": True, "message": state.message}


@router.post("/calibrate")
def calibrate(current_user: dict = Depends(require_admin)):
    with state.lock:
        s = _active_session()
        if len(s.objpoints) < sc.MIN_PAIRS:
            raise HTTPException(status_code=409, detail=f"Need at least {sc.MIN_PAIRS} pairs (have {len(s.objpoints)}).")
        setup, user = state.setup, current_user.get("email")

        def run():
            s.calibrate()
            state.entry_id = store.record_current(setup, created_by=user)
        _start_job("calibrate", run)
    return {"status": "running"}


@router.post("/floor")
def floor(current_user: dict = Depends(require_admin)):
    with state.lock:
        s = _active_session()
        grab = state.grab
        # The floor is added to the active calibration: this session's, or the one in use before it.
        target = state.entry_id
        if target is None:
            doc = store.active()
            target = doc["_id"] if doc else None

        def run():
            s.set_floor(grab)
            if target is not None:
                store.update_current(target)
        _start_job("floor", run)
    return {"status": "running"}


# ---- calibration library: one entry per calibration, grouped by setup ----

class EntryUpdate(BaseModel):
    setup: str


def _no_job():
    if state.job:
        raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")


@router.get("/library")
def library(current_user: dict = Depends(require_admin)):
    return dict(entries=store.list_entries(), setups=store.setups())


@router.post("/library/{entry_id}/activate")
def activate_entry(entry_id: str, current_user: dict = Depends(require_admin)):
    with state.lock:
        _no_job()
        if recorder.active:
            raise HTTPException(status_code=409, detail="Stop the camera recording first.")
        entry = store.activate(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Calibration not found.")
    _say(f"Using the {entry['setup']} calibration.")
    return entry


@router.patch("/library/{entry_id}")
def rename_entry(entry_id: str, body: EntryUpdate, current_user: dict = Depends(require_admin)):
    entry = store.rename(entry_id, body.setup)
    if not entry:
        raise HTTPException(status_code=404, detail="Calibration not found.")
    return entry


@router.delete("/library/{entry_id}")
def delete_entry(entry_id: str, current_user: dict = Depends(require_admin)):
    _no_job()
    try:
        if not store.delete(entry_id):
            raise HTTPException(status_code=404, detail="Calibration not found.")
    except ValueError as ex:
        raise HTTPException(status_code=409, detail=str(ex))
    return {"status": "deleted"}
