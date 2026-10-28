"""Person-detector speed with RTMDet's default output settings vs the tuned ones (POSE_DET_SCORE_THR),
and proof that the person box we use is the same. Stop the backend first, then:  python bench_det.py"""
import os, sys, time, tempfile
import numpy as np
from dotenv import load_dotenv
load_dotenv()
os.environ.setdefault("POSE_FP16", "1")
import torch
import pose_estimator as pe, stereo_process as sp, video_io

def get_video():
    if len(sys.argv) > 1: return sys.argv[1]
    from minio_client import minio_client
    b = os.getenv("MINIO_BUCKET", "sport-pose-videos")
    o = max((o for o in minio_client.list_objects(b) if o.object_name.startswith("stereo_")), key=lambda o: o.last_modified)
    p = tempfile.mktemp(suffix=".mp4"); minio_client.fget_object(b, o.object_name, p); return p

lp, rp, _ = sp._split_ffmpeg(get_video(), 1280)
frames = []
for path in (lp, rp):
    r = video_io.VideoReader(path)
    while True:
        ok, f = r.read()
        if not ok: break
        frames.append(f)
    r.release()
frames = frames[::5]                                     # every 5th frame of both cameras
pe._load_models()
default = pe.tune_detector(0)                           # current settings (already tuned at load)
cfg = pe._detector.model.bbox_head.test_cfg

def boxes_and_time():
    pe._detect_person(frames[0]); torch.cuda.synchronize()
    t = time.perf_counter(); out = [pe._detect_person(f) for f in frames]; torch.cuda.synchronize()
    return np.array(out).reshape(len(frames), 4), 1000 * (time.perf_counter() - t) / len(frames)

cfg["score_thr"], cfg["nms_pre"] = 0.001, 30000          # RTMDet defaults
b0, t0 = boxes_and_time()
pe.tune_detector(0.3)                                   # tuned
b1, t1 = boxes_and_time()
d = np.abs(b1 - b0).max(axis=1)
print(f"\n{len(frames)} frames from both cameras")
print(f"RTMDet defaults (score_thr 0.001): {t0:6.1f} ms per image")
print(f"tuned (score_thr 0.3, nms_pre 1000): {t1:6.1f} ms per image ({t0 / t1:.1f}x faster)")
print(f"person box difference: max {d.max():.3f} px, frames with any difference: {(d > 0.01).sum()} of {len(frames)}")
