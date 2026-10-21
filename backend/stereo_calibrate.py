#!/usr/bin/env python3
"""
Stereo calibration of the two cameras.

Run from the backend folder with the backend stopped:
    python stereo_calibrate.py                                   live capture
    python stereo_calibrate.py --from-folder calib_sessions\\<session>  re-run from saved photos
    python stereo_calibrate.py --from-video board.mp4 --floor-video floor.mp4
    python stereo_calibrate.py --selftest                        synthetic check

Live keys: SPACE capture pair | u undo | c calibrate and save | f floor level | q quit

Output: calibration.npz (K1 D1 K2 D2 R T size1 size2 rms square_mm R_level + check values).
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import sys
import time

import numpy as np
import cv2

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from triangulate import triangulate_pair, compute_floor_alignment

CHECKERBOARD = (int(os.getenv("CALIB_COLS", "9")), int(os.getenv("CALIB_ROWS", "6")))  # inner corners
SQUARE_MM = float(os.getenv("CALIB_SQUARE_MM", "80"))
LEFT_INDEX = int(os.getenv("CAMERA_LEFT_INDEX", "2"))
RIGHT_INDEX = int(os.getenv("CAMERA_RIGHT_INDEX", "0"))
CAP_W = int(os.getenv("CAMERA_WIDTH", "2560"))
CAP_H = int(os.getenv("CAMERA_HEIGHT", "1440"))
CAMERA_API = os.getenv("CAMERA_API", "msmf").lower()
EXPECTED_BASELINE_MM = float(os.getenv("EXPECTED_BASELINE_MM", "0") or 0)
BASELINE_TOL_PCT = float(os.getenv("CALIB_BASELINE_TOL_PCT", "3"))
FIX_K3 = os.getenv("CALIB_FIX_K3", "1") != "0"
MIN_PAIRS = 15
STILL_PX = 1.0           # max corner movement (px) between two grabs of a still board
TILT_MIN_DEG = 20.0
OUT = "calibration.npz"

CRIT_SUBPIX = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
CRIT_CALIB = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_COUNT, 100, 1e-7)

OBJP = np.zeros((CHECKERBOARD[0] * CHECKERBOARD[1], 3), np.float32)
OBJP[:, :2] = np.mgrid[0:CHECKERBOARD[0], 0:CHECKERBOARD[1]].T.reshape(-1, 2)
OBJP *= SQUARE_MM


def open_cam(idx, attempts=6, delay=1.0):
    api = cv2.CAP_DSHOW if CAMERA_API == "dshow" else (cv2.CAP_MSMF if os.name == "nt" else cv2.CAP_ANY)
    for a in range(attempts):
        cap = cv2.VideoCapture(idx, api)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAP_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAP_H)
        cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)          # focus must not change after calibration
        if cap.isOpened():
            ok, f = cap.read()
            if ok:
                return cap, f
        cap.release()
        if a < attempts - 1:
            print(f"  camera {idx} not ready, retrying ({a + 1}/{attempts})...")
            time.sleep(delay)
    return None, None


def cam_info(cap, frame, idx):
    g = lambda p: float(cap.get(p))
    info = dict(index=idx, width=frame.shape[1], height=frame.shape[0], api=CAMERA_API,
                autofocus=g(cv2.CAP_PROP_AUTOFOCUS), focus=g(cv2.CAP_PROP_FOCUS), zoom=g(cv2.CAP_PROP_ZOOM))
    print(f"  camera {idx}: {info['width']}x{info['height']} ({CAMERA_API}), autofocus={info['autofocus']:g}, "
          f"focus={info['focus']:g}, zoom={info['zoom']:g}")
    if info["autofocus"] not in (0.0, -1.0):
        print(f"  WARNING camera {idx}: autofocus still reports ON -- switch it off in the camera settings")
    return info


def grab_pair(capL, capR):
    capL.grab(); capR.grab()
    okL, fL = capL.retrieve(); okR, fR = capR.retrieve()
    return (fL, fR) if (okL and okR) else (None, None)


def find_corners(gray, fast_scale=None):
    """fast_scale: detect on a downscaled copy (live preview, no sub-pixel refinement)."""
    if fast_scale:
        small = cv2.resize(gray, None, fx=fast_scale, fy=fast_scale, interpolation=cv2.INTER_AREA)
        ok, c = cv2.findChessboardCorners(small, CHECKERBOARD, cv2.CALIB_CB_ADAPTIVE_THRESH +
                                          cv2.CALIB_CB_NORMALIZE_IMAGE + cv2.CALIB_CB_FAST_CHECK)
        return ok, (c / fast_scale if ok else None)
    ok, c = cv2.findChessboardCorners(gray, CHECKERBOARD, cv2.CALIB_CB_ADAPTIVE_THRESH +
                                      cv2.CALIB_CB_NORMALIZE_IMAGE)
    if ok:
        c = cv2.cornerSubPix(gray, c, (11, 11), (-1, -1), CRIT_SUBPIX)
    return ok, c


def gray(f):
    return cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) if f.ndim == 3 else f


def capture_still(grab):
    """Two grabs ~0.15 s apart; accepted only if the board is found in both views and has not moved.
    grab() -> (frameL, frameR), or (None, None) when no pair is available."""
    fL1, fR1 = grab()
    if fL1 is None:
        return None, "could not grab a pair"
    time.sleep(0.15)
    fL2, fR2 = grab()
    if fL2 is None:
        return None, "could not grab a pair"
    res = []
    for f in (fL1, fR1, fL2, fR2):
        ok, c = find_corners(gray(f))
        if not ok:
            return None, "board not found in both views -- hold it fully inside both pictures"
        res.append(c)
    move = max(np.abs(res[0] - res[2]).max(), np.abs(res[1] - res[3]).max())
    if move > STILL_PX:
        return None, f"board moved {move:.1f} px between grabs -- hold it still"
    return (fL2, fR2, res[2], res[3]), "ok"


class Coverage:
    GRID = 4

    def __init__(self):
        self.cells = [np.zeros((self.GRID, self.GRID), bool), np.zeros((self.GRID, self.GRID), bool)]
        self.pairs = []

    @staticmethod
    def shape_stats(c, size):
        p = c.reshape(CHECKERBOARD[1], CHECKERBOARD[0], 2)
        tl, tr, bl, br = p[0, 0], p[0, -1], p[-1, 0], p[-1, -1]
        left, right = np.linalg.norm(bl - tl), np.linalg.norm(br - tr)
        top, bot = np.linalg.norm(tr - tl), np.linalg.norm(br - bl)
        width = (top + bot) / 2 / size[0]
        return width, abs(np.log(left / right)), abs(np.log(top / bot))

    def add(self, cL, cR, sizeL, sizeR):
        for k, (c, s) in enumerate(((cL, sizeL), (cR, sizeR))):
            xy = c.reshape(-1, 2)
            gx = np.clip((xy[:, 0] / s[0] * self.GRID).astype(int), 0, self.GRID - 1)
            gy = np.clip((xy[:, 1] / s[1] * self.GRID).astype(int), 0, self.GRID - 1)
            self.cells[k][gy, gx] = True
        w, th, tv = self.shape_stats(cL, sizeL)
        self.pairs.append(dict(width=w, tiltH=th, tiltV=tv))

    def pop(self, all_corners, sizeL, sizeR):
        self.__init__()
        for cL, cR in all_corners:
            self.add(cL, cR, sizeL, sizeR)

    def summary(self):
        n = len(self.pairs)
        # foreshortening log-ratio 0.08 ~ 20 deg tilt at these distances
        th = sum(p["tiltH"] > 0.08 for p in self.pairs)
        tv = sum(p["tiltV"] > 0.08 for p in self.pairs)
        ws = [p["width"] for p in self.pairs]
        spread = (max(ws) / min(ws)) if ws else 0
        cov = [c.mean() for c in self.cells]
        ok = dict(n=n >= 25, area=min(cov) >= 0.75, tilt=th >= 6 and tv >= 6, spread=spread >= 1.6)  # one flag per line
        lines = [f"pairs {n} (aim 25-40)",
                 f"image covered L {100 * cov[0]:.0f}% R {100 * cov[1]:.0f}% (aim 75%+)",
                 f"tilted left/right {th}, up/down {tv} (aim 6+ each)",
                 f"near/far size ratio {spread:.1f} (aim 1.6+)"]
        return lines, ok

    def draw(self, img, k, scale):
        h, w = img.shape[:2]
        ov = img.copy()
        for gy in range(self.GRID):
            for gx in range(self.GRID):
                x0, y0 = gx * w // self.GRID, gy * h // self.GRID
                x1, y1 = (gx + 1) * w // self.GRID, (gy + 1) * h // self.GRID
                if self.cells[k][gy, gx]:
                    cv2.rectangle(ov, (x0, y0), (x1, y1), (0, 160, 0), -1)
                cv2.rectangle(img, (x0, y0), (x1, y1), (90, 90, 90), 1)
        cv2.addWeighted(ov, 0.25, img, 0.75, 0, dst=img)


def depth_axis(R):
    d = np.array([0, 0, 1.0]) + np.asarray(R).T @ np.array([0, 0, 1.0])
    return d / np.linalg.norm(d)


def board_edges_3d(X):
    P = X.reshape(CHECKERBOARD[1], CHECKERBOARD[0], 3)
    ex = (P[:, 1:] - P[:, :-1]).reshape(-1, 3)
    ey = (P[1:, :] - P[:-1, :]).reshape(-1, 3)
    return ex, ey


def scale_by_direction(Xs, R):
    """Measured square size relative to SQUARE_MM: (across the image, towards the cameras, n depth edges, max depth share)."""
    d = depth_axis(R)
    L, U = [], []
    for X in Xs:
        for e in board_edges_3d(X):
            n = np.linalg.norm(e, axis=1)
            L.append(n / SQUARE_MM); U.append((e @ d / n) ** 2)
    L, U = np.concatenate(L), np.concatenate(U)
    A = np.stack([np.ones_like(U), U], 1)
    a, b = np.linalg.lstsq(A, L, rcond=None)[0]
    return float(a), float(a + b), int((U > 0.5).sum()), float(U.max())


def tilt_angles(rvecs):
    out = []
    for rv in rvecs:
        Rb, _ = cv2.Rodrigues(rv)
        out.append(np.degrees(np.arccos(abs(Rb[2, 2]))))
    return np.array(out)


def calibrate(objpoints, imgL, imgR, sizeL, sizeR):
    """Mono calibration, removal of bad pairs, joint stereo refinement. Returns (calib, report lines)."""
    rep = []
    mono_flags = cv2.CALIB_FIX_K3 if FIX_K3 else 0

    def mono(o, l, r):
        a = cv2.calibrateCameraExtended(o, l, sizeL, None, None, flags=mono_flags, criteria=CRIT_CALIB)
        b = cv2.calibrateCameraExtended(o, r, sizeR, None, None, flags=mono_flags, criteria=CRIT_CALIB)
        return a, b

    def stereo(o, l, r, K1, D1, K2, D2, flags):
        res = cv2.stereoCalibrateExtended(o, l, r, K1, D1, K2, D2, sizeL, np.eye(3), np.zeros((3, 1)),
                                          flags=flags, criteria=CRIT_CALIB)
        return dict(rms=float(res[0]), K1=res[1], D1=res[2], K2=res[3], D2=res[4], R=res[5], T=res[6],
                    per=np.asarray(res[-1]).reshape(-1, 2).mean(1))

    # OpenCV refines the camera matrices in place, so pass copies
    cp = lambda a, b: (a[1].copy(), a[2].copy(), b[1].copy(), b[2].copy())
    joint_flags = cv2.CALIB_USE_INTRINSIC_GUESS | (cv2.CALIB_FIX_K3 if FIX_K3 else 0)
    o, l, r = list(objpoints), list(imgL), list(imgR)
    a, b = mono(o, l, r)
    # judge bad pairs after joint refinement; with fixed mono intrinsics the errors are inflated
    s0 = stereo(o, l, r, *cp(a, b), joint_flags)
    med = float(np.median(s0["per"])); thr = max(1.0, 2.0 * med)
    keep = [i for i in range(len(o)) if s0["per"][i] <= thr]
    rep.append(f"pass 1 (all {len(o)} pairs): stereo RMS {s0['rms']:.3f} px, per-pair median {med:.2f}, "
               f"worst {s0['per'].max():.2f} px")
    dropped = [i + 1 for i in range(len(o)) if i not in keep]
    if dropped and len(keep) >= MIN_PAIRS:
        o = [o[i] for i in keep]; l = [l[i] for i in keep]; r = [r[i] for i in keep]
        rep.append(f"dropped {len(dropped)} pair(s) with error > {thr:.2f} px: {dropped}")
        a, b = mono(o, l, r)
    elif dropped:
        rep.append(f"{len(dropped)} pair(s) above {thr:.2f} px kept (dropping would leave < {MIN_PAIRS})")
        keep = list(range(len(o)))
    rep.append(f"mono RMS: left {a[0]:.3f} px, right {b[0]:.3f} px  ({len(o)} pairs; k3 {'fixed' if FIX_K3 else 'free'})")
    s_fix = stereo(o, l, r, *cp(a, b), cv2.CALIB_FIX_INTRINSIC)
    s = stereo(o, l, r, *cp(a, b), joint_flags)
    for name, K0, K1 in (("left", a[1], s["K1"]), ("right", b[1], s["K2"])):
        ch = 100 * (K1[0, 0] / K0[0, 0] - 1)
        chy = 100 * (K1[1, 1] / K0[1, 1] - 1)
        dc = np.hypot(K1[0, 2] - K0[0, 2], K1[1, 2] - K0[1, 2])
        rep.append(f"joint refinement changed {name} camera: fx {ch:+.2f}%, fy {chy:+.2f}%, centre moved {dc:.1f} px")
        if abs(ch) > 3 or abs(chy) > 3:
            rep.append(f"  WARNING: large change -- the photos do not pin down the {name} camera well; "
                       f"add tilted (also forwards/backwards) and near/far photos")
    rep.append(f"stereo RMS: {s['rms']:.3f} px (fixed intrinsics would give {s_fix['rms']:.3f})  -- aim < 1.0")

    base = float(np.linalg.norm(s["T"]))
    ang = float(np.degrees(np.arccos(np.clip((np.trace(s["R"]) - 1) / 2, -1, 1))))
    rep.append(f"baseline |T|: {base:.1f} mm, angle between cameras {ang:.1f} deg, "
               f"fx L {s['K1'][0, 0]:.1f} / R {s['K2'][0, 0]:.1f} px at {sizeL[0]}x{sizeL[1]}")
    if EXPECTED_BASELINE_MM > 0:
        dev = 100 * (base - EXPECTED_BASELINE_MM) / EXPECTED_BASELINE_MM
        tag = "OK" if abs(dev) <= BASELINE_TOL_PCT else "WARNING -- check the square size / recapture"
        rep.append(f"  tape-measured baseline {EXPECTED_BASELINE_MM:.0f} mm -> {dev:+.1f}%  [{tag}]")

    Xs = [triangulate_pair(cl.reshape(-1, 2), cr.reshape(-1, 2), s) for cl, cr in zip(l, r)]
    sc_lat, sc_dep, n_dep, umax = scale_by_direction(Xs, s["R"])
    rep.append(f"SELF-CHECK square size in 3D (calibration photos): across the image {SQUARE_MM * sc_lat:.2f} mm "
               f"({100 * (sc_lat - 1):+.2f}%), towards the cameras {SQUARE_MM * sc_dep:.2f} mm ({100 * (sc_dep - 1):+.2f}%)"
               f"  [{n_dep} edges mostly in depth]")
    if n_dep < 50:
        rep.append("  (few edges point at the cameras: tilt the board more so the depth direction is tested)")
    tl = tilt_angles(a[3])
    rep.append(f"board tilt (left camera): median {np.median(tl):.0f} deg, max {tl.max():.0f} deg, "
               f"{int((tl > TILT_MIN_DEG).sum())} of {len(tl)} photos tilted > {TILT_MIN_DEG:.0f} deg")
    dist = [float(np.linalg.norm(t)) for t in a[4]]
    rep.append(f"board distance (left camera): {min(dist) / 1000:.2f} - {max(dist) / 1000:.2f} m")

    calib = dict(K1=s["K1"], D1=s["D1"], K2=s["K2"], D2=s["D2"], R=s["R"], T=s["T"],
                 size1=np.array(sizeL), size2=np.array(sizeR), rms=np.array(s["rms"]),
                 square_mm=np.array(SQUARE_MM), n_pairs=np.array(len(o)),
                 pairs_used=np.array([i + 1 for i in keep]), per_pair_err=s["per"],
                 check_scale_lateral=np.array(sc_lat), check_scale_depth=np.array(sc_dep),
                 tilt_median_deg=np.array(float(np.median(tl))))
    return calib, rep


def floor_level(pairs_LR, calib):
    """Board lying on the floor -> R_level (floor horizontal), report lines, check values."""
    Xs = [triangulate_pair(cl.reshape(-1, 2), cr.reshape(-1, 2), calib) for cl, cr in pairs_LR]
    X = np.mean(Xs, 0)
    R_level = compute_floor_alignment(X)
    Xc = X - X.mean(0)
    _, _, vt = np.linalg.svd(Xc)
    resid = float(np.sqrt(((Xc @ vt[2]) ** 2).mean()))
    d = depth_axis(calib["R"])
    rep, vals = [f"floor: {len(Xs)} still photo(s) averaged, plane residual {resid:.1f} mm (flatness)"], {}
    for name, e in zip(("9-corner", "6-corner"), board_edges_3d(X)):
        n = np.linalg.norm(e, axis=1)
        u = float(np.median((e @ d / n) ** 2))
        size = float(np.mean(n))
        vals[name] = (size, u)
        rep.append(f"  squares along the board's {name} direction: {size:.2f} mm ({100 * (size / SQUARE_MM - 1):+.2f}%), "
                   f"pointing at the cameras {u:.2f} (0 = across, 1 = straight at them)")
    dep = max(vals.values(), key=lambda v: v[1])
    lat = min(vals.values(), key=lambda v: v[1])
    err = 100 * (dep[0] / SQUARE_MM - 1)
    lat_err = 100 * (lat[0] / SQUARE_MM - 1)
    if abs(err) <= 1.0:
        tag = "OK"
    elif abs(lat_err) > 1.0:
        tag = ("WARNING -- BOTH directions are off: overall scale. Check CALIB_SQUARE_MM (measure the printed "
               "squares) and recapture with more near/far photos")
    else:
        tag = "WARNING -- depth is not accurate; recapture with more tilted / near / far photos"
    rep.append(f"FLOOR CHECK (depth direction): {dep[0]:.2f} mm vs {SQUARE_MM:.0f} mm -> {err:+.2f}%  [{tag}]")
    return R_level, rep, dict(floor_residual_mm=np.array(resid), floor_square_depth_mm=np.array(dep[0]),
                              floor_square_depth_err_pct=np.array(err))


def save(calib, meta, out=OUT):
    if os.path.exists(out):
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        bak = os.path.join(os.path.dirname(os.path.abspath(out)), f"calibration_backup_{stamp}.npz")
        shutil.copy(out, bak)
        print(f"  previous {os.path.basename(out)} kept as {os.path.basename(bak)}")
    data = dict(calib)
    data["meta_json"] = np.array(json.dumps(meta))
    np.savez(out, **data)
    print(f"  saved {out}")


def load(path=OUT):
    if not os.path.exists(path):
        return None
    d = np.load(path)
    return {k: d[k] for k in d.files}


def render_preview(fL, fR, cov, msg="", det=None):
    """Side-by-side preview: board corners per view, coverage grid and status lines. Shared by the terminal and the web page.
    det: optional ((foundL, cornersL), (foundR, cornersR)) already computed elsewhere (the web page detects in a
    background thread so the stream is not held back by the ~150 ms per view that findChessboardCorners takes)."""
    sc, disp_w = 0.33, 800
    if det is None:
        det = (find_corners(gray(fL), fast_scale=sc), find_corners(gray(fR), fast_scale=sc))
    (fdL, cL), (fdR, cR) = det
    # Scale each view on its own: the two cameras can deliver different sizes or channel counts,
    # and cv2.hconcat needs equal heights and types.
    fL3 = fL if fL.ndim == 3 else cv2.cvtColor(fL, cv2.COLOR_GRAY2BGR)
    fR3 = fR if fR.ndim == 3 else cv2.cvtColor(fR, cv2.COLOR_GRAY2BGR)
    dsL = disp_w / fL3.shape[1]
    dL = cv2.resize(fL3, None, fx=dsL, fy=dsL)
    dsR = dL.shape[0] / fR3.shape[0]
    dR = cv2.resize(fR3, (max(1, round(fR3.shape[1] * dsR)), dL.shape[0]))
    cov.draw(dL, 0, dsL); cov.draw(dR, 1, dsR)
    if fdL:
        cv2.drawChessboardCorners(dL, CHECKERBOARD, (cL * dsL).astype(np.float32), True)
    if fdR:
        cv2.drawChessboardCorners(dR, CHECKERBOARD, (cR * dsR).astype(np.float32), True)
    disp = cv2.hconcat([dL, dR])
    lines, ok = cov.summary()
    col = (0, 200, 0) if (fdL and fdR) else (0, 0, 255)
    cv2.putText(disp, f"board in both: {'YES' if (fdL and fdR) else 'no'}", (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2)
    for k, (t, good) in enumerate(zip(lines, ok.values())):
        cv2.putText(disp, t, (10, 50 + 22 * k), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (0, 200, 0) if good else (0, 165, 255), 2)
    if msg:
        cv2.putText(disp, msg, (10, disp.shape[0] - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
    return disp


class CalibrationSession:
    """Capture, calibrate and floor-level state. Used by the terminal loop (live) and the web calibration page."""

    def __init__(self, folder, sizeL, sizeR, out=OUT, meta=None):
        self.folder, self.sizeL, self.sizeR, self.out = folder, sizeL, sizeR, out
        self.meta = meta or {}
        self.objpoints, self.imgL, self.imgR, self.saved = [], [], [], []
        self.cov, self.calib = Coverage(), None
        os.makedirs(folder, exist_ok=True)

    def _path(self, k, side):
        return os.path.join(self.folder, f"pair_{k:02d}_{side}.png")

    def _write_report(self, rep, mode):
        with open(os.path.join(self.folder, "report.txt"), mode, encoding="utf-8") as f:
            f.write("\n".join(rep) + "\n")

    def load_pairs(self):
        """Resume: reload earlier captured pairs from this folder. Returns how many were usable."""
        for pL in sorted(glob.glob(os.path.join(self.folder, "pair_*_L.png"))):
            a_, b_ = cv2.imread(pL, 0), cv2.imread(pL[:-6] + "_R.png", 0)
            if a_ is None or b_ is None or (a_.shape[1], a_.shape[0]) != self.sizeL:
                continue
            okL_, cL_ = find_corners(a_); okR_, cR_ = find_corners(b_)
            if okL_ and okR_:
                self.objpoints.append(OBJP.copy()); self.imgL.append(cL_); self.imgR.append(cR_)
                self.cov.add(cL_, cR_, self.sizeL, self.sizeR)
        return len(self.objpoints)

    def add(self, fL, fR, cL, cR):
        """Store an accepted still pair (photos + corners). Returns its pair number."""
        k = len(self.objpoints) + 1
        while os.path.exists(self._path(k, "L")):
            k += 1
        cv2.imwrite(self._path(k, "L"), fL)
        cv2.imwrite(self._path(k, "R"), fR)
        self.objpoints.append(OBJP.copy()); self.imgL.append(cL); self.imgR.append(cR)
        self.cov.add(cL, cR, self.sizeL, self.sizeR)
        self.saved.append(k)
        return k

    def undo(self):
        """Remove the most recent pair added in this run. Returns the pair count left."""
        k = self.saved.pop()
        for s in "LR":
            if os.path.exists(self._path(k, s)):
                os.remove(self._path(k, s))
        self.objpoints.pop(); self.imgL.pop(); self.imgR.pop()
        self.cov.pop(list(zip(self.imgL, self.imgR)), self.sizeL, self.sizeR)
        return len(self.objpoints)

    def calibrate(self):
        """Stereo calibration over all pairs; saves calibration.npz. Returns the report lines."""
        if len(self.objpoints) < MIN_PAIRS:
            raise ValueError(f"need at least {MIN_PAIRS} pairs (have {len(self.objpoints)})")
        calib, rep = calibrate(self.objpoints, self.imgL, self.imgR, self.sizeL, self.sizeR)
        rep = ["coverage: " + "; ".join(self.cov.summary()[0])] + rep
        self.meta["report"] = rep
        save(calib, self.meta, self.out)
        self._write_report(rep, "w")
        self.calib = calib
        return rep

    def set_floor(self, grab):
        """Board lying flat on the floor: capture still photos and save R_level. Returns the report lines."""
        cal = self.calib or load(self.out)
        if cal is None:
            raise ValueError("no calibration yet -- press c first")
        if tuple(int(v) for v in np.asarray(cal["size1"]).ravel()[:2]) != self.sizeL:
            raise ValueError(f"calibration.npz was made at {np.asarray(cal['size1']).tolist()}, "
                             f"cameras are {self.sizeL} -- recalibrate")
        got = []
        for _ in range(5):
            res, _ = capture_still(grab)
            if res is not None:
                got.append(res)
        if len(got) < 2:
            raise ValueError("floor board not found / not still in both views -- reposition and retry")
        cv2.imwrite(os.path.join(self.folder, "floor_L.png"), got[0][0])
        cv2.imwrite(os.path.join(self.folder, "floor_R.png"), got[0][1])
        R_level, rep, vals = floor_level([(g[2], g[3]) for g in got], cal)
        cal = dict(cal); cal["R_level"] = R_level; cal.update(vals)
        m = json.loads(str(cal.pop("meta_json"))) if "meta_json" in cal else dict(self.meta)
        m["floor_report"] = rep
        save(cal, m, self.out)
        self._write_report(rep, "a")
        self.calib = cal
        return rep


def live(resume=None):
    capL, fL0 = open_cam(LEFT_INDEX)
    capR, fR0 = open_cam(RIGHT_INDEX)
    if capL is None or capR is None:
        print("ERROR: could not open both cameras. Close the backend / OBS / Zoom / Camera app, check "
              "CAMERA_LEFT_INDEX / CAMERA_RIGHT_INDEX in .env (python find_cameras.py), then retry.")
        for c in (capL, capR):
            if c is not None:
                c.release()
        return
    infoL, infoR = cam_info(capL, fL0, LEFT_INDEX), cam_info(capR, fR0, RIGHT_INDEX)
    sizeL, sizeR = (infoL["width"], infoL["height"]), (infoR["width"], infoR["height"])
    if sizeL != (CAP_W, CAP_H) or sizeR != (CAP_W, CAP_H):
        print(f"ERROR: cameras deliver {sizeL} / {sizeR}, not the requested {CAP_W}x{CAP_H}. The calibration "
              f"must use the SAME size as the recordings -- fix CAMERA_WIDTH/HEIGHT in .env.")
        capL.release(); capR.release(); return

    folder = resume or os.path.join("calib_sessions", datetime.datetime.now().strftime("%Y-%m-%d_%H%M"))
    cs = CalibrationSession(folder, sizeL, sizeR, OUT, meta=dict(
        date=datetime.datetime.now().isoformat(timespec="seconds"), session=folder,
        camera_left=infoL, camera_right=infoR, board=list(CHECKERBOARD), square_mm=SQUARE_MM))
    if resume:
        print(f"resumed {folder}: {cs.load_pairs()} earlier pairs loaded")
    print(f"photos are saved in {folder}")
    grab = lambda: grab_pair(capL, capR)
    win = "Stereo calibration  (SPACE capture | u undo | c calibrate | f floor | q quit)"
    msg, msg_t = "", 0.0
    while True:
        okL, fL = capL.read(); okR, fR = capR.read()
        if not (okL and okR):
            continue
        cv2.imshow(win, render_preview(fL, fR, cs.cov, msg if time.time() - msg_t < 3 else ""))
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break
        elif key == ord(" "):
            res, why = capture_still(grab)
            if res is None:
                msg, msg_t = why, time.time(); print("  " + why); continue
            k = cs.add(*res)
            msg, msg_t = f"captured pair #{k} ({len(cs.objpoints)} in total)", time.time(); print("  " + msg)
        elif key == ord("u") and cs.saved:
            msg, msg_t = f"undo -> {cs.undo()} pairs", time.time(); print("  " + msg)
        elif key == ord("c"):
            if len(cs.objpoints) < MIN_PAIRS:
                msg, msg_t = f"need at least {MIN_PAIRS} pairs (have {len(cs.objpoints)})", time.time()
                print("  " + msg); continue
            print("Calibrating ...")
            try:
                rep = cs.calibrate()
            except Exception as ex:
                print(f"  calibration error: {ex} -- captures kept; add pairs and press c again"); continue
            print("\n".join("  " + x for x in rep))
            print("  NEXT: lay the board FLAT on the floor where the athlete stands (both cameras see it), press f.")
            print("  (the old floor level is NOT kept -- it belongs to the old calibration)")
        elif key == ord("f"):
            try:
                rep = cs.set_floor(grab)
            except ValueError as ex:
                print("  " + str(ex)); continue
            print("\n".join("  " + x for x in rep))
            print("  floor level saved. Re-process a clip to see the skeleton upright.")
    capL.release(); capR.release(); cv2.destroyAllWindows()


def from_folder(folders, out=OUT):
    """Calibrate from one or more saved session folders. Floor photos are taken from the last folder that has them."""
    folders = [folders] if isinstance(folders, str) else list(folders)
    Ls = [p for f in folders for p in sorted(glob.glob(os.path.join(f, "pair_*_L.png")))]
    folder = folders[-1]
    if not Ls:
        sys.exit(f"no pair_XX_L.png photos in {folders}")
    objpoints, imgL, imgR, size, src = [], [], [], None, []
    for pL in Ls:
        pR = pL[:-6] + "_R.png"
        a, b = cv2.imread(pL, 0), cv2.imread(pR, 0)
        if a is None or b is None:
            continue
        okL, cL = find_corners(a); okR, cR = find_corners(b)
        if okL and okR:
            objpoints.append(OBJP.copy()); imgL.append(cL); imgR.append(cR)
            size = (a.shape[1], a.shape[0])
            src.append(os.path.dirname(pL))
        else:
            print(f"  {os.path.basename(pL)}: board not found in both, skipped")
    print(f"{len(objpoints)} usable pairs from {', '.join(folders)}")
    if len(objpoints) < MIN_PAIRS:
        sys.exit(f"need at least {MIN_PAIRS} pairs")
    cov = Coverage()
    for cl, cr in zip(imgL, imgR):
        cov.add(cl, cr, size, size)
    calib, rep = calibrate(objpoints, imgL, imgR, size, size)
    rep = ["coverage: " + "; ".join(cov.summary()[0])] + rep
    if len(folders) > 1:
        # a session that fits clearly worse suggests the cameras moved between sessions
        used = [int(i) - 1 for i in np.asarray(calib["pairs_used"]).ravel()]
        err = np.asarray(calib["per_pair_err"]).ravel()
        for f in folders:
            n_all = sum(1 for x in src if x == os.path.normpath(f) or x == f)
            e = [err[k] for k, i in enumerate(used) if src[i] in (f, os.path.normpath(f))]
            rep.append(f"session {os.path.basename(os.path.normpath(f))}: {len(e)} of {n_all} pairs kept, "
                       f"median pair error {np.median(e) if e else float('nan'):.2f} px")
        rep.append("  (one session clearly worse than the other = cameras probably moved in between: "
                   "do NOT combine)")
    floor = []
    ffold = next((f for f in reversed(folders) if glob.glob(os.path.join(f, "floor*_L.png"))), None)
    for fl in sorted(glob.glob(os.path.join(ffold, "floor*_L.png"))) if ffold else []:
        fr = fl[:-6] + "_R.png"
        if os.path.exists(fr):
            okL, cL = find_corners(cv2.imread(fl, 0)); okR, cR = find_corners(cv2.imread(fr, 0))
            if okL and okR:
                floor.append((cL, cR))
    if floor:
        R_level, frep, vals = floor_level(floor, calib)
        calib["R_level"] = R_level; calib.update(vals); rep += frep
    else:
        rep.append("no floor photos (floor*_L.png / floor*_R.png) -> floor level NOT set")
    print("\n".join("  " + x for x in rep))
    save(calib, dict(date=datetime.datetime.now().isoformat(timespec="seconds"), session=folders,
                     source="from-folder", report=rep), out)
    return calib, rep


def _frames(video=None, left=None, right=None):
    if video:
        cap = cv2.VideoCapture(video)
        while True:
            ok, f = cap.read()
            if not ok:
                break
            h = f.shape[1] // 2
            yield f[:, :h], f[:, h:]
        cap.release()
    else:
        cL, cR = cv2.VideoCapture(left), cv2.VideoCapture(right)
        while True:
            okL, fL = cL.read(); okR, fR = cR.read()
            if not (okL and okR):
                break
            yield fL, fR
        cL.release(); cR.release()


def still_frames(frames, still_px=STILL_PX, min_run=3, label="", fast_scale=0.25):
    """The cameras are not hardware-synchronised, so only moments where the board is still in both views are used.
        Returns (frameL, frameR, cornersL, cornersR) for the middle frame of each still run."""
    runs, cur, prev, n = [], [], None, 0
    for fL, fR in frames:
        n += 1
        gL, gR = gray(fL), gray(fR)
        okL, qL = find_corners(gL, fast_scale=fast_scale)
        okR, qR = find_corners(gR, fast_scale=fast_scale) if okL else (False, None)
        full = None
        if okL and okR:
            if prev is None or (np.abs(qL - prev[0]).max() < 6 and np.abs(qR - prev[1]).max() < 6):
                aL, cL = find_corners(gL); aR, cR = find_corners(gR)
                if aL and aR:
                    full = (cL, cR)
            prev = (qL, qR)
        else:
            prev = None
        if full is not None and cur and max(np.abs(full[0] - cur[-1][2]).max(),
                                            np.abs(full[1] - cur[-1][3]).max()) < still_px:
            cur.append((fL, fR, full[0], full[1]))
        else:
            if len(cur) >= min_run:
                runs.append(cur)
            cur = [(fL, fR, full[0], full[1])] if full is not None else []
        if n % 100 == 0:
            print(f"  {label} frame {n}: {len(runs)} still moments so far")
    if len(cur) >= min_run:
        runs.append(cur)
    print(f"  {label}{n} frames read, {len(runs)} still moments found")
    return [r[len(r) // 2] for r in runs]


def pick_diverse(cands, max_pairs, min_move_px=40):
    """Drop near-duplicate poses and keep at most max_pairs."""
    kept = []
    for c in cands:
        if all(np.mean(np.linalg.norm(c[2] - k[2], axis=2)) > min_move_px or
               np.mean(np.linalg.norm(c[3] - k[3], axis=2)) > min_move_px for k in kept):
            kept.append(c)
    if len(kept) > max_pairs:
        idx = np.linspace(0, len(kept) - 1, max_pairs).round().astype(int)
        kept = [kept[i] for i in idx]
    return kept


def from_video(video=None, left=None, right=None, floor_video=None, out=OUT, max_pairs=40):
    session = os.path.join("calib_sessions", datetime.datetime.now().strftime("%Y-%m-%d_%H%M") + "_video")
    os.makedirs(session, exist_ok=True)
    print(f"reading {video or (left + ' + ' + right)} ...")
    cands = still_frames(_frames(video, left, right), label="board: ")
    pairs = pick_diverse(cands, max_pairs)
    print(f"  {len(pairs)} different still poses kept (of {len(cands)})")
    if len(pairs) < MIN_PAIRS:
        sys.exit(f"only {len(pairs)} usable poses -- need {MIN_PAIRS}+. Move the board SLOWLY and HOLD it still "
                 f"~1 s at each new position/tilt, with the whole board visible in both cameras.")
    for k, (fL, fR, _, _) in enumerate(pairs, 1):
        cv2.imwrite(os.path.join(session, f"pair_{k:02d}_L.png"), fL)
        cv2.imwrite(os.path.join(session, f"pair_{k:02d}_R.png"), fR)
    if floor_video:
        print(f"reading floor video {floor_video} ...")
        fl = still_frames(_frames(floor_video), label="floor: ", fast_scale=0.5)   # flat board looks small
        fl = fl[:: max(1, len(fl) // 5)][:5]
        for k, (fL, fR, _, _) in enumerate(fl, 1):
            cv2.imwrite(os.path.join(session, f"floor_{k:02d}_L.png"), fL)
            cv2.imwrite(os.path.join(session, f"floor_{k:02d}_R.png"), fR)
        print(f"  {len(fl)} floor photos kept")
    print(f"photos saved in {session}")
    return from_folder(session, out)


def selftest(video=False):
    """Synthetic two-camera rig: the calibration must recover the true baseline, focal length and rotation,
        and the square-size checks must give ~80 mm."""
    import tempfile
    rng = np.random.default_rng(7)
    W, H = 2560, 1440
    Ktrue = [np.array([[1770.0, 0, 1290], [0, 1772.0, 715], [0, 0, 1]]),
             np.array([[1745.0, 0, 1270], [0, 1748.0, 730], [0, 0, 1]])]
    centres = [np.array([-1828.0, -2000, 0]), np.array([1828.0, -2000, 0])]
    target = np.array([0.0, -900, 2400])

    def look_at(c, t):
        z = (t - c) / np.linalg.norm(t - c)
        x = np.cross(np.array([0, 1.0, 0]), z); x /= np.linalg.norm(x)
        y = np.cross(z, x)
        return np.stack([x, y, z])
    Rw = [look_at(c, target) for c in centres]
    R_true = Rw[1] @ Rw[0].T
    T_true = Rw[1] @ (centres[0] - centres[1])

    s = 2.0
    sq = SQUARE_MM
    nx, ny = CHECKERBOARD[0] + 1, CHECKERBOARD[1] + 1
    tw, th = int((nx + 2) * sq * s), int((ny + 2) * sq * s)
    tex = np.full((th, tw), 255, np.uint8)
    for i in range(nx):
        for j in range(ny):
            if (i + j) % 2 == 0:
                x0, y0 = int((i + 1) * sq * s), int((j + 1) * sq * s)
                tex[y0:y0 + int(sq * s), x0:x0 + int(sq * s)] = 0
    A = np.array([[1 / s, 0, -2 * sq], [0, 1 / s, -2 * sq], [0, 0, 1]])

    def render(Rb, tb, k):
        Rc = Rw[k] @ Rb
        tc = Rw[k] @ (tb - centres[k])
        Hm = Ktrue[k] @ np.column_stack([Rc[:, 0], Rc[:, 1], tc]) @ A
        img = cv2.warpPerspective(tex, Hm, (W, H), flags=cv2.INTER_AREA, borderValue=150)
        img = cv2.GaussianBlur(img, (3, 3), 0.7)
        return np.clip(img.astype(int) + rng.integers(-3, 4, img.shape), 0, 255).astype(np.uint8)

    def rot(ax, deg):
        return cv2.Rodrigues(np.array(ax, float) * np.radians(deg))[0]

    tmp = tempfile.mkdtemp(); folder = os.path.join(tmp, "session"); os.makedirs(folder)
    k = 0
    face = np.stack([[1.0, 0, 0], [0, 1.0, 0], [0, 0, -1.0]], 1)
    tries, poses = 0, []
    while k < (22 if video else 30) and tries < 300:
        tries += 1
        c = target + np.array([rng.uniform(-500, 500), rng.uniform(-350, 350), rng.uniform(-900, 900)])
        Rb = rot([0, 1, 0], rng.uniform(-40, 40)) @ rot([1, 0, 0], rng.uniform(-35, 35)) @ face
        tb = c - Rb[:, 0] * sq * (CHECKERBOARD[0] - 1) / 2 - Rb[:, 1] * sq * (CHECKERBOARD[1] - 1) / 2
        imL, imR = render(Rb, tb, 0), render(Rb, tb, 1)
        if find_corners(imL, fast_scale=0.25)[0] and find_corners(imR, fast_scale=0.25)[0]:
            k += 1
            poses.append((Rb, tb))
            cv2.imwrite(os.path.join(folder, f"pair_{k:02d}_L.png"), imL)
            cv2.imwrite(os.path.join(folder, f"pair_{k:02d}_R.png"), imR)
    Rf = np.stack([[1.0, 0, 0], [0, 0, 1.0], [0, -1.0, 0]], 1)
    tb = np.array([0.0, 0, 2200]) - Rf[:, 0] * sq * 4 - Rf[:, 1] * sq * 2.5
    cv2.imwrite(os.path.join(folder, "floor_L.png"), render(Rf, tb, 0))
    cv2.imwrite(os.path.join(folder, "floor_R.png"), render(Rf, tb, 1))
    print(f"selftest: {k} synthetic pairs rendered")
    if video:
        def interp(p0, p1, t):
            rv0, rv1 = cv2.Rodrigues(p0[0])[0], cv2.Rodrigues(p1[0])[0]
            return cv2.Rodrigues(rv0 + (rv1 - rv0) * t)[0], p0[1] + (p1[1] - p0[1]) * t
        vid = os.path.join(tmp, "board.mp4")
        vw = cv2.VideoWriter(vid, cv2.VideoWriter_fourcc(*"mp4v"), 30, (2 * W, H))
        if not vw.isOpened():
            print("WARNING: cannot write a 5120-wide video here; using separate L/R videos")
        for i, p in enumerate(poses):
            for _ in range(6):
                vw.write(cv2.cvtColor(np.hstack([render(*p, 0), render(*p, 1)]), cv2.COLOR_GRAY2BGR))
            if i + 1 < len(poses):
                for t in np.linspace(0, 1, 7)[1:-1]:
                    a_, b_ = interp(p, poses[i + 1], t), interp(p, poses[i + 1], max(0.0, t - 0.1))
                    vw.write(cv2.cvtColor(np.hstack([render(*a_, 0), render(*b_, 1)]), cv2.COLOR_GRAY2BGR))
        vw.release()
        fvid = os.path.join(tmp, "floor.mp4")
        vw = cv2.VideoWriter(fvid, cv2.VideoWriter_fourcc(*"mp4v"), 30, (2 * W, H))
        for _ in range(12):
            vw.write(cv2.cvtColor(np.hstack([render(Rf, tb, 0), render(Rf, tb, 1)]), cv2.COLOR_GRAY2BGR))
        vw.release()
        print(f"selftest: synthetic recording written ({os.path.getsize(vid) / 1e6:.1f} MB)")
        cwd = os.getcwd(); os.chdir(tmp)
        try:
            cal, rep = from_video(vid, floor_video=fvid, out=os.path.join(tmp, "calibration.npz"))
        finally:
            os.chdir(cwd)
    else:
        cal, rep = from_folder(folder, out=os.path.join(tmp, "calibration.npz"))
    base = float(np.linalg.norm(cal["T"])); bt = float(np.linalg.norm(T_true))
    fx_err = abs(cal["K1"][0, 0] / Ktrue[0][0, 0] - 1) * 100
    rot_err = np.degrees(np.arccos(np.clip((np.trace(cal["R"] @ R_true.T) - 1) / 2, -1, 1)))
    ok = (abs(base / bt - 1) < 0.005 and fx_err < 1.0 and rot_err < (0.3 if video else 0.2)
          and abs(float(cal["check_scale_depth"]) - 1) < 0.01 and "floor_square_depth_mm" in cal
          and abs(float(cal["floor_square_depth_mm"]) - sq) < 0.8)
    print(f"\nSELFTEST {'PASSED' if ok else 'FAILED'}: baseline {base:.1f} (true {bt:.1f}), fx error {fx_err:.2f}%, "
          f"rotation error {rot_err:.3f} deg, depth self-check {100 * (float(cal['check_scale_depth']) - 1):+.2f}%, "
          f"floor square {float(cal.get('floor_square_depth_mm', np.nan)):.2f} mm")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-folder", nargs="+",
                    help="re-run from saved calib_sessions folder(s), no cameras; several folders are combined")
    ap.add_argument("--from-video", help="side-by-side system recording of the board moved around (no cameras)")
    ap.add_argument("--left", help="instead of --from-video: separate left-camera video")
    ap.add_argument("--right", help="instead of --from-video: separate right-camera video")
    ap.add_argument("--floor-video", help="side-by-side recording of the board lying still on the floor")
    ap.add_argument("--max-pairs", type=int, default=40)
    ap.add_argument("--selftest-video", action="store_true", help="test the video route on a synthetic recording")
    ap.add_argument("--resume", help="live capture: continue a calib_sessions folder (adds to its photos)")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest() else 1)
    if a.selftest_video:
        sys.exit(0 if selftest(video=True) else 1)
    if a.from_video or (a.left and a.right):
        from_video(a.from_video, a.left, a.right, a.floor_video, a.out, a.max_pairs)
    elif a.from_folder:
        from_folder(a.from_folder, a.out)
    else:
        live(a.resume)


if __name__ == "__main__":
    main()