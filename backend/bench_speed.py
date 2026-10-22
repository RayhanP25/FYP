"""Speed / accuracy of each GPU speed-up. Stop the backend first, then:
    python bench_speed.py          (newest stereo recording in MinIO, or pass a video path)
Each row adds one change; keypoint differences are against the first row (your current settings)."""
import os, sys, time, tempfile
import numpy as np
from dotenv import load_dotenv
load_dotenv()
os.environ.setdefault("POSE_FP16", "1")
import torch
import pose_estimator as pe
import pose_gpu
import stereo_process as sp
import video_io

N = int(os.environ.get("BENCH_FRAMES", "160"))

def get_video():
    if len(sys.argv) > 1:
        return sys.argv[1]
    from minio_client import minio_client
    bucket = os.getenv("MINIO_BUCKET", "sport-pose-videos")
    o = max((o for o in minio_client.list_objects(bucket) if o.object_name.startswith("stereo_")), key=lambda o: o.last_modified)
    p = tempfile.mktemp(suffix=".mp4"); minio_client.fget_object(bucket, o.object_name, p)
    print("using", o.object_name); return p

def shorten(path):
    out = tempfile.mktemp(suffix=".mp4"); r = video_io.VideoReader(path); w = None
    for _ in range(N):
        ok, f = r.read()
        if not ok: break
        w = w or video_io.open_writer(out, f.shape[1], f.shape[0], 30); w.write(f)
    r.release(); w.release(); return out

lp, rp, _ = sp._split_ffmpeg(get_video(), 1280)
L = shorten(lp)
pe._load_models()
model = pe._pose_model

def setting(decode, flipbatch, fastdet, prefetch, chlast, flip=True):
    pose_gpu.DECODE_ON = decode
    pose_gpu.FLIP_BATCH_ON = flipbatch; pe.POSE_FLIP_BATCH = flipbatch
    pe.POSE_FAST_DET = fastdet; pe.POSE_PREFETCH = prefetch
    pose_gpu.set_channels_last(model, chlast)
    model.test_cfg["flip_test"] = flip

def kps(res):
    return np.array([[p[:2] for p in f["keypoints"]] if f["keypoints"] else np.full((18, 2), np.nan)
                     for f in res["frames"]]) * [res["video_width"], res["video_height"]]

rows = [("current (batched fp16)", (False, False, False, False, False)),
        ("+ GPU heatmap decoding", (True, False, False, False, False)),
        ("+ flip in one batch", (True, True, False, False, False)),
        ("+ direct detector", (True, True, True, False, False)),
        ("+ read video ahead", (True, True, True, True, False)),
        ("+ channels-last head", (True, True, True, True, True)),
        ("all + flip test OFF", (True, True, True, True, True, False))]
print(f"\n{N} frames, one camera, fp16={pe.POSE_FP16}\n")
print(f"{'setting':26s} {'time':>6s} {'fps':>6s} {'speed-up':>8s}   keypoint diff vs current (px @1280): median / 99th / max")
base = None
for name, cfg in rows:
    setting(*cfg)
    pe._run_inference(L)                                    # warm-up for this setting (cuDNN tuning)
    t = time.perf_counter(); res = pe._run_inference(L); dt = time.perf_counter() - t
    k = kps(res)
    if base is None:
        base = (dt, k); print(f"{name:26s} {dt:5.1f}s {N/dt:6.1f} {'1.0x':>8s}"); continue
    d = np.linalg.norm(k - base[1], axis=2).ravel(); d = d[np.isfinite(d)]
    print(f"{name:26s} {dt:5.1f}s {N/dt:6.1f} {base[0]/dt:7.2f}x   {np.median(d):6.3f} / {np.percentile(d, 99):6.3f} / {d.max():6.3f}")
print(f"\nGPU memory peak: {torch.cuda.max_memory_allocated() / 1e9:.1f} GB")
