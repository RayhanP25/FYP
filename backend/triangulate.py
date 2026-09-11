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
        # Optional floor levelling: if calibration.npz carries an R_level rotation
        # (set with 'f' in stereo_calibrate.py), rotate the 3D so the floor is
        # horizontal and "up" is up. Joint ANGLES are rotation-invariant, so this
        # only changes how the skeleton is oriented for display -- never the numbers.
        R_level = calib.get("R_level") if isinstance(calib, dict) else None
        if R_level is not None:
            X3 = (np.asarray(R_level, dtype=np.float64) @ X3.T).T
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


# --------------------------------------------------------------------------- #
#  Floor levelling helpers
#  Used by stereo_calibrate.py ('f' key) to turn a checkerboard lying flat on
#  the floor into a rotation that makes the reconstructed skeleton stand upright
#  regardless of how the cameras are tilted.
# --------------------------------------------------------------------------- #
def rotation_between(a, b):
    """Smallest rotation matrix that rotates unit vector a onto unit vector b."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    a = a / (np.linalg.norm(a) + 1e-12)
    b = b / (np.linalg.norm(b) + 1e-12)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    s = float(np.linalg.norm(v))
    if s < 1e-8:                         # already (anti)parallel
        if c > 0:
            return np.eye(3)
        perp = np.array([1.0, 0.0, 0.0]) if abs(a[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        axis = np.cross(a, perp)
        axis = axis / np.linalg.norm(axis)
        K = np.array([[0, -axis[2], axis[1]],
                      [axis[2], 0, -axis[0]],
                      [-axis[1], axis[0], 0]])
        return np.eye(3) + 2.0 * (K @ K)   # 180-degree rotation about axis
    vx = np.array([[0, -v[2], v[1]],
                   [v[2], 0, -v[0]],
                   [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * ((1.0 - c) / (s * s))


def compute_floor_alignment(pts3d, up_target=(0.0, -1.0, 0.0)):
    """
    pts3d : (N,3) triangulated 3D points of a checkerboard lying flat on the
            floor (LEFT-camera frame, mm). NaN rows are ignored.
    Returns a 3x3 rotation R_level so that (R_level @ X) makes the floor plane
    horizontal with "up" pointing along up_target. Default up_target = -Y, which
    is screen-up in the Skeleton3DViewer convention.
    """
    pts = np.asarray(pts3d, dtype=np.float64)
    pts = pts[~np.isnan(pts).any(axis=1)]
    if len(pts) < 3:
        raise ValueError("Need >= 3 valid floor points to fit a plane.")
    c = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - c)
    normal = vt[2]                       # plane normal = smallest-variance axis
    # Orient the normal to point UP out of the floor (toward the cameras, which
    # sit at/above the origin), so the skeleton ends up head-up not upside-down.
    if np.dot(normal, -c) < 0:
        normal = -normal
    return rotation_between(normal, np.asarray(up_target, dtype=np.float64))
