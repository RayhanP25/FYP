"""
stereo_refine.py -- use the two cameras to check each other (step 1 of stereo refinement).

1. fix_swaps()           runs on the RAW 2D keypoints of both views, before healing.
   The pose model sometimes mirrors a limb in one camera (most often when it sees the person from
   behind). Per frame, each camera may have mirrored an arm chain (from the shoulder, elbow or hand
   outwards) and/or a leg chain (from the hip, knee or foot): 16 ways per camera, 256 combinations.
   Every combination is triangulated and scored:
       camera agreement   reprojection error of each joint (both cameras must see the same point)
       bone lengths       upper arm, forearm, hand, thigh, shin, foot keep this person's length
       torso twist        the shoulder line may not turn more than POSE_TWIST_MAX_DEG from the hip line
       chirality          the body's left side must be on its left (forward from feet and nose, up from
                          the floor), which also catches a person mirrored in BOTH cameras
   A left/right pair that no pairing fits (fast motion between the two unsynchronised cameras) is left out
   of the scoring for that frame. The cheapest sequence over the whole clip is chosen (Viterbi), with a
   cost for 3D jumps, for labels jumping across each camera's image, and for changing a chain's labels
   between frames -- so one odd frame can't flip the labels, and one wrong frame can't become the
   reference for the next ones. The labels are swapped back in the camera(s) that mixed them up.
   Settings (.env, optional): POSE_SWAP_MIN_CONF, POSE_TWIST_MAX_DEG, POSE_SWAP_SWITCH_COST,
   POSE_SWAP_JUMP_MM, POSE_SWAP_JUMP_PX, POSE_SWAP_MODE_COST, POSE_SWAP_MISSING_COST.

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
SPIKE_MM = float(os.environ.get("POSE_SPIKE_MM", "80"))               # 3D jump that counts as a spike


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


MIRROR = list(range(NUM_KEYPOINTS))
for _a, _b in LR_PAIRS:
    MIRROR[_a], MIRROR[_b] = _b, _a

# Ways one camera can mix up a side of the body. Each mode swaps the left/right labels of a whole chain
# from some joint outwards (the pose model mirrors limbs as a unit, it doesn't swap an elbow alone).
# Numbers are the left-side joint of each swapped pair.
ARM_MODES = [(), (2, 4, 6, 8), (4, 6, 8), (6, 8)]          # none | from shoulder | from elbow | hand
LEG_MODES = [(), (10, 12, 14, 16), (12, 14, 16), (14, 16)]  # none | from hip | from knee | foot
N_VIEW_MODES = len(ARM_MODES) * len(LEG_MODES)              # 16 per camera
N_STATES = N_VIEW_MODES * N_VIEW_MODES                      # 256 combinations of both cameras

# Bones whose length is fixed for one person; left and right sides share one reference length.
BONE_KINDS = {"upper_arm": [(2, 4), (3, 5)], "forearm": [(4, 6), (5, 7)], "hand": [(6, 8), (7, 9)],
              "thigh": [(10, 12), (11, 13)], "shin": [(12, 14), (13, 15)], "foot": [(14, 16), (15, 17)]}
BONE_TOL = {"upper_arm": 0.15, "forearm": 0.15, "hand": 0.35, "thigh": 0.15, "shin": 0.15, "foot": 0.35}

TWIST_MAX_DEG = float(os.environ.get("POSE_TWIST_MAX_DEG", "70"))   # shoulder line vs hip line
JUMP_MM = float(os.environ.get("POSE_SWAP_JUMP_MM", "150"))         # 3D jump per frame that starts to cost
JUMP_PX = float(os.environ.get("POSE_SWAP_JUMP_PX", "80"))          # 2D jump per frame in one camera (calib px)
# Price of each swap mode (none | from shoulder/hip | from elbow/knee | hand/foot), so "no swap" wins when
# nothing else decides. The pose model mirrors whole limbs (typically when it sees the person from behind);
# a hand or foot alone needs stronger evidence -- when each camera sees a different hand, pairing the two
# hands always "explains" a little more, which is not evidence of a swap.
MODE_COST = [float(v) for v in os.environ.get("POSE_SWAP_MODE_COST", "0,0.5,0.5,0.5").split(",")]
SWITCH_COST = float(os.environ.get("POSE_SWAP_SWITCH_COST", "8"))   # per chain that changes between frames:
                         # real mix-ups last several frames; one odd detection should not flip the labels
MISSING_COST = float(os.environ.get("POSE_SWAP_MISSING_COST", "1.0"))      # a joint a combination can't triangulate (so a swap can't just drop an awkward joint)
CHIRALITY_COST = 8.0     # body's left side on its right
CHUNK = 100              # frames scored at once (bounds memory)


def _view_swaps():
    """(16, 18) bool: does view-mode m read joint j from the mirrored detection?"""
    sw = np.zeros((N_VIEW_MODES, NUM_KEYPOINTS), bool)
    for m in range(N_VIEW_MODES):
        for a in ARM_MODES[m // len(LEG_MODES)] + LEG_MODES[m % len(LEG_MODES)]:
            sw[m, a] = sw[m, MIRROR[a]] = True
    return sw


VIEW_SW = _view_swaps()
# Pairing of joint j in state s: 0 = both cameras as labelled, 1 = right camera mirrored,
# 2 = left camera mirrored, 3 = both mirrored.
STATE_PAIRING = (2 * VIEW_SW[:, None, :] + VIEW_SW[None, :, :]).reshape(N_STATES, NUM_KEYPOINTS)
VIEW_PRIOR = np.array([MODE_COST[m // len(LEG_MODES)] + MODE_COST[m % len(LEG_MODES)] for m in range(N_VIEW_MODES)])
STATE_PRIOR = (VIEW_PRIOR[:, None] + VIEW_PRIOR[None, :]).reshape(N_STATES)
_ARM, _LEG = np.arange(N_VIEW_MODES) // len(LEG_MODES), np.arange(N_VIEW_MODES) % len(LEG_MODES)
_VIEW_CHANGES = (_ARM[:, None] != _ARM[None, :]).astype(int) + (_LEG[:, None] != _LEG[None, :])
STATE_SWITCH = SWITCH_COST * (_VIEW_CHANGES[:, None, :, None] + _VIEW_CHANGES[None, :, None, :]).reshape(
    N_STATES, N_STATES)                                      # [state at t-1, state at t]


def _keypoint_array(frames, n):
    K = np.full((n, NUM_KEYPOINTS, 3), np.nan)
    for t in range(n):
        kp = frames[t].get("keypoints")
        if kp:
            for j in range(min(NUM_KEYPOINTS, len(kp))):
                if kp[j] and len(kp[j]) >= 3:
                    K[t, j] = kp[j][:3]
    return K


def _pairings(KL, KR, calib, min_conf):
    """Triangulate every joint under all 4 pairings. Returns X (n,18,4,3), E (n,18,4), V (n,18,4) valid."""
    n = len(KL)
    sL, sR = np.asarray(calib["size1"], float), np.asarray(calib["size2"], float)
    X = np.full((n, NUM_KEYPOINTS, 4, 3), np.nan)
    E = np.full((n, NUM_KEYPOINTS, 4), np.inf)
    V = np.zeros((n, NUM_KEYPOINTS, 4), bool)
    idx, ptsL, ptsR = [], [], []
    for j in range(NUM_KEYPOINTS):
        for p in range(4):
            dl = MIRROR[j] if p >= 2 else j
            dr = MIRROR[j] if p % 2 else j
            ok = (KL[:, dl, 2] >= min_conf) & (KR[:, dr, 2] >= min_conf)
            for t in np.flatnonzero(ok):
                idx.append((t, j, p))
                ptsL.append(KL[t, dl, :2] * sL)
                ptsR.append(KR[t, dr, :2] * sR)
    if idx:
        Xs, es = triangulate_px(ptsL, ptsR, calib)
        t_, j_, p_ = np.array(idx).T
        X[t_, j_, p_] = Xs
        E[t_, j_, p_] = es
        V[t_, j_, p_] = np.isfinite(es)
    # A left/right pair that no pairing fits (the cameras disagree whichever way it is labelled -- fast motion
    # between two unsynchronised cameras, blur) carries no 3D evidence in that frame: leave it out of the
    # scoring, so continuity keeps the labels as detected instead of a junk 3D point deciding.
    best = np.where(V, E, np.inf).min(axis=2)                       # (n, 18) best fit per label
    pair_best = np.minimum(best, best[:, MIRROR])
    V &= (pair_best <= REPROJ_MAX_PX)[:, :, None]
    return X, E, V


def _unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        return v / n


def _flat(v, up):
    """Remove the vertical part of v (project onto the floor plane)."""
    return v - (v @ up)[..., None] * up


def _bone_reference(X, E, V):
    """Median length of each bone kind over frames where the labels as given fit both cameras."""
    ref = {}
    for kind, bones in BONE_KINDS.items():
        lens = []
        for a, b in bones:
            ok = V[:, a, 0] & V[:, b, 0] & (E[:, a, 0] <= REPROJ_MAX_PX) & (E[:, b, 0] <= REPROJ_MAX_PX)
            lens.append(np.linalg.norm(X[ok, a, 0] - X[ok, b, 0], axis=1))
        lens = np.concatenate(lens)
        if len(lens) >= 20:
            ref[kind] = float(np.median(lens))
    return ref


def _unary(X, E, V, up, bone_ref):
    """Cost of each of the 256 combinations in each frame: (n, 256), plus the twist angle (n, 256)."""
    n = len(X)
    J = np.arange(NUM_KEYPOINTS)[None, :]
    cost = np.zeros((n, N_STATES))
    twist = np.full((n, N_STATES), np.nan)
    any_valid = V.any(axis=2)                                       # joint seen in some pairing
    for s0 in range(0, n, CHUNK):
        sl = slice(s0, min(n, s0 + CHUNK))
        Xs = X[sl][:, J, STATE_PAIRING]                             # (c, 256, 18, 3)
        Es = E[sl][:, J, STATE_PAIRING]
        Vs = V[sl][:, J, STATE_PAIRING]

        # 1. Both cameras must agree (reprojection error), joints the combination loses cost a bit.
        rep = np.where(Vs, np.minimum((Es / REPROJ_MAX_PX) ** 2, 9.0), MISSING_COST)
        c = (rep * any_valid[sl][:, None, :]).sum(axis=2)

        # 2. Bones keep this person's length.
        for kind, L in bone_ref.items():
            for a, b in BONE_KINDS[kind]:
                ok = Vs[..., a] & Vs[..., b]
                d = np.linalg.norm(Xs[..., a, :] - Xs[..., b, :], axis=-1)
                c += np.where(ok, np.minimum(((d - L) / (BONE_TOL[kind] * L)) ** 2, 25.0), 0.0)   # 25: impossible bone

        # 3. Shoulders can't twist far from the hips (a real spine turns ~45-60 degrees).
        sh = _unit(_flat(Xs[..., 3, :] - Xs[..., 2, :], up))        # left -> right shoulder
        hp = _unit(_flat(Xs[..., 11, :] - Xs[..., 10, :], up))      # left -> right hip
        with np.errstate(invalid="ignore"):
            ang = np.degrees(np.arccos(np.clip((sh * hp).sum(-1), -1, 1)))
        ok = Vs[..., 2] & Vs[..., 3] & Vs[..., 10] & Vs[..., 11] & np.isfinite(ang)
        twist[sl] = np.where(ok, ang, np.nan)
        c += np.where(ok, np.minimum(np.clip((ang - TWIST_MAX_DEG) / 20.0, 0, None) ** 2, 16.0), 0.0)

        # 4. The body's left side is on its left: forward from feet (ankle -> toe) and nose (neck -> nose),
        #    up from the floor; left = up x forward. Checked on the hips, else the shoulders.
        fwd = np.zeros(Xs.shape[:2] + (3,))
        for a, b in ((14, 16), (15, 17), (1, 0)):
            ok_f = (Vs[..., a] & Vs[..., b])[..., None]
            fwd += np.where(ok_f, np.nan_to_num(_unit(_flat(Xs[..., b, :] - Xs[..., a, :], up))), 0.0)
        has_fwd = np.linalg.norm(fwd, axis=-1) > 0.5
        left_dir = _unit(np.cross(up, fwd))
        side = np.full(Xs.shape[:2], np.nan)
        for a, b in ((2, 3), (10, 11)):                              # hips win (written last)
            ok_s = Vs[..., a] & Vs[..., b]
            v = _unit(_flat(Xs[..., a, :] - Xs[..., b, :], up))     # right -> left
            side = np.where(ok_s, (v * left_dir).sum(-1), side)
        bad = has_fwd & np.isfinite(side)
        c += np.where(bad, CHIRALITY_COST * np.clip(-side / 0.5, 0, 1) ** 2, 0.0)

        cost[sl] = c + STATE_PRIOR[None, :]
    return cost, twist


VIEW_ONEHOT = np.zeros((N_VIEW_MODES, NUM_KEYPOINTS * 2))
VIEW_ONEHOT[np.arange(N_VIEW_MODES)[:, None], np.arange(NUM_KEYPOINTS) * 2 + VIEW_SW] = 1.0


def _transition_2d(K0, K1, size, min_conf):
    """(16, 16) cost of one camera's labelling at t-1 -> t: a label that jumps across the image costs.
    Independent of the other camera, so it still works when the two cameras disagree (motion blur, sync)."""
    P0 = np.where((K0[:, 2] >= min_conf)[:, None], K0[:, :2] * size, np.nan)
    P1 = np.where((K1[:, 2] >= min_conf)[:, None], K1[:, :2] * size, np.nan)
    own = np.arange(NUM_KEYPOINTS)
    src0 = np.stack([P0[own], P0[MIRROR]], axis=1)                          # (18, 2 choices, 2)
    src1 = np.stack([P1[own], P1[MIRROR]], axis=1)
    d = np.linalg.norm(src0[:, :, None, :] - src1[:, None, :, :], axis=-1)  # (18, prev choice, now choice)
    C = np.where(np.isfinite(d), np.minimum((np.nan_to_num(d) / JUMP_PX) ** 2, 4.0), 0.0)
    block = np.zeros((NUM_KEYPOINTS, 2, NUM_KEYPOINTS, 2))
    block[own, :, own, :] = C
    block = block.reshape(NUM_KEYPOINTS * 2, NUM_KEYPOINTS * 2)
    return VIEW_ONEHOT @ block @ VIEW_ONEHOT.T


def _transition(X0, V0, X1, V1, onehot):
    """(256, 256) cost of going from each combination at t-1 to each at t: big 3D jumps cost."""
    d = np.linalg.norm(X1[:, None, :, :] - X0[:, :, None, :], axis=-1)       # (18, p_prev, p_now)
    ok = V0[:, :, None] & V1[:, None, :]
    C = np.where(ok, np.minimum((np.nan_to_num(d) / JUMP_MM) ** 2, 4.0), 0.0)
    block = np.zeros((NUM_KEYPOINTS, 4, NUM_KEYPOINTS, 4))
    block[np.arange(NUM_KEYPOINTS), :, np.arange(NUM_KEYPOINTS), :] = C
    block = block.reshape(NUM_KEYPOINTS * 4, NUM_KEYPOINTS * 4)
    return onehot @ block @ onehot.T + STATE_SWITCH


def fix_swaps(framesL, framesR, calib, min_conf=SWAP_MIN_CONF):
    """Put left/right labels back where a camera mixed them up, in place in framesL/framesR (raw keypoints).

    Every frame, each camera may have mirrored an arm chain and/or a leg chain (16 ways per camera,
    256 combinations). Each combination is triangulated and scored on camera agreement, bone lengths,
    torso twist and body chirality; the cheapest sequence over the whole clip (Viterbi) is applied.
    Returns a report."""
    n = min(len(framesL), len(framesR))
    counts = {name: 0 for name in PAIR_NAMES.values()}
    per_frame = [dict(left=[], right=[]) for _ in range(n)]
    if n == 0:
        return dict(per_frame=per_frame, swaps_fixed=counts, total_swaps_fixed=0, frames_changed=0)

    KL, KR = _keypoint_array(framesL, n), _keypoint_array(framesR, n)
    sL, sR = np.asarray(calib["size1"], float), np.asarray(calib["size2"], float)
    X, E, V = _pairings(KL, KR, calib, min_conf)
    R_level = calib.get("R_level")
    up = (np.asarray(R_level, float).T @ np.array([0.0, -1.0, 0.0]) if R_level is not None
          else np.array([0.0, -1.0, 0.0]))                         # "up" in the left camera's frame
    bone_ref = _bone_reference(X, E, V)
    U, twist = _unary(X, E, V, up, bone_ref)

    onehot = np.zeros((N_STATES, NUM_KEYPOINTS * 4))
    onehot[np.arange(N_STATES)[:, None], np.arange(NUM_KEYPOINTS) * 4 + STATE_PAIRING] = 1.0
    D = U[0].copy()
    back = np.zeros((n, N_STATES), dtype=np.int32)
    for t in range(1, n):
        tL = _transition_2d(KL[t - 1], KL[t], sL, min_conf)
        tR = _transition_2d(KR[t - 1], KR[t], sR, min_conf)
        T2 = (tL[:, None, :, None] + tR[None, :, None, :]).reshape(N_STATES, N_STATES)
        M = D[:, None] + _transition(X[t - 1], V[t - 1], X[t], V[t], onehot) + T2
        back[t] = M.argmin(axis=0)
        D = M[back[t], np.arange(N_STATES)] + U[t]
    path = np.zeros(n, dtype=np.int32)
    path[-1] = int(D.argmin())
    for t in range(n - 1, 0, -1):
        path[t - 1] = back[t, path[t]]

    changed = 0
    for t, s in enumerate(path):
        if s == 0:
            continue
        changed += 1
        for side, m, frames in (("left", s // N_VIEW_MODES, framesL), ("right", s % N_VIEW_MODES, framesR)):
            kp = frames[t].get("keypoints")
            for a in ARM_MODES[m // len(LEG_MODES)] + LEG_MODES[m % len(LEG_MODES)]:
                b = MIRROR[a]
                if kp and max(a, b) < len(kp):
                    kp[a], kp[b] = kp[b], kp[a]
                per_frame[t][side].append(PAIR_NAMES[a])
                counts[PAIR_NAMES[a]] += 1
    chosen_twist = twist[np.arange(n), path]
    still_twisted = int(np.sum(chosen_twist > TWIST_MAX_DEG))
    return dict(per_frame=per_frame, swaps_fixed=counts, total_swaps_fixed=int(sum(counts.values())),
                frames_changed=changed, frames_still_twisted=still_twisted,
                bone_reference_mm={k: round(v, 1) for k, v in bone_ref.items()},
                params=dict(min_conf=min_conf, max_px=REPROJ_MAX_PX, twist_max_deg=TWIST_MAX_DEG,
                            jump_mm=JUMP_MM))


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
