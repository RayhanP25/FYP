"""
pose_postprocess.py
-------------------
Temporal post-processing for the SportPose 18-point pipeline.

Pipeline (per keypoint, independently for x and y):
    1. Confidence gating          -> low-presence joints treated as missing
    2. Gap-limited interpolation  -> short occlusions filled; long gaps left missing
    3. Discontinuity-aware zero-phase smoothing -> Savitzky-Golay (no lag,
       preserves fast peaks) that BREAKS at large frame-to-frame jumps so it
       never averages across a left/right limb swap.

Offline batch processing => non-causal smoother => NO skeleton lag.
"""

import numpy as np

NUM_KEYPOINTS = 18


def _savgol_coeffs(window, poly):
    half = window // 2
    x = np.arange(-half, half + 1)
    A = np.vander(x, poly + 1, increasing=True)
    return np.linalg.pinv(A)[0]


def _smooth_segment(seg, window, poly):
    L = len(seg)
    if L < window:
        return seg                      # too short (e.g. at a swap) -> keep raw
    half = window // 2
    coeffs = _savgol_coeffs(window, poly)
    left = seg[half:0:-1]
    right = seg[-2:-half - 2:-1]
    padded = np.concatenate([left, seg, right])
    return np.convolve(padded, coeffs, mode="valid")[:L]


def _smooth(series, window=7, poly=2, cuts=None):
    """Smooth a 1-D series. Segments are split at NaNs AND at `cuts` indices
    (cuts[i] == True means 'do not smooth across the i-1 -> i boundary')."""
    if window % 2 == 0:
        window += 1
    out = series.copy()
    n = len(series)
    if cuts is None:
        cuts = np.zeros(n, dtype=bool)
    t = 0
    while t < n:
        if np.isnan(series[t]):
            t += 1
            continue
        start = t
        t += 1
        while t < n and not np.isnan(series[t]) and not cuts[t]:
            t += 1
        out[start:t] = _smooth_segment(series[start:t], window, poly)
    return out


def _frames_to_arrays(frames):
    T = len(frames)
    xs = np.full((T, NUM_KEYPOINTS), np.nan)
    ys = np.full((T, NUM_KEYPOINTS), np.nan)
    pr = np.zeros((T, NUM_KEYPOINTS))
    for t, fr in enumerate(frames):
        kp = fr.get("keypoints")
        if not kp:
            continue
        for j in range(min(NUM_KEYPOINTS, len(kp))):
            p = kp[j]
            if p and len(p) >= 3 and p[0] is not None:
                xs[t, j] = p[0]; ys[t, j] = p[1]; pr[t, j] = p[2]
    return xs, ys, pr


def _interp_gaps(series, max_gap):
    s = series.copy()
    healed = np.zeros_like(s, dtype=bool)
    valid = ~np.isnan(s)
    if valid.sum() < 2:
        return s, healed
    t = 0
    while t < len(s):
        if np.isnan(s[t]):
            start = t
            while t < len(s) and np.isnan(s[t]):
                t += 1
            end = t
            gap_len = end - start
            has_left = start - 1 >= 0 and valid[start - 1]
            has_right = end < len(s) and valid[end]
            if has_left and has_right and gap_len <= max_gap:
                li, ri = start - 1, end
                s[start:end] = np.interp(np.arange(start, end), [li, ri], [s[li], s[ri]])
                healed[start:end] = True
        else:
            t += 1
    return s, healed


def _count_long_gaps(series, max_gap):
    n = t = 0
    while t < len(series):
        if np.isnan(series[t]):
            start = t
            while t < len(series) and np.isnan(series[t]):
                t += 1
            if (t - start) > max_gap:
                n += 1
        else:
            t += 1
    return n


def _detect_cuts(fx, fy, jump_threshold):
    """Boolean array: True at index i if the joint moved more than
    jump_threshold between frame i-1 and i (a likely L/R swap / teleport)."""
    T = len(fx)
    cuts = np.zeros(T, dtype=bool)
    disp = np.sqrt(np.diff(fx) ** 2 + np.diff(fy) ** 2)   # length T-1
    big = disp > jump_threshold
    cuts[1:][np.nan_to_num(big)] = True
    return cuts


def heal_and_smooth(result, conf_threshold=0.5, max_gap=15, window_length=7,
                    polyorder=2, jump_threshold=0.08, healed_confidence=0.5,
                    recompute_angles=True, **_legacy):
    """
    jump_threshold : normalised-coordinate distance above which a frame-to-frame
                     move is treated as a limb swap and smoothing is broken
                     (lower = more breaks; 0.08 ~ a joint crossing the body).
    """
    frames = result["frames"]
    xs, ys, pr = _frames_to_arrays(frames)
    gate = pr < conf_threshold
    xs[gate] = np.nan; ys[gate] = np.nan

    healed_count = long_gap_count = swap_breaks = 0
    out_xs = xs.copy(); out_ys = ys.copy()
    healed_mask = np.zeros_like(xs, dtype=bool)

    for j in range(NUM_KEYPOINTS):
        long_gap_count += _count_long_gaps(xs[:, j], max_gap)
        fx, hx = _interp_gaps(xs[:, j], max_gap)
        fy, hy = _interp_gaps(ys[:, j], max_gap)
        h = hx | hy
        healed_mask[:, j] = h
        healed_count += int(h.sum())
        cuts = _detect_cuts(fx, fy, jump_threshold)
        swap_breaks += int(cuts.sum())
        out_xs[:, j] = _smooth(fx, window_length, polyorder, cuts)
        out_ys[:, j] = _smooth(fy, window_length, polyorder, cuts)

    new_frames = []
    for t, fr in enumerate(frames):
        kp_out = None
        if not np.all(np.isnan(out_xs[t])):
            kp_out = []
            for j in range(NUM_KEYPOINTS):
                if np.isnan(out_xs[t, j]):
                    kp_out.append([0.0, 0.0, 0.0])
                else:
                    conf = pr[t, j]
                    if healed_mask[t, j]:
                        conf = max(conf, healed_confidence)
                    kp_out.append([float(out_xs[t, j]), float(out_ys[t, j]), float(conf)])
        nf = {"frame_index": fr.get("frame_index", t), "keypoints": kp_out,
              "healed_joints": [int(j) for j in range(NUM_KEYPOINTS) if healed_mask[t, j]] if kp_out else []}
        if recompute_angles and kp_out is not None:
            try:
                from pose_estimator import calculate_frame_angles
                nf["angles"] = calculate_frame_angles(kp_out)
            except Exception:
                nf["angles"] = fr.get("angles", {})
        else:
            nf["angles"] = fr.get("angles", {})
        new_frames.append(nf)

    total = NUM_KEYPOINTS * max(1, len(frames))
    report = {"total_frames": len(frames), "joints_healed": healed_count,
              "healed_ratio": round(healed_count / total, 4),
              "long_gaps_left_missing": long_gap_count,
              "swap_breaks_protected": swap_breaks,
              "smoother": "savitzky_golay_zero_phase_swap_aware",
              "params": {"conf_threshold": conf_threshold, "max_gap": max_gap,
                         "window_length": window_length if window_length % 2 else window_length + 1,
                         "polyorder": polyorder, "jump_threshold": jump_threshold}}
    nr = dict(result); nr["frames"] = new_frames; nr["healing_report"] = report
    return nr
