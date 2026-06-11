"""
triangulate.py -- convert paired 2D keypoints (left + right view) into 3D.

Depends on a calibration produced by stereo_calibrate.py, which stores:
    K1, D1  : left camera intrinsics + distortion
    K2, D2  : right camera intrinsics + distortion
    R,  T   : rotation + translation of the RIGHT camera relative to the LEFT
              (T is in the units of the checkerboard square size you measured,
               so 3D output is in those units -- use millimetres)

Method (the standard, robust one):
    1. Undistort both points to NORMALISED camera coordinates (removes lens
       distortion and the intrinsics).
    2. Triangulate with P1 = [I|0], P2 = [R|T].
    3. Output 3D is in the LEFT camera's coordinate frame, in mm.
"""

import numpy as np
import cv2

NUM_KEYPOINTS = 18


def load_calibration(path="calibration.npz"):
    data = np.load(path)
    return {k: data[k] for k in data.files}


def projection_matrices(calib):
    """P1, P2 in NORMALISED coordinates (intrinsics already removed by
    undistortPoints), so P1 = [I|0], P2 = [R|T]."""
    P1 = np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = np.hstack([calib["R"], calib["T"].reshape(3, 1)])
    return P1.astype(np.float64), P2.astype(np.float64)


def triangulate_pair(ptsL, ptsR, calib):
    """
    ptsL, ptsR: (N,2) pixel coordinates in each view (same ordering).
    Returns (N,3) 3D points in the LEFT camera frame (mm), or NaN rows where
    a point was missing.
    """
    ptsL = np.asarray(ptsL, dtype=np.float64).reshape(-1, 1, 2)
    ptsR = np.asarray(ptsR, dtype=np.float64).reshape(-1, 1, 2)

    undL = cv2.undistortPoints(ptsL, calib["K1"], calib["D1"]).reshape(-1, 2).T
    undR = cv2.undistortPoints(ptsR, calib["K2"], calib["D2"]).reshape(-1, 2).T

    P1, P2 = projection_matrices(calib)
    X4 = cv2.triangulatePoints(P1, P2, undL, undR)   # 4 x N homogeneous
    X3 = (X4[:3] / X4[3]).T                           # N x 3
    return X3


def triangulate_keypoints(kp_left, kp_right, calib, conf_threshold=0.5):
    """
    kp_left / kp_right: 18-point lists of [x_norm, y_norm, conf] from each view
    (MediaPipe normalised 0-1 coords), plus the pixel size of each view.
    Returns (18,3) array in mm; rows are NaN where either view lacked the joint.

    NOTE: the keypoints are stored NORMALISED (0-1). We convert to pixels using
    each view's width/height before triangulating.
    """
    wL, hL = calib["size1"]
    wR, hR = calib["size2"]
    out = np.full((NUM_KEYPOINTS, 3), np.nan)

    ptsL, ptsR, idxs = [], [], []
    for j in range(NUM_KEYPOINTS):
        a = kp_left[j] if kp_left and j < len(kp_left) else None
        b = kp_right[j] if kp_right and j < len(kp_right) else None
        if (a and b and len(a) >= 3 and len(b) >= 3
                and a[2] > conf_threshold and b[2] > conf_threshold):
            ptsL.append([a[0] * wL, a[1] * hL])
            ptsR.append([b[0] * wR, b[1] * hR])
            idxs.append(j)

    if idxs:
        X3 = triangulate_pair(ptsL, ptsR, calib)
        for k, j in enumerate(idxs):
            out[j] = X3[k]
    return out


def angle_3d(a, b, c):
    """3D joint angle at b (degrees), or None if any point missing."""
    if np.any(np.isnan([a, b, c])):
        return None
    v1, v2 = a - b, c - b
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return None
    cosang = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosang)))
