"""
Triangulation of paired 2D keypoints (left and right view) into 3D.

Uses calibration.npz from stereo_calibrate.py. Output is in the left camera's
coordinate frame, in millimetres (the unit of the calibration square size).
"""

import numpy as np
import cv2

NUM_KEYPOINTS = 18


def load_calibration(path="calibration.npz"):
    data = np.load(path)
    return {k: data[k] for k in data.files}


def projection_matrices(calib):
    """Projection matrices in normalised coordinates: P1 = [I|0], P2 = [R|T]."""
    P1 = np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = np.hstack([calib["R"], calib["T"].reshape(3, 1)])
    return P1.astype(np.float64), P2.astype(np.float64)


def triangulate_pair(ptsL, ptsR, calib):
    """ptsL, ptsR: (N, 2) pixel coordinates in the same order. Returns (N, 3) points in mm."""
    ptsL = np.asarray(ptsL, dtype=np.float64).reshape(-1, 1, 2)
    ptsR = np.asarray(ptsR, dtype=np.float64).reshape(-1, 1, 2)

    undL = cv2.undistortPoints(ptsL, calib["K1"], calib["D1"]).reshape(-1, 2).T
    undR = cv2.undistortPoints(ptsR, calib["K2"], calib["D2"]).reshape(-1, 2).T

    P1, P2 = projection_matrices(calib)
    X4 = cv2.triangulatePoints(P1, P2, undL, undR)
    X3 = (X4[:3] / X4[3]).T
    return X3


def triangulate_keypoints(kp_left, kp_right, calib, conf_threshold=0.2):
    """
    kp_left, kp_right: 18 keypoints per view as [x, y, conf], with x and y normalised to 0-1.
    Returns an (18, 3) array in mm; rows are NaN where a joint is missing or below
    conf_threshold in either view.
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
        # R_level (from the floor step of the calibration) rotates the 3D so the floor is
        # horizontal. Lengths and joint angles are unchanged by the rotation.
        R_level = calib.get("R_level") if isinstance(calib, dict) else None
        if R_level is not None:
            X3 = (np.asarray(R_level, dtype=np.float64) @ X3.T).T
        for k, j in enumerate(idxs):
            out[j] = X3[k]
    return out


def angle_3d(a, b, c):
    """Joint angle at b in degrees, or None if a point is missing."""
    if np.any(np.isnan([a, b, c])):
        return None
    v1, v2 = a - b, c - b
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return None
    cosang = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosang)))


def rotation_between(a, b):
    """Smallest rotation that turns unit vector a onto unit vector b."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    a = a / (np.linalg.norm(a) + 1e-12)
    b = b / (np.linalg.norm(b) + 1e-12)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    s = float(np.linalg.norm(v))
    if s < 1e-8:
        if c > 0:
            return np.eye(3)
        # opposite vectors: 180-degree rotation about any perpendicular axis
        perp = np.array([1.0, 0.0, 0.0]) if abs(a[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        axis = np.cross(a, perp)
        axis = axis / np.linalg.norm(axis)
        K = np.array([[0, -axis[2], axis[1]],
                      [axis[2], 0, -axis[0]],
                      [-axis[1], axis[0], 0]])
        return np.eye(3) + 2.0 * (K @ K)
    vx = np.array([[0, -v[2], v[1]],
                   [v[2], 0, -v[0]],
                   [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * ((1.0 - c) / (s * s))


def compute_floor_alignment(pts3d, up_target=(0.0, -1.0, 0.0)):
    """
    pts3d: (N, 3) 3D points of a checkerboard lying flat on the floor (left camera frame, mm).
    Returns R_level so that R_level @ X has a horizontal floor with "up" along up_target.
    """
    pts = np.asarray(pts3d, dtype=np.float64)
    pts = pts[~np.isnan(pts).any(axis=1)]
    if len(pts) < 3:
        raise ValueError("Need >= 3 valid floor points to fit a plane.")
    c = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - c)
    normal = vt[2]
    # point the normal towards the cameras (above the floor), so the skeleton is not upside down
    if np.dot(normal, -c) < 0:
        normal = -normal
    return rotation_between(normal, np.asarray(up_target, dtype=np.float64))
