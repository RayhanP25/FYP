"""
stereo_refine.py -- use the two cameras to check each other (step 1 of stereo refinement).

1. fix_swaps()           runs on the RAW 2D keypoints of both views, before healing.
   For every left/right joint pair (shoulders, elbows, wrists, index, hips, knees, ankles, toes)
   it triangulates both possible pairings between the views:
       keep  : left-view A with right-view A, left-view B with right-view B
       cross : left-view A with right-view B, left-view B with right-view A
   and measures the reprojection error of each. If "cross" fits the two cameras much better,
   one view has mixed up the left/right labels. Which view is to blame is decided by 3D
   continuity with the previous frames (fallback: each view's own 2D continuity, then the
   lower-confidence view), and the labels are swapped back in that view only.

   Limit: two views can only tell pairings apart when the two candidates are NOT on the same
   epipolar line. With side-by-side cameras that means a swap of two joints at the same height
   is undetectable here (the "keep" pairing fits fine); those are left as they are.

2. triangulate_checked() runs after healing. It triangulates each joint, projects the 3D point
   back into both cameras and rejects it (NaN) when it lands more than POSE_REPROJ_MAX_PX away
   from the detections -- the two cameras disagree, so at least one detection is wrong. A missing
   point is better than a confidently wrong one; step 2 (bone lengths / ray recovery) will try to
   recover these.

Pixel units are those of the calibration (calib["size1"], e.g. 2560x1440).
"""
import os

import cv2
import numpy as np

NUM_KEYPOINTS = 18
LR_PAIRS = [(2, 3), (4, 5), (6, 7), (8, 9), (10, 11), (12, 13), (14, 15), (16, 17)]
JOINT_NAMES = ["nose", "neck", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist",
               "right_wrist", "left_index", "right_index", "left_hip", "right_hip", "left_knee", "right_knee",
               "left_ankle", "right_ankle", "left_toe", "right_toe"]   # report keys (MongoDB needs string keys)
PAIR_NAMES = {2: "shoulder", 4: "elbow", 6: "wrist", 8: "index", 10: "hip", 12: "knee", 14: "ankle", 16: "toe"}

REPROJ_MAX_PX = float(os.environ.get("POSE_REPROJ_MAX_PX", "25"))     # reject a 3D point above this
SWAP_MIN_CONF = float(os.environ.get("POSE_SWAP_MIN_CONF", "0.3"))    # raw joints considered for swaps
SWAP_RATIO = float(os.environ.get("POSE_SWAP_RATIO", "0.5"))          # cross must be < ratio * keep
SPIKE_MM = float(os.environ.get("POSE_SPIKE_MM", "80"))               # 3D jump that counts as a spike
CONTINUITY_FRAMES = 5                                                 # how old a "previous" 3D point may be


def _P(calib):
    P1 = np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = np.hstack([calib["R"], calib["T"].reshape(3, 1)])
    return P1, P2


def _to_px(kp, size):
    return np.array([kp[0] * size[0], kp[1] * size[1]], dtype=np.float64)


def triangulate_px(ptsL, ptsR, calib):
    """(N,2) pixel points per view -> (N,3) 3D in the LEFT camera frame and (N,) mean reprojection error (px)."""
    ptsL = np.asarray(ptsL, np.float64).reshape(-1, 1, 2)
    ptsR = np.asarray(ptsR, np.float64).reshape(-1, 1, 2)
    uL = cv2.undistortPoints(ptsL, calib["K1"], calib["D1"]).reshape(-1, 2).T
    uR = cv2.undistortPoints(ptsR, calib["K2"], calib["D2"]).reshape(-1, 2).T
    P1, P2 = _P(calib)
    X4 = cv2.triangulatePoints(P1, P2, uL, uR)
    X = (X4[:3] / X4[3]).T
    rv, _ = cv2.Rodrigues(np.asarray(calib["R"], np.float64))
    pL, _ = cv2.projectPoints(X, np.zeros(3), np.zeros(3), calib["K1"], calib["D1"])
    pR, _ = cv2.projectPoints(X, rv, np.asarray(calib["T"], np.float64).reshape(3), calib["K2"], calib["D2"])
    eL = np.linalg.norm(pL.reshape(-1, 2) - ptsL.reshape(-1, 2), axis=1)
    eR = np.linalg.norm(pR.reshape(-1, 2) - ptsR.reshape(-1, 2), axis=1)
    err = (eL + eR) / 2
    err[X[:, 2] <= 0] = np.inf            # behind the cameras: impossible pairing
    return X, err


def _ok(kp, j, min_conf):
    return bool(kp) and j < len(kp) and kp[j] and len(kp[j]) >= 3 and kp[j][2] >= min_conf


def fix_swaps(framesL, framesR, calib):
    """Swap left/right labels back in place in framesL/framesR (raw keypoints). Returns a report."""
    sL, sR = calib["size1"], calib["size2"]
    n = min(len(framesL), len(framesR))
    prev3d = {}                                # joint -> (frame, 3D point) from the last good frame
    per_frame = [dict(left=[], right=[]) for _ in range(n)]
    counts = {name: 0 for name in PAIR_NAMES.values()}

    def jump2d(kp_prev, kp, a, b, swap):
        if not (kp_prev and _ok(kp_prev, a, 0) and _ok(kp_prev, b, 0)):
            return None
        A, B = (kp[b], kp[a]) if swap else (kp[a], kp[b])
        return (np.hypot(A[0] - kp_prev[a][0], A[1] - kp_prev[a][1]) +
                np.hypot(B[0] - kp_prev[b][0], B[1] - kp_prev[b][1]))

    for t in range(n):
        kL, kR = framesL[t].get("keypoints"), framesR[t].get("keypoints")
        for a, b in LR_PAIRS:
            if not all(_ok(k, j, SWAP_MIN_CONF) for k in (kL, kR) for j in (a, b)):
                continue
            La, Lb, Ra, Rb = _to_px(kL[a], sL), _to_px(kL[b], sL), _to_px(kR[a], sR), _to_px(kR[b], sR)
            X, e = triangulate_px([La, Lb, La, Lb], [Ra, Rb, Rb, Ra], calib)
            keep, cross = e[0] + e[1], e[2] + e[3]
            geometric = keep > 2 * REPROJ_MAX_PX and cross < SWAP_RATIO * keep
            pa, pb = prev3d.get(a), prev3d.get(b)
            recent = bool(pa and pb and t - pa[0] <= CONTINUITY_FRAMES and t - pb[0] <= CONTINUITY_FRAMES)
            temporal = False
            if not geometric and recent and cross <= 2 * REPROJ_MAX_PX:
                # Both pairings fit the cameras (the joints lie on the same epipolar line), so geometry
                # can't decide. Use 3D continuity: a pairing that jumps far from the last frame while
                # the other one continues smoothly is a label swap.
                jump_keep = np.linalg.norm(X[0] - pa[1]) + np.linalg.norm(X[1] - pb[1])
                jump_cross = min(np.linalg.norm(X[2] - pa[1]) + np.linalg.norm(X[3] - pb[1]),
                                 np.linalg.norm(X[3] - pa[1]) + np.linalg.norm(X[2] - pb[1]))
                temporal = jump_keep > 2 * SPIKE_MM and jump_cross < SWAP_RATIO * jump_keep
            if not (geometric or temporal):
                if keep <= 2 * REPROJ_MAX_PX:
                    for j, x in ((a, X[0]), (b, X[1])):
                        prev3d[j] = (t, x)
                continue
            # The views disagree on which joint is which. Option "right view wrong": a=(La,Rb), b=(Lb,Ra).
            # Option "left view wrong": a=(Lb,Ra), b=(La,Rb).
            Xa_r, Xb_r = X[2], X[3]
            Xa_l, Xb_l = X[3], X[2]
            if recent:
                cost_r = np.linalg.norm(Xa_r - pa[1]) + np.linalg.norm(Xb_r - pb[1])
                cost_l = np.linalg.norm(Xa_l - pa[1]) + np.linalg.norm(Xb_l - pb[1])
                blame_left = cost_l < cost_r
            else:
                kLp = framesL[t - 1].get("keypoints") if t else None
                kRp = framesR[t - 1].get("keypoints") if t else None
                gl = [jump2d(kLp, kL, a, b, s) for s in (False, True)]
                gr = [jump2d(kRp, kR, a, b, s) for s in (False, True)]
                if None not in gl and None not in gr:
                    blame_left = (gl[0] - gl[1]) > (gr[0] - gr[1])   # swapping helps the left view more
                else:
                    blame_left = (kL[a][2] + kL[b][2]) < (kR[a][2] + kR[b][2])
            k = kL if blame_left else kR
            k[a], k[b] = k[b], k[a]
            per_frame[t]["left" if blame_left else "right"].append(PAIR_NAMES[a])
            counts[PAIR_NAMES[a]] += 1
            Xa, Xb = (Xa_l, Xb_l) if blame_left else (Xa_r, Xb_r)
            prev3d[a], prev3d[b] = (t, Xa), (t, Xb)
    return dict(per_frame=per_frame, swaps_fixed=counts, total_swaps_fixed=int(sum(counts.values())),
                params=dict(min_conf=SWAP_MIN_CONF, ratio=SWAP_RATIO, max_px=REPROJ_MAX_PX))


def triangulate_checked(kp_left, kp_right, calib, conf_threshold, max_px=REPROJ_MAX_PX):
    """Like triangulate.triangulate_keypoints, plus a reprojection check.
    Returns (pts3d (18,3) mm with R_level applied, err (18,) px or NaN, rejected [joint indices])."""
    sL, sR = calib["size1"], calib["size2"]
    out = np.full((NUM_KEYPOINTS, 3), np.nan)
    err = np.full(NUM_KEYPOINTS, np.nan)
    idx = [j for j in range(NUM_KEYPOINTS)
           if _ok(kp_left, j, 0) and _ok(kp_right, j, 0)
           and kp_left[j][2] > conf_threshold and kp_right[j][2] > conf_threshold]
    rejected = []
    if idx:
        X, e = triangulate_px([_to_px(kp_left[j], sL) for j in idx], [_to_px(kp_right[j], sR) for j in idx], calib)
        R_level = calib.get("R_level")
        if R_level is not None:
            X = (np.asarray(R_level, np.float64) @ X.T).T
        for k, j in enumerate(idx):
            err[j] = e[k]
            if e[k] > max_px:
                rejected.append(j)
            else:
                out[j] = X[k]
    return out, err, rejected


def reprojection_summary(errs, rejected_counts, n_frames):
    """errs: list of (18,) arrays. Per-joint median / 95th percentile reprojection error (px) and rejection rate."""
    E = np.array(errs) if errs else np.full((0, NUM_KEYPOINTS), np.nan)
    per_joint = {}
    for j in range(NUM_KEYPOINTS):
        col = E[:, j][np.isfinite(E[:, j])] if len(E) else np.array([])
        per_joint[JOINT_NAMES[j]] = dict(median_px=round(float(np.median(col)), 1) if len(col) else None,
                            p95_px=round(float(np.percentile(col, 95)), 1) if len(col) else None,
                            rejected=int(rejected_counts[j]),
                            rejected_pct=round(100 * rejected_counts[j] / max(1, n_frames), 1))
    allv = E[np.isfinite(E)] if len(E) else np.array([])
    return dict(max_px=REPROJ_MAX_PX,
                median_px=round(float(np.median(allv)), 1) if len(allv) else None,
                p95_px=round(float(np.percentile(allv, 95)), 1) if len(allv) else None,
                total_rejected=int(sum(rejected_counts)), per_joint=per_joint)


def spike_mask(P, spike_mm=SPIKE_MM):
    """P: (frames, 18, 3) 3D points with NaN for missing. Returns a (frames, 18) mask of spikes to drop.

    Two cameras cannot see an error along the epipolar line (roughly horizontal for side-by-side
    cameras): such a point still reprojects well but lands at the wrong depth. It shows up as a spike:
    far from the midpoint of the previous and next frame, which are themselves close together.
    Smooth fast movement stays near that midpoint (80 mm allows ~140 m/s^2 of acceleration at
    30 fps), so only isolated one-frame spikes are removed."""
    P = np.asarray(P, float)
    mask = np.zeros(P.shape[:2], dtype=bool)
    if len(P) < 3:
        return mask
    prev, cur, nxt = P[:-2], P[1:-1], P[2:]
    dev = np.linalg.norm(cur - (prev + nxt) / 2, axis=2)
    gap = np.linalg.norm(prev - nxt, axis=2)
    with np.errstate(invalid="ignore"):
        mask[1:-1] = (dev > spike_mm) & (gap < spike_mm)
    return mask
