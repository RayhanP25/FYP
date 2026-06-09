"""
probe_cameras.py  -- run with the backend STOPPED (so cameras are free).

    cd backend
    python probe_cameras.py

It does two things:
  1. Opens indices 0..5 one at a time, saves a snapshot probe_<idx>.jpg, and
     prints whether each delivers frames + the resolution it actually used.
  2. Opens your configured left/right pair AT THE SAME TIME and saves
     pair_left.jpg / pair_right.jpg -- this reveals the USB-bandwidth problem:
     if a camera looks clean alone but is noisy in the pair shot, the bus is
     the bottleneck.

Open the saved .jpg files and pick the two indices that are (a) the cameras you
want and (b) still clean in the PAIR shot.
"""
import os
import cv2

MAX_INDEX = 5
W = int(os.getenv("CAMERA_WIDTH", "640"))
H = int(os.getenv("CAMERA_HEIGHT", "480"))
LEFT = int(os.getenv("CAMERA_LEFT_INDEX", "0"))
RIGHT = int(os.getenv("CAMERA_RIGHT_INDEX", "1"))
BACKEND = cv2.CAP_DSHOW if os.name == "nt" else 0


def _open(idx):
    cap = cv2.VideoCapture(idx, BACKEND)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, H)
    return cap


print("=== Single-camera scan (indices 0..%d) ===" % MAX_INDEX)
for idx in range(MAX_INDEX + 1):
    cap = _open(idx)
    if not cap.isOpened():
        print(f"  index {idx}: not present")
        cap.release()
        continue
    ok = False
    frame = None
    for _ in range(5):                       # warm up; first frames are often junk
        ok, frame = cap.read()
    if ok and frame is not None:
        rw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        rh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cv2.imwrite(f"probe_{idx}.jpg", frame)
        print(f"  index {idx}: OK  {rw}x{rh}  -> saved probe_{idx}.jpg")
    else:
        print(f"  index {idx}: opens but no frame")
    cap.release()

print("\n=== Simultaneous PAIR test (left=%d, right=%d) ===" % (LEFT, RIGHT))
capL, capR = _open(LEFT), _open(RIGHT)
if not (capL.isOpened() and capR.isOpened()):
    print("  Could not open both indices together.")
else:
    for _ in range(15):                      # let the bus settle under dual load
        capL.read(); capR.read()
    okL, fL = capL.read()
    okR, fR = capR.read()
    if okL:
        cv2.imwrite("pair_left.jpg", fL); print("  saved pair_left.jpg")
    if okR:
        cv2.imwrite("pair_right.jpg", fR); print("  saved pair_right.jpg")
    print("  -> open pair_left.jpg and pair_right.jpg. If one is noisy/garbled,\n"
          "     that's USB-bandwidth starvation: lower CAMERA_WIDTH/HEIGHT/FPS or\n"
          "     move that camera to a different USB controller.")
capL.release(); capR.release()
