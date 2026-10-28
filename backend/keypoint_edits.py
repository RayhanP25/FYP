"""
keypoint_edits.py -- manual keypoint corrections layered over a stereo analysis.

An edit puts one joint of one frame where a person says it is:
    target "3d"            value [X, Y, Z]  (mm, floor-levelled, like keypoints_3d)
    target "left"/"right"  value [x, y]     (0-1 in that camera, like the 2D keypoints)
A 2D edit fixes that camera's ray; the depth comes from the other camera's point for the joint (or, if
it has none, the point on the ray nearest the joint's current 3D position).

apply_edits() returns the analysis with the edits applied, without touching the stored pipeline result,
so an edit can be reverted by deleting it and a re-analysis keeps every edit:
  - the edited frame gets exactly the edited position;
  - edits of the same joint up to KEYFRAME_GAP frames apart are joined: the frames between follow
    the analysis plus a correction that changes linearly from one edit to the next (keyframes);
  - elsewhere the correction fades out over FADE frames on each side, so the motion stays smooth;
  - each changed 3D point is projected into both cameras, so the skeleton on both videos matches it,
    and the angles of the changed frames are recomputed.
Frames carry "edited": {joint: "edit" | "blend"} so the page can mark them.
"""
import copy
import math
import os

import numpy as np

FADE = int(os.environ.get("POSE_EDIT_FADE_FRAMES", "5"))
KEYFRAME_GAP = int(os.environ.get("POSE_EDIT_KEYFRAME_GAP", "30"))
NUM_KEYPOINTS = 18
TARGETS = ("3d", "left", "right")


def _pt(p):
    return np.asarray(p, float) if p is not None and len(p) >= 3 and all(v is not None for v in p[:3]) else None


def _kp2d(frames, t, j, min_conf=0.3):
    if t >= len(frames):
        return None
    kp = (frames[t] or {}).get("keypoints")
    if not kp or j >= len(kp) or not kp[j] or len(kp[j]) < 3 or kp[j][2] < min_conf:
        return None
    return kp[j]


def _target_3d(edit, f3, views, rig):
    """The 3D position an edit asks for."""
    t, j = edit["frame"], edit["joint"]
    if edit["target"] == "3d":
        return np.asarray(edit["value"][:3], float)
    v = 0 if edit["target"] == "left" else 1
    C, d = rig.ray(edit["value"][:2], v)
    other = _kp2d(views[1 - v], t, j)
    if other is not None:
        C2, d2 = rig.ray(other, 1 - v)
        # closest points of the two rays (midpoint) = triangulation from the edited point + the other camera
        w0 = C - C2
        a, b, c, dd, e = d @ d, d @ d2, d2 @ d2, d @ w0, d2 @ w0
        den = a * c - b * b
        if abs(den) > 1e-9:
            s = (b * e - c * dd) / den
            if s > 0:
                return C + s * d
    base = _pt(f3[t]["keypoints_3d"][j]) if t < len(f3) else None
    if base is None:
        return None
    return C + max(0.0, float((base - C) @ d)) * d       # keep the current depth along the edited ray


def plan(result, edits, rig):
    """{(frame, joint): (X, kind)} for every 3D point the edits change (kind "edit" or "blend")."""
    f3 = result["frames_3d"]
    views = (result.get("frames") or [], result.get("frames_right") or [])
    n = len(f3)
    latest = {}
    for e in edits:                                   # one edit per joint and frame: the newest wins
        if e.get("target") in TARGETS and 0 <= e.get("frame", -1) < n and 0 <= e.get("joint", -1) < NUM_KEYPOINTS:
            key = (e["frame"], e["joint"])
            if key not in latest or str(e.get("created_at", "")) >= str(latest[key].get("created_at", "")):
                latest[key] = e
    out = {}
    by_joint = {}
    for (t, j), e in latest.items():
        X = _target_3d(e, f3, views, rig)
        if X is not None and np.all(np.isfinite(X)):
            by_joint.setdefault(j, []).append((t, X))
    base = lambda t, j: _pt(f3[t]["keypoints_3d"][j])
    for j, keys in by_joint.items():
        keys.sort(key=lambda k: k[0])
        delta = {t: (X - base(t, j)) if base(t, j) is not None else None for t, X in keys}
        joined_left, joined_right = set(), set()
        for (a, Xa), (b, Xb) in zip(keys, keys[1:]):
            if b - a > KEYFRAME_GAP:
                continue
            joined_right.add(a)
            joined_left.add(b)
            for t in range(a + 1, b):
                u = (t - a) / (b - a)
                bt = base(t, j)
                if bt is not None and delta[a] is not None and delta[b] is not None:
                    out[(t, j)] = (bt + (1 - u) * delta[a] + u * delta[b], "blend")
                else:                                   # no analysis point to correct: straight line
                    out[(t, j)] = ((1 - u) * Xa + u * Xb, "blend")
        for t, X in keys:
            if delta[t] is None:
                continue
            for side, joined in ((-1, joined_left), (1, joined_right)):
                if t in joined:
                    continue
                for d in range(1, FADE + 1):
                    s = t + side * d
                    bs = base(s, j) if 0 <= s < n else None
                    if bs is None or (s, j) in out:
                        continue
                    w = 0.5 * (1 + math.cos(math.pi * d / (FADE + 1)))   # 1 next to the edit -> 0
                    out[(s, j)] = (bs + w * delta[t], "blend")
        for t, X in keys:
            out[(t, j)] = (X, "edit")
    pinned2d = {(e["frame"], e["joint"], 0 if e["target"] == "left" else 1): e["value"][:2]
                for e in latest.values() if e["target"] != "3d"}
    return out, pinned2d


def apply_edits(result, edits, calib, angle_triplets=None, angle_3d=None, frame_angles=None):
    """A copy of a stereo analysis `result` with `edits` applied (see the module docstring)."""
    if not edits or not result or result.get("mode") != "stereo_3d" or not result.get("frames_3d"):
        return result
    import stereo_bones                                  # numpy / OpenCV only
    rig = stereo_bones.Rig(calib)
    changes, pinned2d = plan(result, edits, rig)
    if not changes:
        return result

    out = dict(result)
    f3 = out["frames_3d"] = list(result["frames_3d"])
    views = []
    for key in ("frames", "frames_right"):
        views.append(list(result.get(key) or []))
        out[key] = views[-1]
    copied = set()

    def frame(lst, t, tag):
        if (tag, t) not in copied:
            lst[t] = copy.deepcopy(lst[t])
            copied.add((tag, t))
        return lst[t]

    touched = set()
    for (t, j), (X, kind) in changes.items():
        f = frame(f3, t, "3d")
        f["keypoints_3d"][j] = [round(float(v), 1) for v in X]
        f.setdefault("edited", {})[str(j)] = kind
        touched.add(t)
        for v in (0, 1):
            if t >= len(views[v]) or not views[v][t]:
                continue
            fv = frame(views[v], t, v)
            kp = fv.get("keypoints")
            if not kp or j >= len(kp):
                continue
            uv = pinned2d.get((t, j, v))
            if uv is None:
                uv = rig.project(X, v)[0] / rig.size[v]
            kp[j] = [round(float(uv[0]), 4), round(float(uv[1]), 4), 1.0]
    for t in touched:
        f = f3[t]
        if angle_triplets and angle_3d:
            P = np.array([p if p else [np.nan] * 3 for p in f["keypoints_3d"]], float)
            f["angles_3d"] = {name: round(a, 2) for name, (i, k, m) in angle_triplets.items()
                              if (a := angle_3d(P[i], P[k], P[m])) is not None}
        if frame_angles and t < len(views[0]) and views[0][t] and views[0][t].get("keypoints"):
            fl = frame(views[0], t, 0)
            fl["angles"] = frame_angles(fl["keypoints"])
    edited_frames = sorted({t for (t, j), (_, kind) in changes.items() if kind == "edit"})
    out["edits_summary"] = dict(count=sum(1 for _, kind in changes.values() if kind == "edit"),
                                frames=len(edited_frames), fade_frames=FADE, keyframe_gap=KEYFRAME_GAP)
    return out
