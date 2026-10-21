"""Speed / accuracy check of the pose model settings. Stop the backend first, then:
    python bench_pose.py            (uses your newest stereo recording from MinIO)
    python bench_pose.py some.mp4   (or any video file)
Compares the old one-frame-at-a-time path with batched float32 and batched float16."""
import os, sys, time, tempfile
import numpy as np
from dotenv import load_dotenv
load_dotenv()
import pose_estimator as pe
import stereo_process as sp

FRAMES = int(os.environ.get("BENCH_FRAMES", "150"))

def get_video():
    if len(sys.argv) > 1:
        return sys.argv[1]
    from minio_client import minio_client
    bucket = os.getenv("MINIO_BUCKET", "sport-pose-videos")
    objs = [o for o in minio_client.list_objects(bucket) if o.object_name.startswith("stereo_")]
    newest = max(objs, key=lambda o: o.last_modified)
    path = tempfile.mktemp(suffix=".mp4")
    minio_client.fget_object(bucket, newest.object_name, path)
    print(f"using {newest.object_name} ({newest.size / 1e6:.0f} MB)")
    return path

src = get_video()
t = time.perf_counter(); split = sp._split_ffmpeg(src, 1280); t_split = time.perf_counter() - t
if split is None:
    print("ffmpeg split failed -- is imageio-ffmpeg installed?"); sys.exit(1)
left = split[0]
print(f"split (ffmpeg, both halves): {t_split:.1f} s")

# keep only the first FRAMES frames for the comparison
import cv2, video_io
short = tempfile.mktemp(suffix=".mp4")
r = video_io.VideoReader(left); w = None
for i in range(FRAMES):
    ok, f = r.read()
    if not ok: break
    if w is None: w = video_io.open_writer(short, f.shape[1], f.shape[0], 30)
    w.write(f)
r.release(); w.release()

def run(batch, fp16):
    pe.POSE_BATCH, pe.POSE_FP16 = batch, fp16
    t = time.perf_counter(); res = pe._run_inference(short); dt = time.perf_counter() - t
    kp = np.array([[p[:2] for p in f["keypoints"]] if f["keypoints"] else np.full((18, 2), np.nan)
                   for f in res["frames"]]) * [res["video_width"], res["video_height"]]
    sc = np.array([[p[2] for p in f["keypoints"]] if f["keypoints"] else np.full(18, np.nan) for f in res["frames"]])
    return dt, len(res["frames"]), kp, sc

pe._load_models(); run(4, False)                     # warm-up (model load, cuDNN autotune)
base = run(1, False)
print(f"\n{'setting':28s} {'time':>7s} {'fps':>6s} {'speed-up':>8s}   keypoint diff vs old (px @1280): median / 99th / max   conf diff max")
print(f"{'old (1 frame at a time)':28s} {base[0]:6.1f}s {base[1]/base[0]:6.1f} {'1.0x':>8s}")
for name, b, h in (("batched x16, float32", 16, False), ("batched x16, float16", 16, True)):
    dt, n, kp, sc = run(b, h)
    d = np.linalg.norm(kp - base[2], axis=2).ravel(); d = d[np.isfinite(d)]
    print(f"{name:28s} {dt:6.1f}s {n/dt:6.1f} {base[0]/dt:7.1f}x   {np.median(d):6.2f} / {np.percentile(d, 99):6.2f} / {d.max():6.2f}"
          f"          {np.nanmax(np.abs(sc - base[3])):.3f}")
