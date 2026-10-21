"""
stereo_bones.py -- step 2 of stereo refinement: constant bone lengths + one-camera recovery.

Runs after triangulation (stereo_refine.py) on the 3D points P (frames x 18 x 3, mm, floor-levelled):

1. bone_lengths()  Median 3D length of each RIGID bone over reliable frames (joint confident in
                   both cameras, not healed, small reprojection error). Medians ignore the few
                   frames where a joint was wrong. Torso "bones" (shoulder width, shoulder-hip,
                   neck) are not rigid and are not constrained.
2. recover()       A joint that only ONE camera really sees (hidden or healed in the other, or
                   rejected because the cameras disagreed) lies on that camera's ray; it must also
                   be one bone length from its parent joint, i.e. on a sphere. Ray x sphere gives
                   <= 2 points; the one nearest the joint's own track (or the other camera's weak
                   detection) is kept. Chains (elbow -> wrist -> index) are recovered in order.
3. refine()        Per frame, a small robust least-squares fit moves all joints together to stay
                   close to what each camera detected (weighted by confidence; healed detections
                   count very little) while keeping each bone near its median length. Soft: a joint
                   both cameras clearly agree on is barely moved.
4. fill_2d()       Hidden / healed joints in each camera are replaced by the refined 3D point
                   projected into that camera, so the overlay videos improve too.

Settings (.env): POSE_BONE_REFINE=0 turns all of this off.
"""
import os

import cv2
import numpy as np

try:
    from scipy.optimize import least_squares
except Exception:            # scipy missing -> recovery still works, refinement is skipped
    least_squares = None

NUM_KEYPOINTS = 18
ENABLED = os.environ.get("POSE_BONE_REFINE", "1") != "0"

# (parent, child, name, sigma_mm): sigma = how strictly the length is held (looser for the hand,
# whose "index" point moves with finger flexion, and the foot, whose toe point bends).
BONES = [(2, 4, "left_upper_arm", 10), (4, 6, "left_forearm", 10), (6, 8, "left_hand", 25),
         (3, 5, "right_upper_arm", 10), (5, 7, "right_forearm", 10), (7, 9, "right_hand", 25),
         (10, 12, "left_thigh", 10), (12, 14, "left_shin", 10), (14, 16, "left_foot", 15),
         (11, 13, "right_thigh", 10), (13, 15, "right_shin", 10), (15, 17, "right_foot", 15),
         (10, 11, "hip_width", 15)]
PARENT = {c: p for p, c, _, _ in BONES if (p, c) != (10, 11)}
RECOVER_ORDER = [4, 6, 8, 5, 7, 9, 12, 14, 16, 13, 15, 17]       # parents before children

RELIABLE_CONF = 0.7      # both views at least this confident -> usable for measuring bones
REAL_CONF = 0.5          # a view "really sees" a joint above this (and it was not healed)
MIN_SAMPLES = 10         # frames needed before a bone length is trusted
SIGMA_PX = 3.0           # expected 2D detection noise (px at calibration resolution)
HEALED_WEIGHT = 0.05     # healed / guessed detections barely count in the fit
MAX_JUMP_MM = 300.0      # a recovered point this far from the joint's own track is not trusted
ANCHOR_MM = 15.0         # how far the fit may move a recovered joint from its ray x sphere position
PRIOR_MM = 60.0          # weak pull of every joint towards its starting point (keeps the fit well posed)


class Rig:
    """Both cameras in the floor-levelled coordinate frame used by P."""

    def __init__(self, calib):
        self.K = [np.asarray(calib["K1"], float), np.asarray(calib["K2"], float)]
        self.D = [np.asarray(calib["D1"], float).ravel(), np.asarray(calib["D2"], float).ravel()]
        self.R = np.asarray(calib["R"], float)
        self.T = np.asarray(calib["T"], float).reshape(3)
        self.RL = np.asarray(calib["R_level"], float) if calib.get("R_level") is not None else np.eye(3)
        self.size = [np.asarray(calib["size1"]).ravel()[:2].astype(float),
                     np.asarray(calib["size2"]).ravel()[:2].astype(float)]
        self.C = [np.zeros(3), self.RL @ (-self.R.T @ self.T)]          # camera centres
        self.rv = [np.zeros(3), cv2.Rodrigues(self.R)[0].ravel()]
        self.tv = [np.zeros(3), self.T]

    def px(self, kp, v):
        return np.array([kp[0], kp[1]]) * self.size[v]

    def ray(self, kp, v):
        n = cv2.undistortPoints(self.px(kp, v).reshape(1, 1, 2), self.K[v], self.D[v]).ravel()
        d = np.array([n[0], n[1], 1.0])
        if v == 1:
            d = self.R.T @ d
        d = self.RL @ d
        return self.C[v], d / np.linalg.norm(d)

    def project(self, X, v):
        Xl = (self.RL.T @ np.asarray(X, float).reshape(-1, 3).T).T
        p, _ = cv2.projectPoints(Xl, self.rv[v], self.tv[v], self.K[v], self.D[v])
        return p.reshape(-1, 2)


def _conf(frames, t, j):
    kp = frames[t].get("keypoints") if t < len(frames) else None
    if not kp or j >= len(kp) or not kp[j] or len(kp[j]) < 3:
        return 0.0
    return float(kp[j][2])


def _healed(frames, t):
    return set(frames[t].get("healed_joints") or [])


def _ray_sphere(C, d, c, L):
    oc = C - c
    b = float(d @ oc)
    disc = b * b - (float(oc @ oc) - L * L)
    if disc < 0:
        miss = np.sqrt(max(0.0, float(oc @ oc) - b * b)) - L
        return [C - b * d] if miss < 0.15 * L else []      # ray just misses: closest point
    r = np.sqrt(disc)
    return [C + s * d for s in (-b - r, -b + r) if s > 0]


def bone_lengths(P, views, errs, max_err_px=10.0):
    """Median length per rigid bone from reliable frames. views = [framesL, framesR]."""
    n = len(P)
    reliable = np.isfinite(P).all(axis=2)
    for t in range(n):
        healed = _healed(views[0], t) | _healed(views[1], t)
        for j in range(NUM_KEYPOINTS):
            if reliable[t, j] and (j in healed or min(_conf(views[0], t, j), _conf(views[1], t, j)) < RELIABLE_CONF
                                   or not (np.isfinite(errs[t][j]) and errs[t][j] <= max_err_px)):
                reliable[t, j] = False
    out = {}
    for a, b, name, sigma in BONES:
        m = reliable[:, a] & reliable[:, b]
        lens = np.linalg.norm(P[m, a] - P[m, b], axis=1)
        if len(lens) >= MIN_SAMPLES:
            out[(a, b)] = dict(name=name, length=float(np.median(lens)), sigma=sigma, samples=int(len(lens)))
    return out


def _spread(P, bones):
    """Std of each bone's length over all frames where both ends exist (mm)."""
    res = {}
    for (a, b), info in bones.items():
        m = np.isfinite(P[:, a]).all(1) & np.isfinite(P[:, b]).all(1)
        lens = np.linalg.norm(P[m, a] - P[m, b], axis=1)
        res[info["name"]] = round(float(np.std(lens)), 1) if len(lens) > 1 else None
    return res


def _prediction(P, t, j, window=10):
    """Where joint j should be at frame t judging by its own track (linear between neighbours)."""
    n = len(P)
    prev = next((k for k in range(t - 1, max(-1, t - window - 1), -1) if np.isfinite(P[k, j]).all()), None)
    nxt = next((k for k in range(t + 1, min(n, t + window + 1)) if np.isfinite(P[k, j]).all()), None)
    if prev is not None and nxt is not None:
        w = (t - prev) / (nxt - prev)
        return (1 - w) * P[prev, j] + w * P[nxt, j]
    if prev is not None:
        return P[prev, j]
    if nxt is not None:
        return P[nxt, j]
    return None


def _bone_prediction(P, t, p, j, L, window=10):
    """Predict joint j from its parent p: parent's current position + the bone's direction
    interpolated from nearby frames. Better than the joint's own track when the whole limb moves fast."""
    n = len(P)
    ok = lambda k: np.isfinite(P[k, j]).all() and np.isfinite(P[k, p]).all()
    prev = next((k for k in range(t - 1, max(-1, t - window - 1), -1) if ok(k)), None)
    nxt = next((k for k in range(t + 1, min(n, t + window + 1)) if ok(k)), None)
    dirs = []
    for k in (prev, nxt):
        if k is not None:
            v = P[k, j] - P[k, p]
            dirs.append((k, v / (np.linalg.norm(v) + 1e-9)))
    if not dirs:
        return None
    if len(dirs) == 2:
        (k0, d0), (k1, d1) = dirs
        w = (t - k0) / (k1 - k0)
        d = (1 - w) * d0 + w * d1
    else:
        d = dirs[0][1]
    return P[t, p] + L * d / (np.linalg.norm(d) + 1e-9)


def recover(P, views, rig, bones):
    """Fill joints that only one camera really sees. Edits P in place; returns {frame: [joints]}."""
    recovered = {}
    for t in range(len(P)):
        healed = [_healed(views[0], t), _healed(views[1], t)]
        for j in RECOVER_ORDER:
            p = PARENT[j]
            info = bones.get((p, j))
            if info is None or not np.isfinite(P[t, p]).all():
                continue
            real = [_conf(views[v], t, j) >= REAL_CONF and j not in healed[v] for v in (0, 1)]
            present = np.isfinite(P[t, j]).all()
            if not any(real) or (present and all(real)):
                continue                       # nobody sees it, or both do and they agree
            cands = []
            for v in (0, 1):
                if real[v]:
                    C, d = rig.ray(views[v][t]["keypoints"][j], v)
                    cands += _ray_sphere(C, d, P[t, p], info["length"])
            if not cands:
                continue
            pred = _bone_prediction(P, t, p, j, info["length"])
            if pred is None:
                pred = _prediction(P, t, j)
            if pred is not None:
                best = min(cands, key=lambda x: np.linalg.norm(x - pred))
                if np.linalg.norm(best - pred) > MAX_JUMP_MM:
                    continue
            elif len(cands) == 1:
                best = cands[0]
            else:
                # no track to compare with: use the other camera's weak detection if it has one
                other = [v for v in (0, 1) if not real[v] and _conf(views[v], t, j) > 0.1]
                if not other:
                    continue
                v = other[0]
                obs = rig.px(views[v][t]["keypoints"][j], v)
                best = min(cands, key=lambda x: np.linalg.norm(rig.project(x, v)[0] - obs))
            P[t, j] = best
            recovered.setdefault(t, []).append(j)
    return recovered


def refine(P, views, rig, bones, recovered=None):
    """Per-frame robust least squares: reprojection to both cameras + soft bone lengths. Edits P.

    A recovered joint ignores the camera that could not see it (its 2D there is a guess) and is
    anchored near its ray x sphere position: when the ray runs almost perpendicular to the bone, the
    bone length barely fixes the depth, and without the anchor a weak pull could slide it along the ray."""
    if least_squares is None or not bones:
        return 0
    recovered = recovered or {}
    done = 0
    for t in range(len(P)):
        idx = [j for j in range(NUM_KEYPOINTS) if np.isfinite(P[t, j]).all()]
        if not idx:
            continue
        pos = {j: k for k, j in enumerate(idx)}
        rec = set(recovered.get(t, []))
        obs, w = [], []
        for v in (0, 1):
            healed = _healed(views[v], t)
            o = np.zeros((len(idx), 2)); ww = np.zeros(len(idx))
            for k, j in enumerate(idx):
                c = _conf(views[v], t, j)
                if c >= 0.3:
                    o[k] = rig.px(views[v][t]["keypoints"][j], v)
                    if j in healed:
                        ww[k] = 0.0 if j in rec else HEALED_WEIGHT
                    elif j in rec and c < REAL_CONF:
                        ww[k] = 0.0
                    else:
                        ww[k] = c
            obs.append(o); w.append(np.sqrt(ww) / SIGMA_PX)
        x0_pts = P[t, idx].copy()
        prior = np.array([ANCHOR_MM if j in rec else PRIOR_MM for j in idx])
        cons = [(pos[a], pos[b], info["length"], info["sigma"]) for (a, b), info in bones.items()
                if a in pos and b in pos]
        if not cons:
            continue

        def residual(x):
            X = x.reshape(-1, 3)
            r = [(w[v][:, None] * (rig.project(X, v) - obs[v])).ravel() for v in (0, 1)]
            r.append(np.array([(np.linalg.norm(X[a] - X[b]) - L) / s for a, b, L, s in cons]))
            r.append(((X - x0_pts) / prior[:, None]).ravel())
            return np.concatenate(r)

        x0 = P[t, idx].ravel()
        try:
            sol = least_squares(residual, x0, loss="huber", f_scale=2.0, method="trf", max_nfev=50)
            if sol.success or sol.status >= 0:
                P[t, idx] = sol.x.reshape(-1, 3)
                done += 1
        except Exception:
            pass
    return done


def fill_2d(P, views, rig, touched):
    """Put refined 3D joints back into a camera's 2D where that camera did not really see them."""
    filled = 0
    for t in range(len(P)):
        for v in (0, 1):
            kp = views[v][t].get("keypoints")
            if not kp:
                continue
            healed = _healed(views[v], t)
            changed = []
            for j in range(NUM_KEYPOINTS):
                if not np.isfinite(P[t, j]).all():
                    continue
                seen = _conf(views[v], t, j) >= REAL_CONF and j not in healed
                if seen or j not in touched.get(t, set()) | healed:
                    continue
                u = rig.project(P[t, j], v)[0] / rig.size[v]
                kp[j] = [float(u[0]), float(u[1]), 0.6]
                changed.append(j)
            if changed:
                views[v][t]["stereo_filled"] = changed
                filled += len(changed)
    return filled


def run(P, framesL, framesR, calib, errs):
    """All of step 2. Edits P and the 2D frames in place. Returns (report, recovered_by_frame)."""
    if not ENABLED:
        return dict(enabled=False), {}
    views = [framesL, framesR]
    rig = Rig(calib)
    bones = bone_lengths(P, views, errs)
    before = _spread(P, bones)
    recovered = recover(P, views, rig, bones)
    refined = refine(P, views, rig, bones, recovered)
    touched = {t: set(js) for t, js in recovered.items()}
    for t in range(len(P)):                        # healed joints are also re-estimated by the fit
        touched.setdefault(t, set()).update(_healed(framesL, t) | _healed(framesR, t))
    filled = fill_2d(P, views, rig, touched)
    after = _spread(P, bones)
    report = dict(enabled=True, refinement=least_squares is not None,
                  bones={info["name"]: dict(length_mm=round(info["length"], 1), samples=info["samples"],
                                            std_before_mm=before.get(info["name"]),
                                            std_after_mm=after.get(info["name"]))
                         for info in bones.values()},
                  joints_recovered=int(sum(len(v) for v in recovered.values())),
                  frames_refined=refined, joints_filled_2d=filled)
    return report, recovered
