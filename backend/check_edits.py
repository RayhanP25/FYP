"""
check_edits.py -- why does (or doesn't) a saved keypoint edit show on the camera videos?

    cd backend
    python check_edits.py                 # every video with edits
    python check_edits.py <video_id>      # one video

For each edit it prints the joint's 2D position in both cameras before and after the edits are applied
(what GET /api/get-analysis returns), whether that lands inside the picture, which calibration was used,
and whether the clean videos the page draws on exist. Read-only.
"""
import sys

import numpy as np

import calibration_store
import keypoint_edits
from database import client, database_name
from routes.edits import calibration_for, edits_for
from bson import ObjectId

db = client[database_name]
JOINTS = ["nose", "neck", "L shoulder", "R shoulder", "L elbow", "R elbow", "L wrist", "R wrist", "L fingertip",
          "R fingertip", "L hip", "R hip", "L knee", "R knee", "L ankle", "R ankle", "L toe", "R toe"]


def fmt(p):
    if not p:
        return "none"
    inside = 0 <= p[0] <= 1 and 0 <= p[1] <= 1
    return f"({p[0]:.3f}, {p[1]:.3f}) conf {p[2]:.2f}{'' if inside else '  OUTSIDE THE PICTURE'}"


def check(video_id):
    a = db["pose_analysis"].find_one({"video_id": video_id})
    if not a:
        print(f"{video_id}: no analysis")
        return
    r = a.get("result") or {}
    v = db["videos"].find_one({"_id": ObjectId(video_id)}) if ObjectId.is_valid(video_id) else None
    v = v or {}
    print("=" * 78)
    print(f"video {video_id}  {v.get('original_filename', '')}")
    print(f"  analysed {a.get('created_at')}  mode {r.get('mode')}  frames 3d/left/right "
          f"{len(r.get('frames_3d') or [])}/{len(r.get('frames') or [])}/{len(r.get('frames_right') or [])}")
    print(f"  raw keypoints stored: {any(f.get('keypoints_3d_raw') for f in (r.get('frames_3d') or []))}")
    print(f"  clean videos (needed to draw edits): left {v.get('plain_object_name') or 'MISSING'}, "
          f"right {v.get('plain_object_name_right') or 'MISSING'}")
    _, tmp, doc = calibration_store.file_for(a.get("calibration_id"))
    print(f"  calibration_id on analysis: {a.get('calibration_id')} -> "
          f"{'calibration.npz (active)' if not tmp else 'stored entry'} {(doc or {}).get('setup', '')}")
    edits = list(db["keypoint_edits"].find({"video_id": video_id}))
    print(f"  {len(edits)} edit(s)")
    calib = calibration_for(a)
    out = keypoint_edits.apply_edits(r, edits_for(video_id), calib)     # as get-analysis (angles left out)
    import stereo_bones
    rig = stereo_bones.Rig(calib)
    for e in edits:
        t, j = e["frame"], e["joint"]
        print(f"  - frame {t}, {JOINTS[j]} ({j}), target {e['target']}, value {np.round(e['value'], 3).tolist()}")
        if t >= len(r.get("frames_3d") or []):
            print("      frame is past the end of the analysis")
            continue
        b3, o3 = r["frames_3d"][t]["keypoints_3d"][j], out["frames_3d"][t]["keypoints_3d"][j]
        print(f"      3D  before {b3}  after {o3}  marked {out['frames_3d'][t].get('edited')}")
        for key, name, vi in (("frames", "left ", 0), ("frames_right", "right", 1)):
            fr, fo = r.get(key) or [], out.get(key) or []
            if t >= len(fr) or not fr[t]:
                print(f"      {name}  no 2D frame")
                continue
            print(f"      {name}  before {fmt(fr[t]['keypoints'][j])}  after {fmt(fo[t]['keypoints'][j])}")
        if o3:
            for vi, name in ((0, "left "), (1, "right")):
                Xc = rig.RL.T @ np.asarray(o3, float)
                if vi == 1:
                    Xc = rig.R @ Xc + rig.T
                print(f"      {name}  depth in front of the camera: {Xc[2]:.0f} mm")


ids = sys.argv[1:] or sorted({e["video_id"] for e in db["keypoint_edits"].find({}, {"video_id": 1})})
if not ids:
    print("No keypoint edits saved yet.")
for vid in ids:
    check(vid)
