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
import time
import numpy as np
import cv2

import video_io
import copy

from pose_estimator import _run_inference, heal_and_render, calculate_frame_angles, _render_overlay
import stereo_bones
from triangulate import load_calibration, angle_3d, DEFAULT_CONF_THRESHOLD
from stereo_refine import fix_swaps, triangulate_checked, reprojection_summary, spike_mask, NUM_KEYPOINTS, SPIKE_MM, JOINT_NAMES

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


def _split_ffmpeg(input_path, target_w):
    """Split in ONE ffmpeg pass: decode once, crop both halves, scale, encode both (NVENC when
    available). Avoids piping every full 5120x1440 frame through Python (~37 s -> a few s)."""
    import subprocess
    exe = video_io.ffmpeg_exe()
    if not exe:
        return None
    cap = cv2.VideoCapture(input_path)
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    if W <= 0 or H <= 0:
        return None
    half = W // 2
    lw, lh = _out_size(half, H, target_w)
    rw, rh = _out_size(W - half, H, target_w)
    lw, lh, rw, rh = (v - v % 2 for v in (lw, lh, rw, rh))          # yuv420p needs even sizes
    lp = tempfile.mktemp(suffix="_L.mp4")
    rp = tempfile.mktemp(suffix="_R.mp4")
    enc = video_io.pick_encoder(max(lw, rw), max(lh, rh))
    if enc is None:
        return None
    enc_args = ["-c:v", enc, *video_io._ENCODERS[enc], "-pix_fmt", "yuv420p"]
    graph = (f"[0:v]split=2[a][b];"
             f"[a]crop={half}:{H}:0:0,scale={lw}:{lh}[l];"
             f"[b]crop={W - half}:{H}:{half}:0,scale={rw}:{rh}[r]")
    cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-i", input_path,
           "-filter_complex", graph,
           "-map", "[l]", *enc_args, "-r", f"{fps}", lp,
           "-map", "[r]", *enc_args, "-r", f"{fps}", rp]
    res = subprocess.run(cmd, capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if res.returncode != 0 or not os.path.exists(lp) or not os.path.exists(rp):
        print(f"split: ffmpeg failed ({res.stderr.decode(errors='ignore')[-300:]}); using the slower Python split")
        for q in (lp, rp):
            if os.path.exists(q):
                os.unlink(q)
        return None
    return lp, rp, fps


def _split_to_temp(input_path, target_w):
    """Split a side-by-side video into two temp half-videos (downscaled)."""
    fast = _split_ffmpeg(input_path, target_w)
    if fast is not None:
        return fast
    cap = video_io.VideoReader(input_path)
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
    wL = video_io.open_writer(lp, lw, lh, fps)     # NVENC when available
    wR = video_io.open_writer(rp, rw, rh, fps)

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
                         target_w=1280, output_path_right=None):
    """
    input_path        : the side-by-side recording
    output_path       : where to write the 2D overlay of the LEFT view
    output_path_right : optional, where to write the 2D overlay of the RIGHT
                        view. When given it is kept (not deleted) so the caller
                        can store it and let the user switch between views.
    calib_path        : calibration.npz from stereo_calibrate.py
    """
    t_start = time.perf_counter()
    if not os.path.exists(calib_path):
        raise RuntimeError(
            f"calibration.npz not found at {calib_path}. Run stereo_calibrate.py first.")
    calib = load_calibration(calib_path)

    lp, rp, fps = _split_to_temp(input_path, target_w)
    t_split = time.perf_counter() - t_start
    keep_right = output_path_right is not None
    roTmp = output_path_right or tempfile.mktemp(suffix="_Ro.mp4")
    try:
        # 1. Raw 2D detections in each view (no healing yet).
        rawL = _run_inference(lp)
        rawR = _run_inference(rp)
        origL = [copy.deepcopy(f.get("keypoints")) for f in rawL["frames"]]
        t_pose_done = time.perf_counter()

        # 2. Cross-check the views: put left/right labels back where one camera mixed them up.
        #    Done on the RAW keypoints so healing/smoothing below runs on consistent tracks.
        swap_report = fix_swaps(rawL["frames"], rawR["frames"], calib)
        for res in (rawL, rawR):
            for f in res["frames"]:
                if f.get("keypoints"):
                    f["angles"] = calculate_frame_angles(f["keypoints"])
        t_swaps = time.perf_counter()

        # 3. Heal each view (fills short occlusions). Overlays are drawn after step 6.
        resL = heal_and_render(rawL, lp, output_path, raw_keypoints=origL, render=False)
        resR = heal_and_render(rawR, rp, roTmp, render=False)
        t_heal_done = time.perf_counter()

        framesL = resL.get("frames", [])
        framesR = resR.get("frames", [])
        n = min(len(framesL), len(framesR))

        # 4. Triangulate with a reprojection check: points the two cameras disagree on are dropped.
        P = np.full((n, NUM_KEYPOINTS, 3), np.nan)
        errs, rejected_by_frame = [], []
        rejected_counts = np.zeros(NUM_KEYPOINTS, dtype=int)
        for i in range(n):
            pts3d, err, rejected = triangulate_checked(framesL[i].get("keypoints"), framesR[i].get("keypoints"),
                                                       calib, DEFAULT_CONF_THRESHOLD)
            P[i] = pts3d
            errs.append(err)
            rejected_by_frame.append(list(rejected))
            rejected_counts[rejected] += 1

        # 5. Drop one-frame 3D spikes (depth errors along the epipolar line that reprojection can't see).
        spikes = spike_mask(P)
        P[spikes] = np.nan
        spike_counts = spikes.sum(axis=0)
        P_unrefined = P.copy()
        t_tri_done = time.perf_counter()

        # 6. Bone lengths + the other camera: recover joints only one camera sees, refine every
        #    frame with soft constant bone lengths, and write the result back into each camera's 2D.
        bone_report, recovered = stereo_bones.run(P, framesL, framesR, calib, errs)
        for frames_v in (framesL, framesR):
            for f in frames_v:
                if f.get("stereo_filled") and f.get("keypoints"):
                    f["angles"] = calculate_frame_angles(f["keypoints"])
        t_bones_done = time.perf_counter()

        # 7. Overlay videos (now showing the filled-in joints too).
        _render_overlay(lp, framesL, output_path, fps=rawL["fps"], stabilize_confidence=True)
        _render_overlay(rp, framesR, roTmp, fps=rawR["fps"], stabilize_confidence=True)
        t_overlay_done = time.perf_counter()

        frames_3d = []
        for i in range(n):
            pts3d = P[i]
            angles = {}
            for name, (a, b, c) in ANGLE_TRIPLETS.items():
                ang = angle_3d(pts3d[a], pts3d[b], pts3d[c])
                if ang is not None:
                    angles[name] = round(ang, 2)
            kp_list = [None if np.any(np.isnan(p)) else [round(float(p[0]), 1), round(float(p[1]), 1),
                                                        round(float(p[2]), 1)] for p in pts3d]
            f3 = {"frame_index": i, "keypoints_3d": kp_list, "angles_3d": angles,
                  "reproj_px": [None if not np.isfinite(e) else round(float(e), 1) for e in errs[i]]}
            if rejected_by_frame[i]:
                f3["rejected"] = rejected_by_frame[i]
            sp = [int(j) for j in np.flatnonzero(spikes[i])]
            if sp:
                f3["spikes"] = sp
            if i in recovered:
                f3["recovered"] = sorted(recovered[i])
            if bone_report.get("enabled"):          # keep the pre-step-2 3D for comparison
                f3["keypoints_3d_unrefined"] = [None if np.any(np.isnan(p)) else [round(float(v), 1) for v in p]
                                                for p in P_unrefined[i]]
            sw = swap_report["per_frame"][i] if i < len(swap_report["per_frame"]) else None
            if sw and (sw["left"] or sw["right"]):
                f3["swapped"] = sw
            frames_3d.append(f3)

        t_triang = time.perf_counter()
    finally:
        cleanup = [lp, rp] if keep_right else [lp, rp, roTmp]
        for p in cleanup:
            if os.path.exists(p):
                os.unlink(p)

    return {
        "fps": resL.get("fps", fps),
        "total_frames": n,
        "mode": "stereo_3d",
        "units": "mm",
        "frames": framesL[:n],          # 2D LEFT view -> keeps the existing chart working
        "frames_3d": frames_3d,         # triangulated 3D + true 3D angles
        "stereo_report": {               # how much the two cameras agreed (see stereo_refine.py)
            "swaps": {k: v for k, v in swap_report.items() if k != "per_frame"},
            "reprojection": reprojection_summary(errs, rejected_counts, n),
            "bones": bone_report,
            "spikes": {"spike_mm": SPIKE_MM, "total": int(spike_counts.sum()),
                       "per_joint": {JOINT_NAMES[j]: int(c) for j, c in enumerate(spike_counts) if c}},
        },
        "healing_report": resL.get("healing_report"),
        "timing": {
            "split_seconds": round(t_split, 2),
            "left_view": resL.get("timing"),
            "right_view": resR.get("timing"),
            "pose_seconds": round(t_pose_done - t_start - t_split, 2),
            "swap_check_seconds": round(t_swaps - t_pose_done, 2),
            "healing_seconds": round(t_heal_done - t_swaps, 2),
            "triangulation_seconds": round(t_tri_done - t_heal_done, 2),
            "bone_refinement_seconds": round(t_bones_done - t_tri_done, 2),
            "overlay_seconds": round(t_overlay_done - t_bones_done, 2),
            "total_seconds": round(time.perf_counter() - t_start, 2),
        },
        "calibration_rms": float(np.asarray(calib.get("rms", 0)).item())
            if "rms" in calib else None,
    }
