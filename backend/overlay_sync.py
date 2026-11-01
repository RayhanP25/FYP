"""
overlay_sync.py -- keeps the stored skeleton videos of a stereo analysis in step with keypoint edits.

The skeleton is drawn into each camera's video once, at analysis time. After an edit is saved or reverted, only the
frames whose drawn skeleton changed are re-rendered from the clean camera video. The rest of the stored video is
copied as it is (stream copy, cut on keyframes), so a small edit doesn't re-encode the whole recording.
"""
import bisect
import os
import re
import subprocess
import tempfile
import threading
import uuid
from collections import defaultdict

import numpy as np
from bson import ObjectId

import video_io
from database import client, database_name
from minio_client import minio_client

BUCKET = "sport-pose-videos"
_locks = defaultdict(threading.Lock)
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _drawn(frames):
    from pose_estimator import _overlay_confidences
    return [f.get("keypoints") for f in frames], _overlay_confidences(frames)


def changed_frames(before, after):
    """Frame indices whose drawn skeleton differs between two lists of frames (keypoints plus display levels)."""
    kb, db = _drawn(before)
    ka, da = _drawn(after)
    return [t for t in range(min(len(kb), len(ka))) if kb[t] != ka[t] or not np.array_equal(db[t], da[t])]


def _keyframes(path):
    """(keyframe indices, total frame count) of a video, from FFmpeg's showinfo."""
    proc = subprocess.run([video_io.ffmpeg_exe(), "-hide_banner", "-i", path, "-map", "0:v:0",
                           "-vf", "showinfo", "-f", "null", "-"], capture_output=True, text=True,
                          creationflags=_NO_WINDOW)
    keys, total = [], 0
    for line in proc.stderr.splitlines():
        m = re.search(r"\bn:\s*(\d+)", line)
        if "Parsed_showinfo" in line and m:
            total = int(m.group(1)) + 1
            if "iskey:1" in line:
                keys.append(int(m.group(1)))
    return keys, total


def _intervals(changed, keys, total):
    """Merged [start, end) ranges to re-render, each widened to the keyframes around the changed frames."""
    out = []
    for t in changed:
        i = bisect.bisect_right(keys, t) - 1
        a = keys[i] if i >= 0 else 0
        b = keys[i + 1] if i + 1 < len(keys) else total
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def _run(args):
    subprocess.run([video_io.ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", *args],
                   check=True, creationflags=_NO_WINDOW)


def splice(old, clean, out, frames, fps, changed):
    """Write `out`: the stored video `old` with the frames in `changed` re-drawn from the clean video `clean`."""
    from pose_estimator import _render_overlay
    with tempfile.TemporaryDirectory() as d:
        keys, total = _keyframes(old)
        segments, pos = [], 0
        for a, b in _intervals(changed, keys, total):
            if a > pos:
                segments.append(("copy", pos, a))
            segments.append(("draw", a, b))
            pos = b
        if pos < total:
            segments.append(("copy", pos, total))
        parts = []
        for i, (kind, s, e) in enumerate(segments):
            part = os.path.join(d, f"part{i}.mp4")
            if kind == "copy":
                _run(["-ss", f"{s / fps:.6f}", "-i", old, "-frames:v", str(e - s), "-map", "0:v:0",
                      "-c", "copy", "-avoid_negative_ts", "make_zero", part])
            else:
                _render_overlay(clean, frames, part, fps=fps, stabilize_confidence=True, start=s, stop=e)
            parts.append(part)
        listing = os.path.join(d, "parts.txt")
        with open(listing, "w") as f:
            f.writelines(f"file '{p.replace(chr(92), '/')}'\n" for p in parts)
        _run(["-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", out])


def _rebuild(video_doc, baked_key, clean_key, frames, fps, changed):
    """Replace the changed frames of one stored camera video. Returns the new object name."""
    with tempfile.TemporaryDirectory() as d:
        old, clean, out = (os.path.join(d, n) for n in ("old.mp4", "clean.mp4", "out.mp4"))
        minio_client.fget_object(BUCKET, video_doc[baked_key], old)
        minio_client.fget_object(BUCKET, video_doc[clean_key], clean)
        splice(old, clean, out, frames, fps, changed)
        new_name = f"{baked_key.replace('_object_name', '')}_{uuid.uuid4()}.mp4"
        with open(out, "rb") as f:
            minio_client.put_object(bucket_name=BUCKET, object_name=new_name, data=f, length=-1,
                                    part_size=10 * 1024 * 1024, content_type="video/mp4")
    return new_name


def sync(video_id, before, after):
    """Bring the stored skeleton videos from the `before` analysis to the `after` one (both with edits applied)."""
    changed = {
        "processed_object_name": changed_frames(before.get("frames") or [], after.get("frames") or []),
        "processed_object_name_right": changed_frames(before.get("frames_right") or [], after.get("frames_right") or []),
    }
    if not any(changed.values()):
        return True
    clean_for = {"processed_object_name": "plain_object_name", "processed_object_name_right": "plain_object_name_right"}
    frames_for = {"processed_object_name": after.get("frames") or [],
                  "processed_object_name_right": after.get("frames_right") or []}
    with _locks[video_id]:
        videos = client[database_name]["videos"]
        video_doc = videos.find_one({"_id": ObjectId(video_id)})
        if not video_doc:
            return False
        for baked_key, frames in changed.items():
            if not frames or not video_doc.get(baked_key) or not video_doc.get(clean_for[baked_key]):
                continue
            old_name = video_doc[baked_key]
            new_name = _rebuild(video_doc, baked_key, clean_for[baked_key], frames_for[baked_key],
                                after["fps"], changed[baked_key])
            videos.update_one({"_id": video_doc["_id"]}, {"$set": {baked_key: new_name}})
            video_doc[baked_key] = new_name
            try:
                minio_client.remove_object(BUCKET, old_name)
            except Exception:
                pass
    return True
