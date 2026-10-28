"""Save the raw 2D keypoints of both cameras for stereo recordings (offline testing of stereo_refine.py).

    python dump_raw_stereo.py                 list the 20 latest stereo recordings
    python dump_raw_stereo.py <id> [<id> ...] write _debug/raw_<id>.json for each
                                              (<id> = database id or MinIO file name, e.g. stereo_....mp4)
"""
import json
import os
import sys

from bson import ObjectId

from database import client, database_name
from minio_client import minio_client
from pose_estimator import _run_inference
from stereo_process import _split_to_temp

HERE = os.path.dirname(os.path.abspath(__file__))
videos = client[database_name]["videos"]
analysis = client[database_name]["analysis"] if "analysis" in client[database_name].list_collection_names() else None

if len(sys.argv) < 2:
    for v in videos.find({"layout": "side_by_side"}).sort("uploaded_at", -1).limit(20):
        print(v["_id"], v.get("uploaded_at"), v.get("original_filename"), v.get("frames"), "frames")
    sys.exit()

os.makedirs(os.path.join(HERE, "_debug"), exist_ok=True)
for vid in sys.argv[1:]:
    doc = videos.find_one({"_id": ObjectId(vid)}) if ObjectId.is_valid(vid) else None
    doc = doc or videos.find_one({"object_name": {"$regex": vid.replace(".", "\\.") + "$"}})
    if not doc:
        print("not found:", vid)
        continue
    vid = str(doc["_id"])
    src = os.path.join(HERE, "_debug", f"src_{vid}.mp4")
    resp = minio_client.get_object(doc["bucket_name"], doc["object_name"])
    with open(src, "wb") as f:
        for chunk in resp.stream(amt=1024 * 1024):
            f.write(chunk)
    lp, rp, fps = _split_to_temp(src, 1280)
    try:
        rawL, rawR = _run_inference(lp), _run_inference(rp)
    finally:
        for p in (lp, rp):
            if os.path.exists(p):
                os.unlink(p)
    out = dict(video_id=vid, name=doc.get("original_filename"), uploaded_at=str(doc.get("uploaded_at")), fps=fps,
               framesL=[f.get("keypoints") for f in rawL["frames"]],
               framesR=[f.get("keypoints") for f in rawR["frames"]])
    path = os.path.join(HERE, "_debug", f"raw_{vid}.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print("saved", path, len(out["framesL"]), "frames")
