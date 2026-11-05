"""
media_cache.py -- a copy on this PC of the videos it recorded or received.

The analysis then reads the local copy instead of downloading the same large file from cloud storage
again, and a recording can be sent to storage in the background while it is already being analysed.
Videos downloaded for an analysis are kept here too. Oldest files are removed when the cache grows past
MEDIA_CACHE_GB (default 10). It lives in backend/_media_cache, next to the code (not on C:).
"""
import os
import shutil

from core.paths import BACKEND_DIR

DIR = os.getenv("MEDIA_CACHE_DIR") or os.path.join(BACKEND_DIR, "_media_cache")
MAX_BYTES = float(os.getenv("MEDIA_CACHE_GB", "10")) * 1024 ** 3


def path_for(object_name):
    return os.path.join(DIR, os.path.basename(object_name))


def small_name(object_name):
    """The cache name of a recording's smaller copy for the analysis (made while recording, kept on this PC)."""
    return f"small_{os.path.basename(object_name)}"


def get(object_name):
    """Local path of this stored video, or None if it is not on this PC."""
    p = path_for(object_name) if object_name else None
    if p and os.path.exists(p) and os.path.getsize(p) > 0:
        try:
            os.utime(p)              # recently used: kept longest
        except OSError:
            pass
        return p
    return None


def put(object_name, src, move=False):
    """Keep a copy of src as this stored video. Returns the cached path (None if it could not be kept)."""
    try:
        os.makedirs(DIR, exist_ok=True)
        dst = path_for(object_name)
        tmp = dst + ".part"
        (shutil.move if move else shutil.copyfile)(src, tmp)
        os.replace(tmp, dst)
        prune(keep=dst)
        return dst
    except Exception as ex:
        print(f"media cache: could not keep {object_name} ({ex!r})")
        return None


def remove(object_name):
    p = path_for(object_name) if object_name else None
    if p and os.path.exists(p):
        try:
            os.unlink(p)
        except OSError:
            pass


def prune(keep=None):
    """Remove the least recently used files until the cache is within MAX_BYTES (never `keep`)."""
    try:
        files = [os.path.join(DIR, f) for f in os.listdir(DIR) if not f.endswith(".part")]
        files.sort(key=lambda p: os.path.getmtime(p))
        total = sum(os.path.getsize(p) for p in files)
        for p in files:
            if total <= MAX_BYTES:
                break
            if p == keep:
                continue
            total -= os.path.getsize(p)
            os.unlink(p)
    except Exception:
        pass
