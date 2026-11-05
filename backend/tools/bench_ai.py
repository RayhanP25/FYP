r"""
bench_ai.py -- where the time goes in "Finding body points", part by part (5 Nov).

Stop the backend first (it holds the GPU), then from backend\ with the venv active:
    python tools\bench_ai.py                 the newest analysis copy in _media_cache (one camera)
    python tools\bench_ai.py --video PATH    any video (it is read at its own size)

Runs the system's own code with the system's settings (.env: TensorRT, half precision, flip test, person
detector every POSE_DET_EVERY frames) on one camera's video, timing each part separately, then the real AI step
on the same video to check the parts add up. Nothing is saved.
"""
import argparse
import glob
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BACKEND, ".env"))
except Exception:
    pass

import cv2            # noqa: E402
import numpy as np    # noqa: E402
import torch          # noqa: E402

from pose import pose_estimator as pe   # noqa: E402


def sync():
    torch.cuda.synchronize()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video")
    ap.add_argument("--frames", type=int, default=480, help="frames to time part by part (default 480 = 16 s)")
    a = ap.parse_args()
    path = a.video
    if not path:
        cands = sorted(glob.glob(os.path.join(BACKEND, "_media_cache", "small_*_L.mp4")), key=os.path.getmtime)
        if not cands:
            raise SystemExit("no analysis copy in _media_cache: record something first, or pass --video")
        path = cands[-1]
    print(f"video: {os.path.basename(path)}")
    print(f"settings: TensorRT {pe.POSE_TRT} | half precision {pe.POSE_FP16} | flip test {pe.POSE_FLIP_MODE} | "
          f"batch {pe.POSE_BATCH} | detector every {pe.DET_EVERY} frames")
    pe._load_models()
    model = pe._pose_model
    pipe = pe._pose_pipeline()
    from mmengine.dataset import pseudo_collate

    # ---- reading the video
    cap = cv2.VideoCapture(path)
    frames = []
    t = time.perf_counter()
    while len(frames) < a.frames:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    t_read = time.perf_counter() - t
    cap.release()
    n = len(frames)
    print(f"{n} frames of {frames[0].shape[1]}x{frames[0].shape[0]}\n")

    # warm up everything once (TensorRT contexts, cuDNN, the decoder self-check)
    with pe._lock:
        pe._detect_people(frames[:1])
    pe._pose_batch(frames[:pe.POSE_BATCH], [pe._whole_frame(frames[0])[0]] * pe.POSE_BATCH)
    sync()

    # ---- person detector, as the system runs it
    t = time.perf_counter()
    boxes, last = [], None
    for k in range(n):
        if k % pe.DET_EVERY == 0 or last is None:
            with pe._lock:
                last = pe._detect_people([frames[k]])[0]
        boxes.append(last)
    sync()
    t_det = time.perf_counter() - t

    # ---- the pose model, step by step
    steps = {k: 0.0 for k in ["crop", "collate", "to_gpu", "backbone", "head_decode", "pack"]}
    per_transform = {}
    use_flip = model.test_cfg.get("flip_test", False)
    for s in range(0, n, pe.POSE_BATCH):
        fr, bx = frames[s:s + pe.POSE_BATCH], boxes[s:s + pe.POSE_BATCH]
        t0 = time.perf_counter()
        data = []
        for f, b in zip(fr, bx):
            info = dict(img=f, bbox=np.asarray(b, np.float32).reshape(1, 4), bbox_score=np.ones(1, np.float32))
            info.update(model.dataset_meta)
            for tr in pipe.transforms:                 # the same transforms pipe(info) runs, timed one by one
                tt = time.perf_counter()
                info = tr(info)
                per_transform[type(tr).__name__] = per_transform.get(type(tr).__name__, 0.0) + time.perf_counter() - tt
            data.append(info)
        t1 = time.perf_counter()
        batch = pseudo_collate(data)
        t2 = time.perf_counter()
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.float16, enabled=pe.POSE_FP16):
            d = model.data_preprocessor(batch, False)
            inputs, samples = d["inputs"], d["data_samples"]
            if model.metainfo is not None:          # as pose_gpu.fast_test_step
                for ds in samples:
                    ds.set_metainfo(model.metainfo)
            sync()
            t3 = time.perf_counter()
            if use_flip:
                k = inputs.shape[0]
                f2 = model.extract_feat(torch.cat([inputs, inputs.flip(-1)], 0))
                feats = [tuple(x[:k] for x in f2), tuple(x[k:] for x in f2)]
            else:
                feats = model.extract_feat(inputs)
            sync()
            t4 = time.perf_counter()
            preds = model.head.predict(feats, samples, test_cfg=model.test_cfg)
            sync()
            t5 = time.perf_counter()
            inst = preds[0] if isinstance(preds, tuple) else preds
            out = model.add_pred_to_datasample(inst, None, samples)
            _ = [r.pred_instances.keypoints for r in out]
            t6 = time.perf_counter()
        for key, v in zip(steps, [t1 - t0, t2 - t1, t3 - t2, t4 - t3, t5 - t4, t6 - t5]):
            steps[key] += v

    total = t_read + t_det + sum(steps.values())
    rows = [("Reading the video", t_read), ("Person detector", t_det),
            ("Preparing the crops (processor)", steps["crop"]), ("  collating them", steps["collate"]),
            ("Sending to the GPU + normalising", steps["to_gpu"]), ("Backbone (TensorRT)" if pe.POSE_TRT else "Backbone (PyTorch)", steps["backbone"]),
            ("Head + decoder (with the flip test)", steps["head_decode"]), ("Packing the results", steps["pack"])]
    print(f"{'part':40s} {'seconds':>8s} {'ms/frame':>9s} {'share':>6s}")
    for name, v in rows:
        print(f"{name:40s} {v:8.2f} {1000 * v / n:9.1f} {100 * v / total:5.0f}%")
    print(f"{'total (one after the other)':40s} {total:8.2f} {1000 * total / n:9.1f}   -> {n / total:.1f} frames/s for one camera")
    print("\nPreparing the crops, by step:")
    for name, v in sorted(per_transform.items(), key=lambda x: -x[1]):
        print(f"  {name:38s} {v:8.2f} {1000 * v / n:9.1f}")

    # ---- the real AI step on the whole video, for comparison
    print("\nThe system's own AI step on this whole video (one camera):")
    t = time.perf_counter()
    r = pe._run_inference(path)
    sec = time.perf_counter() - t
    frames_all = r.get("total_frames") or len(r.get("frames", []))
    print(f"  {frames_all} frames in {sec:.1f} s -> {frames_all / sec:.1f} frames/s "
          f"(detector {r['timing']['detection_seconds']} s, pose {r['timing']['pose_seconds']} s)")


if __name__ == "__main__":
    main()
