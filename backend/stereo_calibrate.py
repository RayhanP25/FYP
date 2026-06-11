"""
stereo_calibrate.py -- one-time stereo calibration of your two cameras.

RUN WITH THE BACKEND STOPPED (cameras must be free):
    cd backend
    python stereo_calibrate.py

You need a printed CHECKERBOARD. Defaults below assume a 9x6 *inner-corner*
board with 25 mm squares -- MEASURE your real square size and set SQUARE_MM.

Controls (a window opens with both feeds):
    SPACE : capture the current pair (only works when the board is found in BOTH)
    c     : calibrate from the captured pairs and save calibration.npz
    u     : undo the last captured pair
    q     : quit

Capture 15-25 pairs with the board held at many positions, distances, and tilts,
filling different parts of BOTH frames. Then press 'c'.
The script prints the RMS reprojection error -- aim for < 1.0 px.
"""

import os
import time
import numpy as np
import cv2

# ---- board geometry: SET THESE TO YOUR PRINTED BOARD ----
CHECKERBOARD = (9, 6)        # number of INNER corners (cols, rows)
SQUARE_MM = 40.0             # physical size of one square, in millimetres

LEFT_INDEX = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
RIGHT_INDEX = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))
CAP_W = int(os.getenv("CAMERA_WIDTH", "1280"))
CAP_H = int(os.getenv("CAMERA_HEIGHT", "720"))
BACKEND = cv2.CAP_DSHOW if os.name == "nt" else 0

# 3D coordinates of board corners in board space (z=0), scaled to mm
objp = np.zeros((CHECKERBOARD[0] * CHECKERBOARD[1], 3), np.float32)
objp[:, :2] = np.mgrid[0:CHECKERBOARD[0], 0:CHECKERBOARD[1]].T.reshape(-1, 2)
objp *= SQUARE_MM

CRIT = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)


def open_cam(idx, attempts=6, delay=1.0):
    """Open a camera, retrying a few times -- Windows can leave a device 'busy'
    for a moment after another process (e.g. probe_cameras.py) released it."""
    for a in range(attempts):
        cap = cv2.VideoCapture(idx, BACKEND)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAP_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAP_H)
        if cap.isOpened():
            ok, _ = cap.read()
            if ok:
                return cap
        cap.release()
        if a < attempts - 1:
            print(f"  camera {idx} not ready, retrying ({a + 1}/{attempts})...")
            time.sleep(delay)
    return None


def find_corners(gray):
    ok, corners = cv2.findChessboardCorners(
        gray, CHECKERBOARD,
        flags=cv2.CALIB_CB_ADAPTIVE_THRESH + cv2.CALIB_CB_NORMALIZE_IMAGE
              + cv2.CALIB_CB_FAST_CHECK)
    if ok:
        corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), CRIT)
    return ok, corners


def main():
    capL = open_cam(LEFT_INDEX)
    capR = open_cam(RIGHT_INDEX)
    if capL is None or capR is None:
        print("ERROR: could not open both cameras after retries.")
        print("  - close anything else using the cameras (browser stream, OBS, probe)")
        print("  - wait ~5s and run this script on its own (do NOT run probe first)")
        for c in (capL, capR):
            if c is not None:
                c.release()
        return

    objpoints, imgL, imgR = [], [], []
    sizeL = sizeR = None
    print("Show the board to BOTH cameras. SPACE=capture, c=calibrate, u=undo, q=quit")

    while True:
        okL, fL = capL.read()
        okR, fR = capR.read()
        if not (okL and okR):
            continue
        gL = cv2.cvtColor(fL, cv2.COLOR_BGR2GRAY)
        gR = cv2.cvtColor(fR, cv2.COLOR_BGR2GRAY)
        sizeL = (gL.shape[1], gL.shape[0])
        sizeR = (gR.shape[1], gR.shape[0])

        foundL, cL = find_corners(gL)
        foundR, cR = find_corners(gR)

        dL, dR = fL.copy(), fR.copy()
        if foundL:
            cv2.drawChessboardCorners(dL, CHECKERBOARD, cL, foundL)
        if foundR:
            cv2.drawChessboardCorners(dR, CHECKERBOARD, cR, foundR)

        # match heights for side-by-side preview
        if dL.shape[0] != dR.shape[0]:
            s = dL.shape[0] / dR.shape[0]
            dR = cv2.resize(dR, (int(dR.shape[1] * s), dL.shape[0]))
        combo = cv2.hconcat([dL, dR])
        # downscale for smooth display only (detection ran on full-res frames)
        disp = combo
        if combo.shape[1] > 1600:
            s = 1600.0 / combo.shape[1]
            disp = cv2.resize(combo, (1600, int(combo.shape[0] * s)))
        status = f"pairs: {len(objpoints)}   both detected: {foundL and foundR}"
        cv2.putText(disp, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (0, 220, 0) if (foundL and foundR) else (0, 0, 255), 2)
        cv2.imshow("Stereo Calibration (SPACE capture / c calibrate / u undo / q quit)", disp)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('u') and objpoints:
            objpoints.pop(); imgL.pop(); imgR.pop()
            print(f"undo -> {len(objpoints)} pairs")
        elif key == ord(' '):
            # Grab a FRESH, tightly-synced pair: grab() both back-to-back (queues
            # both captures together), then retrieve. Minimises the time gap
            # between the two views so a slightly-moving board doesn't misalign
            # the stereo correspondence.
            capL.grab(); capR.grab()
            okcL, fcL = capL.retrieve()
            okcR, fcR = capR.retrieve()
            if okcL and okcR:
                gcL = cv2.cvtColor(fcL, cv2.COLOR_BGR2GRAY)
                gcR = cv2.cvtColor(fcR, cv2.COLOR_BGR2GRAY)
                okL2, cL2 = find_corners(gcL)
                okR2, cR2 = find_corners(gcR)
                if okL2 and okR2:
                    objpoints.append(objp.copy())
                    imgL.append(cL2); imgR.append(cR2)
                    print(f"captured pair #{len(objpoints)}")
                else:
                    print("  board not found in both on the synced capture -- "
                          "hold steady and try again")
            elif foundL and foundR:
                print("board not found in both views -- not captured")
        elif key == ord('c'):
            if len(objpoints) < 8:
                print(f"need >= ~10 pairs (have {len(objpoints)})")
                continue
            try:
                print("Calibrating...")
                o, l, r = objpoints, imgL, imgR

                def _run(o, l, r):
                    r1, k1, d1, *_ = cv2.calibrateCamera(o, l, sizeL, None, None)
                    r2, k2, d2, *_ = cv2.calibrateCamera(o, r, sizeR, None, None)
                    return r1, k1, d1, r2, k2, d2

                rms1, K1, D1, rms2, K2, D2 = _run(o, l, r)
                print(f"  left  RMS: {rms1:.3f} px    right RMS: {rms2:.3f} px")

                # stereo with per-pair errors so we can drop bad captures.
                # Index the result (return count varies across OpenCV versions:
                # perViewErrors is always the LAST element).
                R0, T0 = np.eye(3), np.zeros((3, 1))
                res = cv2.stereoCalibrateExtended(
                    o, l, r, K1, D1, K2, D2, sizeL, R0, T0,
                    flags=cv2.CALIB_FIX_INTRINSIC, criteria=CRIT)
                rmsS = float(res[0])
                K1, D1, K2, D2 = res[1], res[2], res[3], res[4]
                R, T = res[5], res[6]
                per = np.asarray(res[-1]).reshape(-1, 2).mean(axis=1)
                med = float(np.median(per))
                thresh = max(1.0, med * 1.5)
                good = [i for i in range(len(o)) if per[i] <= thresh]
                print(f"  initial stereo RMS: {rmsS:.3f} px  "
                      f"(per-pair median {med:.2f}, worst {per.max():.2f})")
                if 8 <= len(good) < len(o):
                    print(f"  dropping {len(o) - len(good)} bad pair(s), recalibrating...")
                    o = [o[i] for i in good]; l = [l[i] for i in good]; r = [r[i] for i in good]
                    rms1, K1, D1, rms2, K2, D2 = _run(o, l, r)
                    sc = cv2.stereoCalibrate(
                        o, l, r, K1, D1, K2, D2, sizeL,
                        criteria=CRIT, flags=cv2.CALIB_FIX_INTRINSIC)
                    rmsS = float(sc[0]); R, T = sc[5], sc[6]
                    print(f"  after cleanup -> left {rms1:.3f}  right {rms2:.3f}  "
                          f"kept {len(o)} pairs")

                print(f"  stereo RMS: {rmsS:.3f} px  (aim < 1.0)")
                print(f"  baseline |T|: {np.linalg.norm(T):.1f} mm")
                np.savez("calibration.npz",
                         K1=K1, D1=D1, K2=K2, D2=D2, R=R, T=T,
                         size1=np.array(sizeL), size2=np.array(sizeR),
                         rms=np.array(rmsS), square_mm=np.array(SQUARE_MM))
                print("  saved calibration.npz")
            except Exception as ex:
                print(f"  calibration error: {ex}")
                print("  your captures are kept -- press c to retry, or capture more pairs")

    capL.release(); capR.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
