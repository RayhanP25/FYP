"""
edits.py -- manual keypoint corrections for an analysis (see keypoint_edits.py for how they apply).

    GET    /api/analysis/{video_id}/edits      the edits, whether this user may edit, and the calibration
                                               (for drawing edits on both camera videos while dragging)
    PUT    /api/analysis/{video_id}/edits      save edits: {"edits": [{frame, joint, target, value}, ...]}
    DELETE /api/analysis/{video_id}/edits      revert: ?frame=&joint= for one, nothing for all

Admins, coaches and athletes can edit the analyses they can open. Stored in "keypoint_edits",
one per video, frame and joint (the newest wins).
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import calibration_store
import keypoint_edits
from access import can_access_analysis
from database import client, database_name
from routes.users import get_current_user
from triangulate import load_calibration

router = APIRouter(prefix="/analysis", tags=["edits"])
db = client[database_name]
edits_col = db["keypoint_edits"]
EDITOR_ROLES = ("admin", "coach", "athlete")
CALIB_KEYS = ("K1", "D1", "K2", "D2", "R", "T", "R_level", "size1", "size2")

try:
    edits_col.create_index([("video_id", 1), ("frame", 1), ("joint", 1)], unique=True)
except Exception as ex:                       # the API still works without the index
    print(f"keypoint_edits index: {ex!r}")


class Edit(BaseModel):
    frame: int = Field(ge=0)
    joint: int = Field(ge=0, lt=keypoint_edits.NUM_KEYPOINTS)
    target: str                               # "3d" | "left" | "right"
    value: List[float]


class EditBatch(BaseModel):
    edits: List[Edit]


def _analysis(video_id, user):
    """The analysis if this user can open it (as GET /api/get-analysis: their own; admins any)."""
    doc = db["pose_analysis"].find_one({"video_id": video_id}, {"result.mode": 1, "result.total_frames": 1,
                                                                "calibration_id": 1, "user_id": 1})
    if not doc or not can_access_analysis(user, doc):
        raise HTTPException(status_code=404, detail="No analysis found for this video")
    return doc


def _require_editor(user):
    if user.get("role") not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins, coaches and athletes can edit keypoints.")


def calibration_for(analysis_doc):
    """Calibration arrays of the calibration this analysis used (else the active one)."""
    path, is_temp, _ = calibration_store.file_for(analysis_doc.get("calibration_id"))
    try:
        return load_calibration(path)
    finally:
        if is_temp:
            import os
            os.unlink(path)


def edits_for(video_id):
    return list(edits_col.find({"video_id": video_id}, {"_id": 0}))


def apply_to(analysis_doc, result):
    """`result` with this video's edits applied (unchanged when there are none)."""
    edits = edits_for(analysis_doc["video_id"])
    if not edits or (result or {}).get("mode") != "stereo_3d":
        return result
    from stereo_process import ANGLE_TRIPLETS
    from triangulate import angle_3d
    from pose_estimator import calculate_frame_angles
    return keypoint_edits.apply_edits(result, edits, calibration_for(analysis_doc),
                                      ANGLE_TRIPLETS, angle_3d, calculate_frame_angles)


def _public(e):
    return dict(frame=e["frame"], joint=e["joint"], target=e["target"], value=e["value"],
                author=e.get("author_name"), created_at=e["created_at"].isoformat(timespec="seconds")
                if isinstance(e.get("created_at"), datetime) else e.get("created_at"))


@router.get("/{video_id}/edits")
def get_edits(video_id: str, current_user: dict = Depends(get_current_user)):
    doc = _analysis(video_id, current_user)
    stereo = (doc.get("result") or {}).get("mode") == "stereo_3d"
    calib = None
    if stereo:
        c = calibration_for(doc)
        calib = {k: c[k].tolist() for k in CALIB_KEYS if k in c}
    return dict(edits=[_public(e) for e in edits_for(video_id)],
                can_edit=stereo and current_user.get("role") in EDITOR_ROLES,
                stereo=stereo, calibration=calib,
                fade_frames=keypoint_edits.FADE, keyframe_gap=keypoint_edits.KEYFRAME_GAP)


@router.put("/{video_id}/edits")
def save_edits(video_id: str, body: EditBatch, current_user: dict = Depends(get_current_user)):
    _require_editor(current_user)
    doc = _analysis(video_id, current_user)
    if (doc.get("result") or {}).get("mode") != "stereo_3d":
        raise HTTPException(status_code=409, detail="Keypoint editing needs a stereo 3D analysis.")
    n = (doc.get("result") or {}).get("total_frames") or 0
    now = datetime.now()
    saved = 0
    for e in body.edits:
        want = 3 if e.target == "3d" else 2
        if e.target not in keypoint_edits.TARGETS or len(e.value) < want or (n and e.frame >= n):
            raise HTTPException(status_code=422, detail=f"Bad edit for frame {e.frame}, joint {e.joint}.")
        edits_col.replace_one(
            {"video_id": video_id, "frame": e.frame, "joint": e.joint},
            {"video_id": video_id, "frame": e.frame, "joint": e.joint, "target": e.target,
             "value": [float(v) for v in e.value[:want]], "author_id": str(current_user["_id"]),
             "author_name": current_user.get("full_name"), "created_at": now},
            upsert=True)
        saved += 1
    return {"saved": saved}


@router.delete("/{video_id}/edits")
def revert_edits(video_id: str, frame: Optional[int] = None, joint: Optional[int] = None,
                 current_user: dict = Depends(get_current_user)):
    _require_editor(current_user)
    _analysis(video_id, current_user)
    q = {"video_id": video_id}
    if frame is not None:
        q["frame"] = frame
    if joint is not None:
        q["joint"] = joint
    return {"reverted": edits_col.delete_many(q).deleted_count}
