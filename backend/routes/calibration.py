"""
calibration.py -- stereo calibration from the browser (admin only).

Same capture / calibrate / floor-level logic as stereo_calibrate.py, but driven by the buttons on the
Calibration page. It reuses the cameras already held by routes/camera.py, so the live feed and the
calibration never open USB cameras twice. Output is backend/calibration.npz, the file routes/pose.py
uses for stereo videos; each result is also saved in the calibration library (calibration_store.py)
under the setup name chosen when the session started, so setups can be switched later.

Calibrate and floor take a while, so they run in a background thread; the page polls /status until
`job` clears.

Every session keeps its photos in backend/calib_sessions/<date_time>/. /sessions lists them and
/sessions/{name}/resume opens one again (after a backend restart, or to recalibrate from old photos):
the board is found again in each photo ("loading" job), then Calibrate / Capture / Set floor work as usual.
"""

import glob
import json
import os
import re
import struct
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import calibration_store as store
import stereo_calibrate as sc
from routes.camera import manager, recorder
from routes.users import get_current_user, require_admin

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
        self.job = None          # "loading" | "calibrate" | "floor" while running in the background
        self.job_started = 0.0   # when the job started (time.time())
        self.job_step = ""       # which step of the job is running, for the page
        self.setup = None        # setup name the session's calibration is saved under
        self.entry_id = None     # library entry made by this session's calibrate
        self.message, self.message_t = "", 0.0


state = _State()
_capture_lock = threading.Lock()   # one Capture at a time; a second press is answered "busy" instead of queueing


@contextmanager
def _locked(timeout=3.0):
    """The shared lock, or a quick 409 if something holds it. Without the timeout a request waits silently
    (the page's buttons stay grey with no answer)."""
    if not state.lock.acquire(timeout=timeout):
        raise HTTPException(status_code=409, detail="The calibration is busy with another step. Try again in a moment.")
    try:
        yield
    finally:
        state.lock.release()


def _no_capture_running():
    if _capture_lock.locked():
        raise HTTPException(status_code=409, detail="A capture is still being checked. Try again in a second.")


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


def _check_camera_size(s):
    """A resumed session's photos fix its size: new captures / the floor must come from cameras at that size."""
    pair = manager.get_latest() if manager.running else None
    if pair is None:
        raise HTTPException(status_code=503, detail="The cameras are not delivering frames. Is the camera connected?")
    w, h = pair[0].shape[1], pair[0].shape[0]
    if (w, h) != tuple(s.sizeL):
        raise HTTPException(status_code=409, detail=(
            f"This session's photos are {s.sizeL[0]}x{s.sizeL[1]} but the cameras now deliver {w}x{h}. "
            f"Calibrate from the saved photos only, or start a new calibration."))


def _start_job(kind, fn):
    state.job, state.job_started, state.job_step = kind, time.time(), ""

    def work():
        try:
            done = fn()
            _say(done if isinstance(done, str) else f"{kind} finished -- see the report")
        except Exception as ex:
            _say(f"{kind} failed: {ex}")
        finally:
            state.job, state.job_step = None, ""
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
                job=state.job, job_step=state.job_step if state.job else "",
                job_seconds=round(time.time() - state.job_started) if state.job else None,
                message=state.message if time.time() - state.message_t < 6 else "")


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
    with _locked():
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
    with _locked():
        if state.job:
            raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")
        state.session, state.grab = None, None
        if not recorder.active:
            manager.stop()
    return {"status": "idle"}


@router.post("/capture")
def capture(current_user: dict = Depends(require_admin)):
    if not _capture_lock.acquire(blocking=False):
        return {"ok": False, "message": "Still checking the previous capture..."}
    try:
        with _locked():
            s = _active_session()
            _check_camera_size(s)
            grab = state.grab
        # Finding the board can take a moment at full resolution: done without the shared lock, so
        # Calibrate / Undo / End session still answer straight away.
        res, why = sc.capture_still(grab)
        if res is None:
            _say(why)
            return {"ok": False, "message": why}
        with _locked():
            if state.session is not s:
                return {"ok": False, "message": "The session was ended."}
            if state.job:
                return {"ok": False, "message": f"Not saved: '{state.job}' started meanwhile."}
            k = s.add(*res)
            msg = f"captured pair #{k} ({len(s.objpoints)} in total)"
            _say(msg)
        return {"ok": True, "message": msg}
    finally:
        _capture_lock.release()


@router.post("/undo")
def undo(current_user: dict = Depends(require_admin)):
    _no_capture_running()
    with _locked():
        s = _active_session()
        if not s.saved:
            raise HTTPException(status_code=409, detail="Nothing to undo in this session.")
        _say(f"undo -> {s.undo()} pairs")
    return {"ok": True, "message": state.message}


@router.post("/calibrate")
def calibrate(current_user: dict = Depends(require_admin)):
    _no_capture_running()
    with _locked():
        s = _active_session()
        if len(s.objpoints) < sc.MIN_PAIRS:
            raise HTTPException(status_code=409, detail=f"Need at least {sc.MIN_PAIRS} pairs (have {len(s.objpoints)}).")
        setup, user = state.setup, current_user.get("email")

        def run():
            s.calibrate(progress=lambda text: setattr(state, "job_step", text))
            state.job_step = "saving to the calibration library"
            state.entry_id = store.record_current(setup, created_by=user)
        _start_job("calibrate", run)
    return {"status": "running"}


@router.post("/floor")
def floor(current_user: dict = Depends(require_admin)):
    _no_capture_running()
    with _locked():
        s = _active_session()
        _check_camera_size(s)
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


# ---- earlier sessions (photos in calib_sessions/) ----

_SESSION_NAME = re.compile(r"^[\w\-]+$")


def _png_size(path):
    """(width, height) from a PNG header without decoding the image, or None."""
    try:
        with open(path, "rb") as f:
            head = f.read(24)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        return struct.unpack(">II", head[16:24])
    except OSError:
        return None


def _session_pairs(folder):
    return [p for p in sorted(glob.glob(os.path.join(folder, "pair_*_L.png"))) if os.path.exists(p[:-6] + "_R.png")]


def _session_folder(name):
    if not _SESSION_NAME.match(name or ""):
        raise HTTPException(status_code=400, detail="Bad session name.")
    folder = os.path.join(SESSIONS_DIR, name)
    if not os.path.isdir(folder):
        raise HTTPException(status_code=404, detail="Session not found.")
    return folder


def _session_date(name):
    for fmt in ("%Y-%m-%d_%H%M%S", "%Y-%m-%d_%H%M"):
        try:
            return datetime.strptime(name[:len(datetime.now().strftime(fmt))], fmt).isoformat(timespec="seconds")
        except ValueError:
            continue
    return None


@router.get("/sessions")
def list_sessions(current_user: dict = Depends(require_admin)):
    """Earlier sessions that still have photos, newest first, with the setups they were calibrated as."""
    calibrated = {}
    try:
        for e in store.list_entries():
            if e.get("session"):
                calibrated.setdefault(e["session"], [])
                if e.get("setup") not in calibrated[e["session"]]:
                    calibrated[e["session"]].append(e.get("setup"))
    except Exception as ex:                      # the library is optional here
        print(f"calibration library unavailable: {ex!r}")
    out = []
    if os.path.isdir(SESSIONS_DIR):
        for name in sorted(os.listdir(SESSIONS_DIR), reverse=True):
            folder = os.path.join(SESSIONS_DIR, name)
            if not os.path.isdir(folder) or not _SESSION_NAME.match(name):
                continue
            pairs = _session_pairs(folder)
            if not pairs:
                continue
            size = _png_size(pairs[0])
            out.append(dict(name=name, date=_session_date(name) or datetime.fromtimestamp(
                os.path.getmtime(folder)).isoformat(timespec="seconds"), pairs=len(pairs),
                floor_photos=os.path.exists(os.path.join(folder, "floor_L.png")),
                camera_size=list(size) if size else None,
                calibrated_as=calibrated.get(name, []),
                active=bool(state.session and os.path.normpath(state.session.folder) == os.path.normpath(folder))))
    return dict(sessions=out)


@router.post("/sessions/{name}/resume")
def resume_session(name: str, body: SessionStart = SessionStart(), current_user: dict = Depends(require_admin)):
    """Open an earlier session again: its photos are reloaded (the board is found in each one) in the background."""
    with _locked():
        if recorder.active:
            raise HTTPException(status_code=409, detail="Stop the camera recording first.")
        if state.job:
            raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")
        if state.session is not None:
            raise HTTPException(status_code=409, detail="End the current session first.")
        folder = _session_folder(name)
        pairs = _session_pairs(folder)
        size = _png_size(pairs[0]) if pairs else None
        if not size:
            raise HTTPException(status_code=409, detail="This session has no photo pairs.")
        try:                                     # cameras are only needed to add pairs or set the floor
            manager.start()
            _next_pair(timeout=5)
        except Exception as ex:
            print(f"calibration resume: cameras not started ({ex!r}); calibrating from the photos still works")
        s = sc.CalibrationSession(folder, tuple(size), tuple(size), out=CALIB_PATH, meta=dict(
            date=datetime.now().isoformat(timespec="seconds"), session=folder,
            board=list(sc.CHECKERBOARD), square_mm=sc.SQUARE_MM, source="web-resume", resumed=name))
        setup = body.setup.strip()
        if not setup:
            try:
                earlier = [e.get("setup") for e in store.list_entries() if e.get("session") == name]
                setup = next((x for x in earlier if x and x != store.UNASSIGNED), "")
            except Exception:
                setup = ""
        state.session, state.grab = s, _frame_source()
        state.setup = setup or store.UNASSIGNED
        state.entry_id = None

        def run():
            n = s.load_pairs()
            skipped = len(pairs) - n
            return (f"Loaded {n} pairs from {name}" + (f" ({skipped} without the board in both views skipped)" if skipped else "")
                    + ". Calibrate, or capture more pairs.")
        _start_job("loading", run)
        _say(f"Loading {len(pairs)} pairs from {name}...")
    return {"status": "loading", "pairs": len(pairs)}


# ---- calibration library: one entry per calibration, grouped by setup ----

class EntryUpdate(BaseModel):
    setup: str


def _no_job():
    if state.job:
        raise HTTPException(status_code=409, detail=f"Wait for '{state.job}' to finish.")


@router.get("/library")
def library(current_user: dict = Depends(require_admin)):
    return dict(entries=store.list_entries(), setups=store.setups())


OPTION_KEYS = ("id", "setup", "active", "calibrated_at", "created_at", "rms", "baseline_mm", "floor_set", "camera_size")


@router.get("/options")
def options(current_user: dict = Depends(get_current_user)):
    """The saved calibrations to pick from when re-analysing a recording (any signed-in user; no files)."""
    return dict(entries=[{k: e.get(k) for k in OPTION_KEYS} for e in store.list_entries()])


@router.post("/library/{entry_id}/activate")
def activate_entry(entry_id: str, current_user: dict = Depends(require_admin)):
    with _locked():
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
