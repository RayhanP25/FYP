"""
calibration_store.py -- saved calibrations per setup (MongoDB collection "calibrations").

Every calibration is stored with its setup name (e.g. "NeuonAI", "Home Rig"), date, who made it, its
quality numbers and the calibration.npz itself. One entry is active: its file is backend/calibration.npz,
which analysis uses. Switching setups writes the chosen entry back to calibration.npz.

Recordings remember the calibration that was active when they were made (videos.calibration_id), so
re-analysing an old recording uses the setup it was filmed with, whichever one is active now.

calibration.npz written by other tools (stereo_calibrate.py in the terminal) is added to the library as
"Unassigned" the next time the library is read. The first time, the existing calibration.npz and its
calibration_backup_*.npz copies are imported too.
"""
import glob
import hashlib
import io
import json
import os
import tempfile
import threading
from datetime import datetime

import numpy as np
from bson import Binary, ObjectId

from database import client, database_name

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CALIB_PATH = os.path.join(BACKEND_DIR, "calibration.npz")
UNASSIGNED = "Unassigned"
_KEYS = ("K1", "D1", "K2", "D2", "R", "T", "R_level")      # what makes two calibrations the same
_lock = threading.Lock()

col = client[database_name]["calibrations"]


def _read(path):
    with open(path, "rb") as f:
        return f.read()


def _arrays(raw):
    d = np.load(io.BytesIO(raw))
    return {k: d[k] for k in d.files}


def _fingerprint(d):
    h = hashlib.sha256()
    for k in _KEYS:
        if k in d:
            h.update(k.encode())
            h.update(np.ascontiguousarray(d[k], np.float64).tobytes())
    return h.hexdigest()


def _meta(d):
    try:
        return json.loads(str(d["meta_json"])) if "meta_json" in d else {}
    except ValueError:
        return {}


def _summary(d):
    meta = _meta(d)
    num = lambda k, f=float: f(np.asarray(d[k]).item()) if k in d else None
    session = str(meta.get("session") or "")
    return dict(
        rms=num("rms"), square_mm=num("square_mm"), pairs=num("n_pairs", int),
        baseline_mm=round(float(np.linalg.norm(np.asarray(d["T"], float))), 1),
        camera_size=[int(v) for v in np.asarray(d["size1"]).ravel()[:2]],
        floor_set="R_level" in d,
        calibrated_at=meta.get("date"),
        session=os.path.basename(session.replace("\\", "/")) or None,
        report=meta.get("report", []), floor_report=meta.get("floor_report", []),
    )


def public(doc):
    """A library entry as sent to the page (without the file)."""
    if not doc:
        return None
    out = {k: v for k, v in doc.items() if k not in ("_id", "npz", "fingerprint")}
    out["id"] = str(doc["_id"])
    for k in ("created_at", "updated_at"):
        if isinstance(out.get(k), datetime):
            out[k] = out[k].isoformat(timespec="seconds")
    return out


def _insert(raw, setup, created_by=None, created_at=None, active=False):
    d = _arrays(raw)
    fp = _fingerprint(d)
    doc = col.find_one({"fingerprint": fp})
    if doc:
        return doc["_id"]
    now = datetime.now()
    return col.insert_one(dict(setup=setup or UNASSIGNED, created_by=created_by, created_at=created_at or now,
                               updated_at=now, fingerprint=fp, npz=Binary(raw), active=active,
                               **_summary(d))).inserted_id


def _set_active(_id):
    col.update_many({"_id": {"$ne": _id}, "active": True}, {"$set": {"active": False}})
    col.update_one({"_id": _id}, {"$set": {"active": True}})


def _import_existing():
    """First use: add calibration.npz and its backups, one entry per calibration session (the version in use,
    else the latest floor-levelled one, stands for its session)."""
    best = {}
    for p in glob.glob(os.path.join(BACKEND_DIR, "calibration_backup_*.npz")) + [CALIB_PATH]:
        try:
            raw = _read(p)
            d = _arrays(raw)
        except Exception:
            continue
        key = _meta(d).get("date") or _fingerprint(d)
        rank = (p == CALIB_PATH, "R_level" in d, os.path.getmtime(p))       # the file in use wins
        if key not in best or rank > best[key][0]:
            best[key] = (rank, raw, datetime.fromtimestamp(os.path.getmtime(p)))
    for _, raw, when in sorted(best.values(), key=lambda v: v[2]):
        _insert(raw, UNASSIGNED, created_at=when)


_synced = {}          # calibration.npz (mtime, size) -> entry id, so the page's 1 s status poll stays cheap


def sync():
    """Make the library agree with calibration.npz. Returns the active entry (or None if there is no file)."""
    with _lock:
        if not os.path.exists(CALIB_PATH):
            return col.find_one({"active": True}, {"npz": 0})
        st = os.stat(CALIB_PATH)
        key = (st.st_mtime_ns, st.st_size)
        if key in _synced:
            doc = col.find_one({"_id": _synced[key]}, {"npz": 0})
            if doc and doc.get("active"):
                return doc
        if col.estimated_document_count() == 0:
            _import_existing()
        raw = _read(CALIB_PATH)
        doc = col.find_one({"fingerprint": _fingerprint(_arrays(raw))}, {"npz": 0})
        _id = doc["_id"] if doc else _insert(raw, UNASSIGNED)
        if not (doc and doc.get("active")):
            _set_active(_id)
        _synced.clear()
        _synced[key] = _id
        return col.find_one({"_id": _id}, {"npz": 0})


def active():
    return sync()


def record_current(setup, created_by=None):
    """calibration.npz was just written by the Calibration page: store it under `setup` and make it active."""
    with _lock:
        raw = _read(CALIB_PATH)
        _id = _insert(raw, setup, created_by=created_by)
        col.update_one({"_id": _id}, {"$set": {"setup": setup or UNASSIGNED}})
        _set_active(_id)
        return _id


def update_current(_id):
    """calibration.npz of entry `_id` was changed (floor levelling): store the new file in that entry."""
    with _lock:
        raw = _read(CALIB_PATH)
        d = _arrays(raw)
        fp = _fingerprint(d)
        twin = col.find_one({"fingerprint": fp, "_id": {"$ne": _id}})
        if twin:                                   # same calibration already stored (e.g. auto-imported)
            col.delete_one({"_id": twin["_id"]})
        col.update_one({"_id": _id}, {"$set": dict(npz=Binary(raw), fingerprint=fp, updated_at=datetime.now(),
                                                   **_summary(d))})
        _set_active(_id)


def list_entries():
    """All entries, newest calibration first."""
    sync()
    entries = [public(d) for d in col.find({}, {"npz": 0})]
    return sorted(entries, key=lambda e: e.get("calibrated_at") or e.get("created_at") or "", reverse=True)


def setups():
    return sorted(s for s in col.distinct("setup") if s)


def activate(entry_id):
    """Make an entry the active calibration: write its file to calibration.npz."""
    if not ObjectId.is_valid(entry_id):
        return None
    with _lock:
        doc = col.find_one({"_id": ObjectId(entry_id)})
        if not doc:
            return None
        tmp = CALIB_PATH + ".tmp"
        with open(tmp, "wb") as f:
            f.write(bytes(doc["npz"]))
        os.replace(tmp, CALIB_PATH)
        _set_active(doc["_id"])
        return public(col.find_one({"_id": doc["_id"]}, {"npz": 0}))


def rename(entry_id, setup):
    if not ObjectId.is_valid(entry_id):
        return None
    col.update_one({"_id": ObjectId(entry_id)}, {"$set": {"setup": setup.strip() or UNASSIGNED,
                                                         "updated_at": datetime.now()}})
    return public(col.find_one({"_id": ObjectId(entry_id)}, {"npz": 0}))


def delete(entry_id):
    """Delete an entry. The active one can't be deleted (switch to another setup first)."""
    if not ObjectId.is_valid(entry_id):
        return False
    doc = col.find_one({"_id": ObjectId(entry_id)}, {"active": 1})
    if not doc:
        return False
    if doc.get("active"):
        raise ValueError("This is the active calibration. Switch to another one before deleting it.")
    col.delete_one({"_id": doc["_id"]})
    return True


def file_for(entry_id):
    """Path of a calibration file for analysis: calibration.npz if `entry_id` is missing, unknown or active,
    otherwise a temporary copy of that entry (second value True: the caller deletes it)."""
    doc = None
    if entry_id and ObjectId.is_valid(str(entry_id)):
        doc = col.find_one({"_id": ObjectId(str(entry_id))})
    if not doc or doc.get("active"):
        return CALIB_PATH, False, doc
    fd, path = tempfile.mkstemp(suffix="_calibration.npz")
    with os.fdopen(fd, "wb") as f:
        f.write(bytes(doc["npz"]))
    return path, True, doc
