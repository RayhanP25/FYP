"""Lists which camera index gives which resolution. Run with the backend STOPPED:  python probe_cams.py"""
import cv2, os
os.environ.setdefault("OPENCV_VIDEOIO_PRIORITY_OBSENSOR", "0")
for api_name, api in (("MSMF", cv2.CAP_MSMF), ("DSHOW", cv2.CAP_DSHOW)):
    print(f"--- {api_name} ---")
    for i in range(6):
        cap = cv2.VideoCapture(i, api)
        if not cap.isOpened():
            continue
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        ok, f = cap.read()
        if ok:
            print(f"index {i}: asked 1280x720, got {f.shape[1]}x{f.shape[0]}")
            cv2.imwrite(f"probe_{api_name}_{i}.jpg", f)
        else:
            print(f"index {i}: opens but gives no frames")
        cap.release()
print("Open the probe_*.jpg files to see which camera each index is.")
