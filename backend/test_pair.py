"""
test_pair.py -- find a backend/resolution that opens BOTH cameras together.

Run with backend stopped and the built-in camera disabled:
    python test_pair.py

It tries DSHOW and MSMF, each at 1280x720 and 640x480, opening index 0 and 1
at the same time and reporting whether both deliver frames and at what size.
Use whichever combo opens both AND returns the requested (lower) resolution.
"""
import cv2
import time

PAIRS = [
    ("DSHOW", cv2.CAP_DSHOW, 1280, 720),
    ("DSHOW", cv2.CAP_DSHOW, 640, 480),
    ("MSMF",  cv2.CAP_MSMF,  1280, 720),
    ("MSMF",  cv2.CAP_MSMF,  640, 480),
]
LEFT, RIGHT = 0, 1


def open_cam(idx, backend, w, h):
    cap = cv2.VideoCapture(idx, backend)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
    return cap


for name, backend, w, h in PAIRS:
    print(f"\n=== {name}  request {w}x{h} ===")
    capL = open_cam(LEFT, backend, w, h)
    capR = open_cam(RIGHT, backend, w, h)
    print(f"  opened:  L={capL.isOpened()}  R={capR.isOpened()}")
    if capL.isOpened() and capR.isOpened():
        # warm up then read a few frames from each
        for _ in range(5):
            capL.read(); capR.read()
        okL, fL = capL.read()
        okR, fR = capR.read()
        sL = f"{fL.shape[1]}x{fL.shape[0]}" if okL else "no frame"
        sR = f"{fR.shape[1]}x{fR.shape[0]}" if okR else "no frame"
        print(f"  frames:  L={sL}  R={sR}")
        if okL and okR:
            cv2.imwrite(f"test_{name}_{w}x{h}_L.jpg", fL)
            cv2.imwrite(f"test_{name}_{w}x{h}_R.jpg", fR)
            print(f"  saved test_{name}_{w}x{h}_L.jpg / _R.jpg  -> open them, "
                  f"check BOTH are clean (not noisy)")
    capL.release()
    capR.release()
    time.sleep(1.0)

print("\nDone. Pick the first combo where both opened, both returned frames, "
      "and the saved images are clean.")
