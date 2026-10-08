#!/usr/bin/env python3
"""
test_pose_estimator.py -- test the ViTPose pose_estimator.py WITHOUT the web system
(no MongoDB, no MinIO, no frontend). It calls exactly the function the backend calls
(process_video_with_overlays) on one video and saves:
  test_output/<name>_overlay.mp4   video with the 18-keypoint skeleton drawn on it
  test_output/<name>_pose.json     the keypoints/angles the backend would store

Put this file in backend/ (next to pose_estimator.py) and run, in the `mmpose` env:
  python test_pose_estimator.py path\\to\\video.mp4 --max-frames 150
"""
import argparse, json, os, sys, tempfile, time
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def trim(src, n):
    """Copy the first n frames to a temp file (keeps the test short)."""
    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    dst = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    vw = cv2.VideoWriter(dst, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    k = 0
    while k < n:
        ok, f = cap.read()
        if not ok:
            break
        vw.write(f); k += 1
    cap.release(); vw.release()
    return dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--max-frames", type=int, default=150, help="0 = whole video")
    ap.add_argument("--out", default=os.path.join(HERE, "test_output"))
    a = ap.parse_args()
    if not os.path.exists(a.video):
        sys.exit(f"video not found: {a.video}")
    import pose_estimator as pe
    if "mediapipe" in open(pe.__file__, encoding="utf-8").read().split("def ")[0]:
        sys.exit("pose_estimator.py is still the MediaPipe version -- copy the ViTPose one in first")
    for f in (pe._POSE_CONFIG, pe._POSE_CKPT):
        if not os.path.exists(f):
            sys.exit(f"missing model file: {f}")
    os.makedirs(a.out, exist_ok=True)
    name = os.path.splitext(os.path.basename(a.video))[0]
    src = trim(a.video, a.max_frames) if a.max_frames else a.video
    out_mp4 = os.path.join(a.out, name + "_overlay.mp4")
    print(f"device: {pe._DEVICE}   (set POSE_DEVICE=cpu or cuda:0 to force)")
    print("loading ViTPose + person detector (first run downloads the detector weights) ...")
    t0 = time.time()
    res = pe.process_video_with_overlays(src, out_mp4, apply_healing=False)
    dt = time.time() - t0
    frames = res["frames"]
    ok = sum(1 for f in frames if f["keypoints"])
    json.dump(res, open(os.path.join(a.out, name + "_pose.json"), "w"))
    print(f"\nframes processed : {res['total_frames']}  ({res['video_width']}x{res['video_height']})")
    print(f"frames with pose : {ok}  ({100 * ok / max(1, len(frames)):.0f}%)")
    print(f"time             : {dt:.1f} s total, {dt / max(1, len(frames)):.2f} s per frame (includes model loading)")
    if ok:
        kp = next(f["keypoints"] for f in frames if f["keypoints"])
        print(f"first pose, 18 keypoints [x, y, conf] (x/y as fraction of width/height):")
        for i, p in enumerate(kp):
            print(f"   {i:2d}  {p[0]:.3f}  {p[1]:.3f}  {p[2]:.2f}")
    size = os.path.getsize(out_mp4) if os.path.exists(out_mp4) else 0
    if size < 10000:
        print(f"\nWARNING: overlay video was NOT written properly ({size} bytes) -- see README (OpenH264).")
    print(f"\nsaved: {out_mp4}  ({size / 1e6:.1f} MB)\n       {os.path.join(a.out, name + '_pose.json')}")
    print("Open the overlay video: the green skeleton should sit on the athlete.")


if __name__ == "__main__":
    main()
