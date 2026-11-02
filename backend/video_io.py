"""
video_io.py -- GPU-first video encode/decode through FFmpeg.

Encoding  : h264_nvenc (NVIDIA GPU) -> libx264 (fast CPU) -> libopenh264 -> OpenCV VideoWriter.
            NVENC's H.264 limit is 4096 px per side, so the 5120x1440 side-by-side stereo recording
            always uses libx264; every other video (split halves, overlays) goes to the GPU.
            Output is H.264 / yuv420p / faststart, so browsers play it.
Decoding  : ffmpeg -hwaccel cuda (NVDEC); FFmpeg silently falls back to CPU decoding when the
            GPU can't take the stream. Falls back to cv2.VideoCapture if FFmpeg is missing, or if
            FFmpeg gives no frames at all for a file OpenCV can open.
            Frame timing option: -fps_mode (FFmpeg 5.1+); -vsync only for older builds, because newer
            FFmpeg (e.g. 9.x from WinGet, found on the PATH before the bundled copy) rejects -vsync.

FFmpeg comes from FFMPEG_PATH, the PATH, or the imageio-ffmpeg package (pip install imageio-ffmpeg).
VIDEO_GPU=0 in .env turns the GPU paths off.
"""
import os
import shutil
import subprocess
import threading

import cv2
import numpy as np

USE_GPU = os.getenv("VIDEO_GPU", "1") != "0"
NVENC_MAX = 4096
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

_ENCODERS = {   # name -> extra args (quality settings)
    "h264_nvenc": ["-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0"],
    "libx264": ["-preset", "veryfast", "-crf", "20"],
    "libopenh264": ["-b:v", "20M"],
}
_probe = {}
_sync = {}
_lock = threading.Lock()


def ffmpeg_exe():
    p = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _passthrough_args(exe):
    """Keep every decoded frame as is: '-fps_mode passthrough' (FFmpeg 5.1+), else the old '-vsync passthrough'.
    Checked once per ffmpeg binary."""
    with _lock:
        if exe not in _sync:
            cmd = [exe, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
                   "-frames:v", "1", "-fps_mode", "passthrough", "-f", "null", "-"]
            try:
                ok = subprocess.run(cmd, capture_output=True, timeout=30, creationflags=_NO_WINDOW).returncode == 0
            except Exception:
                ok = False
            _sync[exe] = ["-fps_mode", "passthrough"] if ok else ["-vsync", "passthrough"]
        return _sync[exe]


def _encoder_works(name):
    """Encode a few tiny frames once to see if this encoder (and the GPU, for NVENC) really works."""
    with _lock:
        if name not in _probe:
            exe = ffmpeg_exe()
            ok = False
            if exe:
                cmd = [exe, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                       "color=c=black:s=256x256:r=30", "-frames:v", "5", "-c:v", name,
                       *_ENCODERS[name], "-pix_fmt", "yuv420p", "-f", "null", "-"]
                try:
                    ok = subprocess.run(cmd, capture_output=True, timeout=30,
                                        creationflags=_NO_WINDOW).returncode == 0
                except Exception:
                    ok = False
            _probe[name] = ok
        return _probe[name]


def pick_encoder(w, h):
    order = ["libx264", "libopenh264"]
    if USE_GPU and w <= NVENC_MAX and h <= NVENC_MAX:
        order.insert(0, "h264_nvenc")
    for name in order:
        if _encoder_works(name):
            return name
    return None


class _FFmpegWriter:
    def __init__(self, path, w, h, fps, encoder):
        self.w, self.h, self.encoder = w, h, encoder
        cmd = [ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps}", "-i", "-",
               "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",          # yuv420p needs even sizes
               "-c:v", encoder, *_ENCODERS[encoder],
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", path]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE,
                                     creationflags=_NO_WINDOW)
        self._err = b""
        self._t = threading.Thread(target=self._drain, daemon=True)
        self._t.start()

    def _drain(self):
        self._err = self.proc.stderr.read()

    def isOpened(self):
        return self.proc.poll() is None

    def write(self, frame):
        if frame.shape[1] != self.w or frame.shape[0] != self.h:
            frame = cv2.resize(frame, (self.w, self.h))
        self.proc.stdin.write(np.ascontiguousarray(frame).tobytes())

    def release(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        self.proc.wait()
        self._t.join(timeout=5)
        if self.proc.returncode != 0:
            raise RuntimeError(f"ffmpeg ({self.encoder}) failed: {self._err.decode(errors='ignore')[-500:]}")


class _CvWriter:
    """Last resort: OpenCV's own writer (CPU)."""
    def __init__(self, path, w, h, fps):
        self.encoder = None
        for codec in ("avc1", "mp4v"):
            self.wr = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*codec), fps, (w, h))
            if self.wr.isOpened():
                self.encoder = f"opencv-{codec}"
                break
            self.wr.release()
        if self.encoder is None:
            raise RuntimeError("No usable video encoder (ffmpeg missing, OpenCV avc1/mp4v failed)")

    def isOpened(self):
        return self.wr.isOpened()

    def write(self, frame):
        self.wr.write(frame)

    def release(self):
        self.wr.release()


def open_writer(path, w, h, fps):
    """VideoWriter-like object (write / release / isOpened / .encoder), GPU first."""
    enc = pick_encoder(w, h)
    return _FFmpegWriter(path, w, h, fps, enc) if enc else _CvWriter(path, w, h, fps)


class VideoReader:
    """cv2.VideoCapture-like reader (read / get / isOpened / release), decoded by FFmpeg with NVDEC."""

    def __init__(self, path):
        cap = cv2.VideoCapture(path)
        self._ok = cap.isOpened()
        self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        self.count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        exe = ffmpeg_exe()
        self.proc = self.cap = None
        self._path, self._exe, self._first = path, exe, True
        if self._ok and exe and self.width > 0 and self.height > 0:
            cap.release()
            self._n = self.width * self.height * 3
            self._hw = USE_GPU
            self._start()
        else:
            self.cap = cap

    def _start(self):
        hw = ["-hwaccel", "cuda"] if self._hw else []
        cmd = [self._exe, "-hide_banner", "-loglevel", "error", *hw, "-i", self._path,
               "-f", "rawvideo", "-pix_fmt", "bgr24", *_passthrough_args(self._exe), "-"]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     creationflags=_NO_WINDOW, bufsize=self._n * 2)

    def isOpened(self):
        return self._ok

    def get(self, prop):
        return {cv2.CAP_PROP_FRAME_WIDTH: self.width, cv2.CAP_PROP_FRAME_HEIGHT: self.height,
                cv2.CAP_PROP_FPS: self.fps, cv2.CAP_PROP_FRAME_COUNT: self.count}.get(prop, 0)

    def read(self):
        if self.cap is not None:
            return self.cap.read()
        buf = self.proc.stdout.read(self._n)
        if len(buf) < self._n and self._first and self._hw:
            # GPU decoder unavailable for this file (no CUDA, or bigger than NVDEC allows): CPU decode
            self.proc.kill(); self.proc.wait()
            self._hw = False
            self._start()
            buf = self.proc.stdout.read(self._n)
        if len(buf) < self._n and self._first:
            # FFmpeg gave nothing at all although OpenCV opened the file (an FFmpeg build that rejects
            # our options, a codec it lacks...): read with OpenCV instead of returning an empty video.
            self.proc.kill(); self.proc.wait()
            self.proc = None
            self._first = False
            print(f"video: ffmpeg ({self._exe}) gave no frames for {os.path.basename(self._path)}; using OpenCV")
            self.cap = cv2.VideoCapture(self._path)
            return self.cap.read()
        self._first = False
        if len(buf) < self._n:
            return False, None
        return True, np.frombuffer(buf, np.uint8).reshape(self.height, self.width, 3).copy()

    def release(self):
        if self.cap is not None:
            self.cap.release()
        if self.proc is not None:
            try:
                self.proc.stdout.close()
            except Exception:
                pass
            self.proc.kill()
            self.proc.wait()


def describe():
    """One line for the startup log: which encoders work on this machine."""
    exe = ffmpeg_exe()
    if not exe:
        return "video: ffmpeg NOT found -> OpenCV CPU encoding (pip install imageio-ffmpeg)"
    parts = [f"{n}={'yes' if _encoder_works(n) else 'no'}" for n in _ENCODERS]
    return f"video: ffmpeg {exe} | " + ", ".join(parts) + f" | GPU decode {'on' if USE_GPU else 'off'}"
