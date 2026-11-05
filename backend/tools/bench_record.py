r"""
bench_record.py -- where the time goes while recording, measured part by part (5 Nov).

Stop the backend first (it holds the cameras), then from backend\ with the venv active:
    python tools\bench_record.py            (about 1 minute; --seconds 8 per test)

Each test runs for a few seconds and reports, per camera, how many frames per second it kept up with, how many
processor cores the backend process used, and how long each step took per frame. 30 fps = keeping up.

    A  cameras only                         (two reader threads, as the backend)
    B  A + the live preview                 (both views side by side, half size, JPEG 75, PREVIEW_FPS)
    C  B + JPEG backups                     (4 workers, JPEG 95 to disk: what recording does now)
    D  GPU encoder only, dummy frames       (4 FFmpeg h264_nvenc, raw YUV from a pipe: its capacity alone)
    E  B + live encoding, no JPEG backups   (OpenCV -> YUV + small copy -> 4 FFmpeg)
    F  C + live encoding                    (what the 5 Nov attempt did)
    G  B + the AI during recording           (pose_estimator.LiveAI; 60 fps = keeps up with both cameras)
    H  B + live encoding + the AI, no JPEG backups
    I  C + live encoding + the AI           (everything, as the system ran on 5 Nov 11:00)
"""
import argparse
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BACKEND, ".env"))
except Exception:
    pass
from video import video_io   # noqa: E402

W = int(os.getenv("CAMERA_WIDTH", "640"))
H = int(os.getenv("CAMERA_HEIGHT", "480"))
FPS = int(os.getenv("CAMERA_FPS", "30"))
API = os.getenv("CAMERA_API", "msmf").lower()
PREVIEW_FPS = float(os.getenv("PREVIEW_FPS", "30"))
PREVIEW_SCALE = float(os.getenv("PREVIEW_SCALE", "0.5"))
LEFT, RIGHT = int(os.getenv("CAMERA_LEFT_INDEX", "0")), int(os.getenv("CAMERA_RIGHT_INDEX", "1"))
try:
    d = json.load(open(os.path.join(BACKEND, "camera_settings.json"), encoding="utf-8"))
    LEFT, RIGHT = int(d["left"]), int(d["right"])
except Exception:
    pass


def open_cam(index):
    backend = (cv2.CAP_DSHOW if API == "dshow" else cv2.CAP_MSMF) if os.name == "nt" else 0
    cap = cv2.VideoCapture(index, backend)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, H)
    cap.set(cv2.CAP_PROP_FPS, FPS)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    ok, f = cap.read()
    if not ok:
        raise SystemExit(f"camera {index} gave no picture (is the backend still running?)")
    return cap, f.shape[1], f.shape[0]


class Reader:
    def __init__(self, cap):
        self.cap, self.lock = cap, threading.Lock()
        self.frame, self.seq, self.ms = None, 0, []
        self.on = True
        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while self.on:
            t = time.perf_counter()
            ok, f = self.cap.read()
            if ok:
                self.ms.append(1000 * (time.perf_counter() - t))
                with self.lock:
                    self.frame, self.seq = f, self.seq + 1

    def get(self):
        with self.lock:
            return self.frame, self.seq


class Encoders:
    """4 FFmpeg h264_nvenc fed raw YUV 4:2:0 (left/right, full/small), short input queue."""
    def __init__(self, w, h, small_w=1280):
        exe = video_io.ffmpeg_exe()
        self.full = (w - w % 2, h - h % 2)
        sw = min(small_w, self.full[0])
        sh = int(round(self.full[1] * sw / self.full[0]))
        self.small = (sw - sw % 2, sh - sh % 2)
        self.dir = tempfile.mkdtemp(prefix="bench_enc_")
        args = video_io._ENCODERS["h264_nvenc"]
        self.procs = []
        for k, (cw, ch) in enumerate([self.full, self.full, self.small, self.small]):
            cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-thread_queue_size", "4",
                   "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{cw}x{ch}", "-framerate", str(FPS),
                   "-i", "pipe:0", "-c:v", "h264_nvenc", *args, os.path.join(self.dir, f"{k}.mp4")]
            self.procs.append(subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                               stderr=subprocess.PIPE,
                                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)))

    def convert(self, f):
        W_, H_ = self.full
        f = f[:H_, :W_]
        return (cv2.cvtColor(f, cv2.COLOR_BGR2YUV_I420),
                cv2.cvtColor(cv2.resize(f, self.small, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2YUV_I420))

    def write(self, bufs):
        for p, b in zip(self.procs, bufs):
            p.stdin.write(memoryview(b))

    def close(self):
        for p in self.procs:
            try:
                p.stdin.close()
            except Exception:
                pass
        errs = []
        for p in self.procs:
            p.wait()
            e = p.stderr.read().decode("utf-8", "ignore").strip()
            if e:
                errs.append(e[-200:])
        shutil.rmtree(self.dir, ignore_errors=True)
        return errs


def run(name, readers, seconds, preview=False, jpeg=False, live=False, ai=False):
    stop = threading.Event()
    stats = {"pairs": 0, "jpeg_ms": [], "conv_ms": [], "write_ms": [], "dropped": 0, "preview": 0}
    threads = []
    seq0 = [r.seq for r in readers]
    for r in readers:
        r.ms.clear()

    if preview:
        def prev():
            iv = 1.0 / max(1.0, PREVIEW_FPS)
            while not stop.is_set():
                fL, _ = readers[0].get()
                fR, _ = readers[1].get()
                if fL is not None and fR is not None:
                    img = np.hstack([fL, fR])
                    img = cv2.resize(img, None, fx=PREVIEW_SCALE, fy=PREVIEW_SCALE, interpolation=cv2.INTER_AREA)
                    cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    stats["preview"] += 1
                time.sleep(iv)
        threads.append(threading.Thread(target=prev, daemon=True))

    tmp = tempfile.mkdtemp(prefix="bench_rec_") if jpeg else None
    pool = ThreadPoolExecutor(4) if jpeg else None
    enc = Encoders(*readers[0].frame.shape[1::-1]) if live else None
    live_q = queue.Queue()
    lai = None
    if ai:
        from pose import pose_estimator as pe
        h_, w_ = readers[0].frame.shape[:2]
        lai = pe.LiveAI(w_, h_, 1280, 1.0 / FPS, max_frames=10 ** 9)   # no limit here: measure its own speed
        time.sleep(3)                                                  # it warms up before recording, as in the system

    def save(k, fL, fR):
        t = time.perf_counter()
        for f, s in ((fL, "L"), (fR, "R")):
            ok, b = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 95])
            with open(os.path.join(tmp, f"{k}_{s}.jpg"), "wb") as fh:
                fh.write(b.tobytes())
        stats["jpeg_ms"].append(1000 * (time.perf_counter() - t))

    def live_loop():
        while True:
            item = live_q.get()
            if item is None:
                return
            if live_q.qsize() > 30:
                stats["dropped"] += 1
                continue
            fL, fR = item
            if enc is not None:
                t0 = time.perf_counter()
                a, b = enc.convert(fL)
                c, d = enc.convert(fR)
                t1 = time.perf_counter()
                enc.write([a, c, b, d])
                stats["conv_ms"].append(1000 * (t1 - t0))
                stats["write_ms"].append(1000 * (time.perf_counter() - t1))
            if lai is not None:
                lai.add(time.time(), fL, fR)

    if live or ai:
        threads.append(threading.Thread(target=live_loop, daemon=True))

    def capture():
        last, k, pending = readers[0].seq, 0, []
        while not stop.is_set():
            fL, s = readers[0].get()
            if s == last:
                time.sleep(0.002)
                continue
            last = s
            fR, _ = readers[1].get()
            stats["pairs"] += 1
            if jpeg:
                pending = [j for j in pending if not j.done()]
                if len(pending) >= 90:
                    stats["dropped"] += 1
                else:
                    pending.append(pool.submit(save, k, fL, fR))
                    k += 1
            if live or ai:
                live_q.put((fL, fR))
    if jpeg or live or ai:
        threads.append(threading.Thread(target=capture, daemon=True))

    done0 = len(lai.tracks["L"].frames) if lai else 0
    cpu0, t0 = time.process_time(), time.perf_counter()
    for t in threads:
        t.start()
    time.sleep(seconds)
    stop.set()
    wall = time.perf_counter() - t0
    cpu = time.process_time() - cpu0
    ai_done = (len(lai.tracks["L"].frames) - done0) * 2 if lai else 0
    ai_taken = lai.written * 2 if lai else 0
    live_q.put(None)
    for t in threads:
        t.join(timeout=10)
    if pool:
        pool.shutdown(wait=True)
        shutil.rmtree(tmp, ignore_errors=True)
    errs = enc.close() if enc else []
    if lai is not None:
        lai.finish()
        lai.result(timeout=120)                         # let it finish before the next test

    cam_fps = [(r.seq - s0) / wall for r, s0 in zip(readers, seq0)]
    med = lambda v: f"{np.median(v):.1f}" if v else "-"
    line = (f"{name:44s} cameras {cam_fps[0]:4.1f} / {cam_fps[1]:4.1f} fps | cores busy {cpu / wall:4.1f} of "
            f"{os.cpu_count()} | camera read {med(readers[0].ms)} ms")
    if preview:
        line += f" | preview {stats['preview'] / wall:4.1f} fps"
    if jpeg:
        line += f" | JPEG pair {med(stats['jpeg_ms'])} ms"
    if live:
        done = len(stats["conv_ms"])
        line += (f" | live {done / wall:4.1f} fps (convert {med(stats['conv_ms'])} ms, to FFmpeg "
                 f"{med(stats['write_ms'])} ms)")
    if ai:
        line += f" | AI {ai_done / wall:4.1f} fps (both cameras; 60 = keeping up), {ai_taken - ai_done} frames waiting at the end"
    if jpeg or live or ai:
        line += f" | dropped {stats['dropped']}"
    print(line, flush=True)
    for e in errs:
        print("    FFmpeg:", e)


def encoder_only(w, h, seconds):
    enc = Encoders(w, h)
    rng = np.random.default_rng(0)
    frame = cv2.GaussianBlur(rng.integers(0, 256, (h, w, 3), dtype=np.uint8), (0, 0), 3)
    a, b = enc.convert(frame)
    n, t0, cpu0 = 0, time.perf_counter(), time.process_time()
    tw = []
    while time.perf_counter() - t0 < seconds:
        t = time.perf_counter()
        enc.write([a, a, b, b])
        tw.append(1000 * (time.perf_counter() - t))
        n += 1
    wall = time.perf_counter() - t0
    errs = enc.close()
    print(f"{'D  GPU encoder only (dummy frames)':44s} {n / wall:5.1f} frame pairs per second "
          f"(30 needed) | to FFmpeg {np.median(tw):.1f} ms | cores busy {(time.process_time() - cpu0) / wall:4.1f}")
    t = time.perf_counter()
    for _ in range(30):
        enc.convert(frame)
    print(f"{'   OpenCV convert on an idle processor':44s} {1000 * (time.perf_counter() - t) / 30:.1f} ms per camera frame")
    for e in errs:
        print("    FFmpeg:", e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=8)
    a = ap.parse_args()
    print(f"cameras {LEFT} and {RIGHT}, asking {W}x{H} at {FPS} fps ({API}); preview {PREVIEW_FPS:g} fps x{PREVIEW_SCALE:g}")
    print(f"ffmpeg: {video_io.ffmpeg_exe()}")
    capL, w, h = open_cam(LEFT)
    capR, w2, h2 = open_cam(RIGHT)
    print(f"cameras give {w}x{h} and {w2}x{h2}\n")
    readers = [Reader(capL), Reader(capR)]
    time.sleep(2)                                   # let both settle
    run("A  cameras only", readers, a.seconds)
    run("B  + preview", readers, a.seconds, preview=True)
    run("C  + preview + JPEG backups (now)", readers, a.seconds, preview=True, jpeg=True)
    for r in readers:
        r.on = False
    time.sleep(0.5)
    encoder_only(w, h, a.seconds)
    readers = [Reader(capL), Reader(capR)]
    time.sleep(1)
    run("E  + preview + live encoding, no JPEG", readers, a.seconds, preview=True, live=True)
    run("F  + preview + JPEG + live encoding", readers, a.seconds, preview=True, jpeg=True, live=True)
    try:
        from pose import pose_estimator as pe
        pe._load_models()
        print("\n(AI loaded)")
        run("G  + preview + AI during recording", readers, a.seconds, preview=True, ai=True)
        run("H  + preview + live encoding + AI, no JPEG", readers, a.seconds, preview=True, live=True, ai=True)
        run("I  + preview + JPEG + live encoding + AI", readers, a.seconds, preview=True, jpeg=True, live=True, ai=True)
    except Exception as ex:
        print(f"AI tests skipped: {ex!r}")
    for r in readers:
        r.on = False
    time.sleep(0.3)
    capL.release()
    capR.release()


if __name__ == "__main__":
    main()
