"""
stereo_process.py -- turn a side-by-side stereo recording into 3D keypoints.

Flow:
  1. Split each composite frame into left/right halves (equal width; both
     cameras are 16:9 so the split is at width//2). Downscale each half for
     speed -- normalised keypoints are unaffected, so triangulation stays exact.
  2. Run the EXISTING pose estimator on each half (same 18-point output).
  3. Triangulate the paired 2D keypoints into 3D millimetres using calibration.npz.
  4. Compute true 3D joint angles.

Returns a result dict shaped like the normal analysis (so the 2D chart keeps
working on the left view) plus a "frames_3d" list for the 3D viewer.
"""

import os
import tempfile
import numpy as np
import cv2

from pose_estimator import process_video_with_overlays
from triangulate import load_calibration, triangulate_keypoints, angle_3d

# 18-point skeleton: 0 nose,1 neck,2 Lsho,3 Rsho,4 Lelb,5 Relb,6 Lwri,7 Rwri,
# 8 Lidx,9 Ridx,10 Lhip,11 Rhip,12 Lknee,13 Rknee,14 Lank,15 Rank,16 Ltoe,17 Rtoe
ANGLE_TRIPLETS = {
    "left_elbow":    (2, 4, 6),
    "right_elbow":   (3, 5, 7),
    "left_shoulder": (4, 2, 10),
    "right_shoulder": (5, 3, 11),
    "left_hip":      (2, 10, 12),
    "right_hip":     (3, 11, 13),
    "left_knee":     (10, 12, 14),
    "right_knee":    (11, 13, 15),
    "left_ankle":    (12, 14, 16),
    "right_ankle":   (13, 15, 17),
}


def _out_size(fw, fh, target_w):
    if fw <= target_w:
        return fw, fh
    s = target_w / float(fw)
    return target_w, int(round(fh * s))


def _split_to_temp(input_path, target_w):
    """Split a side-by-side video into two temp half-videos (downscaled)."""
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    ok, frame = cap.read()
    if not ok:
        cap.release()
        raise RuntimeError("Could not read the stereo video.")
    H, W = frame.shape[:2]
    half = W // 2
    lw, lh = _out_size(half, H, target_w)
    rw, rh = _out_size(W - half, H, target_w)

    lp = tempfile.mktemp(suffix="_L.mp4")
    rp = tempfile.mktemp(suffix="_R.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    wL = cv2.VideoWriter(lp, fourcc, fps, (lw, lh))
    wR = cv2.VideoWriter(rp, fourcc, fps, (rw, rh))

    while ok:
        L = frame[:, :half]
        R = frame[:, half:]
        if (lw, lh) != (half, H):
            L = cv2.resize(L, (lw, lh))
        if (rw, rh) != (W - half, H):
            R = cv2.resize(R, (rw, rh))
        wL.write(L)
        wR.write(R)
        ok, frame = cap.read()

    cap.release()
    wL.release()
    wR.release()
    return lp, rp, fps


def process_stereo_video(input_path, output_path, calib_path="calibration.npz",
                         target_w=1280):
    """
    input_path  : the side-by-side recording
    output_path : where to write the 2D overlay of the LEFT view (so the normal
                  video player still has something to show)
    calib_path  : calibration.npz from stereo_calibrate.py
    """
    if not os.path.exists(calib_path):
        raise RuntimeError(
            f"calibration.npz not found at {calib_path}. Run stereo_calibrate.py first.")
    calib = load_calibration(calib_path)

    lp, rp, fps = _split_to_temp(input_path, target_w)
    roTmp = tempfile.mktemp(suffix="_Ro.mp4")
    try:
        # left overlay goes to output_path (the displayed processed video)
        resL = process_video_with_overlays(lp, output_path, apply_healing=False)
        resR = process_video_with_overlays(rp, roTmp, apply_healing=False)

        framesL = resL.get("frames", [])
        framesR = resR.get("frames", [])
        n = min(len(framesL), len(framesR))

        frames_3d = []
        for i in range(n):
            kpL = framesL[i].get("keypoints")
            kpR = framesR[i].get("keypoints")
            pts3d = triangulate_keypoints(kpL, kpR, calib)   # (18,3) mm, NaN = missing

            angles = {}
            for name, (a, b, c) in ANGLE_TRIPLETS.items():
                ang = angle_3d(pts3d[a], pts3d[b], pts3d[c])
                if ang is not None:
                    angles[name] = round(ang, 2)

            kp_list = []
            for p in pts3d:
                if np.any(np.isnan(p)):
                    kp_list.append(None)
                else:
                    kp_list.append([round(float(p[0]), 1),
                                    round(float(p[1]), 1),
                                    round(float(p[2]), 1)])
            frames_3d.append({"frame_index": i,
                              "keypoints_3d": kp_list,
                              "angles_3d": angles})
    finally:
        for p in (lp, rp, roTmp):
            if os.path.exists(p):
                os.unlink(p)

    return {
        "fps": resL.get("fps", fps),
        "total_frames": n,
        "mode": "stereo_3d",
        "units": "mm",
        "frames": framesL[:n],          # 2D LEFT view -> keeps the existing chart working
        "frames_3d": frames_3d,         # triangulated 3D + true 3D angles
        "calibration_rms": float(np.asarray(calib.get("rms", 0)).item())
            if "rms" in calib else None,
    }
