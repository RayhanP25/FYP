"""
diag_video.py -- check the video path the analysis uses (ffmpeg encode / split / decode) on this PC.

Run from the backend folder in the venv, with the backend stopped or running (it doesn't matter):
    python diag_video.py                    # synthetic test only
    python diag_video.py "C:\\path\\to\\recording.mp4"   # also check a real recording

It builds a small side-by-side test video, then runs it through the same steps as stereo analysis:
the one-pass ffmpeg split into left/right halves and the frame reader, once with the GPU (NVENC/NVDEC)
and once without. Every step prints how many frames it got; 0 frames is the fault.
"""
import os
import subprocess
import sys
import tempfile
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import video_io  # noqa: E402


def frames_cv(path):
    cap = cv2.VideoCapture(path)
    n = 0
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        n += 1
    meta = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
    cap.release()
    return n, meta


def frames_reader(path):
    r = video_io.VideoReader(path)
    n = 0
    while True:
        ok, _ = r.read()
        if not ok:
            break
        n += 1
    hw = getattr(r, "_hw", None)
    r.release()
    return n, hw


def run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        return -1, str(e)
    return p.returncode, (p.stdout + p.stderr).strip()


def section(title):
    print(f"\n=== {title} ===")


def check_split(src, label):
    import stereo_process
    t = time.time()
    res = stereo_process._split_ffmpeg(src, 1280)
    if res is None:
        print(f"  [{label}] ffmpeg split FAILED (the app then falls back to the slower Python split)")
        return
    lp, rp, fps = res
    for side, p in (("left", lp), ("right", rp)):
        n_cv, meta = frames_cv(p)
        n_rd, hw = frames_reader(p)
        print(f"  [{label}] {side}: {os.path.getsize(p) // 1024} KB, opencv reads {n_cv} frames {meta}, "
              f"app reader reads {n_rd} frames (GPU decode {'on' if hw else 'off'})")
        os.unlink(p)
    print(f"  [{label}] split took {time.time() - t:.1f} s")


def main():
    section("System")
    print("  python", sys.version.split()[0], "| opencv", cv2.__version__)
    exe = video_io.ffmpeg_exe()
    print("  ffmpeg:", exe)
    if exe:
        print("  ", run([exe, "-hide_banner", "-version"])[1].splitlines()[0])
    rc, out = run(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"])
    print("  GPU:", out if rc == 0 else "nvidia-smi not available")
    try:
        import torch
        print("  torch", torch.__version__, "| cuda", torch.cuda.is_available(),
              "|", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "-")
    except Exception as e:
        print("  torch import failed:", e)
    print(" ", video_io.describe())

    section("NVENC error text (if it fails)")
    if exe:
        rc, out = run([exe, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=30",
                       "-frames:v", "30", "-c:v", "h264_nvenc", "-pix_fmt", "yuv420p", "-f", "null", "-"])
        print("  h264_nvenc 1280x720:", "OK" if rc == 0 else f"FAILED: {out[-400:]}")
        rc, out = run([exe, "-hide_banner", "-loglevel", "error", "-hwaccel", "cuda", "-f", "lavfi",
                       "-i", "testsrc=s=1280x720:r=30", "-frames:v", "30", "-f", "null", "-"])
        print("  -hwaccel cuda flag accepted:", "yes" if rc == 0 else f"no: {out[-300:]}")

    section("Synthetic 5120x1440 side-by-side recording (60 frames)")
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "test_sbs.mp4")
    w = video_io.open_writer(src, 5120, 1440, 30)
    print("  encoder for the recording:", w.encoder)
    for i in range(60):
        f = np.zeros((1440, 5120, 3), np.uint8)
        cv2.putText(f, f"L {i}", (200, 700), cv2.FONT_HERSHEY_SIMPLEX, 8, (255, 255, 255), 12)
        cv2.putText(f, f"R {i}", (2760, 700), cv2.FONT_HERSHEY_SIMPLEX, 8, (255, 255, 255), 12)
        w.write(f)
    w.release()
    print(f"  written: {os.path.getsize(src) // 1024} KB, opencv reads {frames_cv(src)[0]} frames")

    section("Split + read, GPU on (what the app does now)")
    video_io.USE_GPU = True
    video_io._probe.clear()
    check_split(src, "GPU")

    section("Split + read, GPU off (VIDEO_GPU=0)")
    video_io.USE_GPU = False
    video_io._probe.clear()
    check_split(src, "CPU")

    if len(sys.argv) > 1:
        real = sys.argv[1]
        section(f"Real recording: {real}")
        n, meta = frames_cv(real)
        print(f"  opencv reads {n} frames {meta}")
        video_io.USE_GPU = True
        video_io._probe.clear()
        check_split(real, "GPU")
        video_io.USE_GPU = False
        video_io._probe.clear()
        check_split(real, "CPU")
    print("\nDone. Send the whole output.")


if __name__ == "__main__":
    main()
