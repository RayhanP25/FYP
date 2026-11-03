"""
background_upload.py -- send a video's files to cloud storage after the request has returned.

A recording (or an upload) is kept on this PC (media_cache.py) and its database entry is marked
"uploading" until every file is in storage. The analysis reads the local copy, so nobody has to wait for
the upload. If the server stops half way, resume_pending() sends the rest when it starts again.
"""
import os
import threading
import time
from contextlib import contextmanager

import media_cache
from database import client, database_name
from minio_client import BUCKET, minio_client


_busy = 0                     # analyses running now: background uploads wait for them
_busy_lock = threading.Lock()


@contextmanager
def hold():
    """While an analysis runs, background uploads pause, so its results reach storage first instead of sharing
    the internet upload with a large recording."""
    global _busy
    with _busy_lock:
        _busy += 1
    try:
        yield
    finally:
        with _busy_lock:
            _busy -= 1


class _PausingReader:
    """A file that waits before each read while an analysis is running (at most 30 minutes)."""

    def __init__(self, f):
        self.f = f

    def read(self, n=-1):
        waited = 0.0
        while _busy and waited < 1800:
            time.sleep(0.5)
            waited += 0.5
        return self.f.read(n)


RESULT_KEYS = ("processed_object_name", "processed_object_name_right", "plain_object_name", "plain_object_name_right")


def _send(video_id, files, flag="uploading"):
    videos = client[database_name]["videos"]
    try:
        time.sleep(3)                          # an analysis started straight after saving goes first
        for object_name, path in files:
            t0 = time.time()
            with open(path, "rb") as f:
                minio_client.put_object(BUCKET, object_name, _PausingReader(f), length=os.path.getsize(path),
                                        content_type="video/mp4", part_size=16 * 1024 * 1024, num_parallel_uploads=2)
            print(f"[upload] {object_name}: {os.path.getsize(path) / 1e6:.0f} MB in {time.time() - t0:.0f}s")
        videos.update_one({"_id": video_id}, {"$set": {flag: False}})
        for _, path in files:                  # a temp file the cache could not take is not needed any more
            if os.path.dirname(os.path.abspath(path)) != os.path.abspath(media_cache.DIR) and os.path.exists(path):
                os.unlink(path)
    except Exception as ex:                    # tried again when the server next starts
        print(f"video {video_id}: upload to storage failed ({ex!r}); it stays on this PC and is retried")


def send(video_id, files, flag="uploading"):
    """files: [(object name, local path)]. Returns at once; the upload runs in a background thread, and the
    video's `flag` field ("uploading" for the recording, "results_uploading" for an analysis) is set False
    when every file is in storage."""
    threading.Thread(target=_send, args=(video_id, files, flag), daemon=True).start()


def resume_pending():
    """Server start: send videos whose upload was interrupted (they are still in the local cache)."""
    try:
        for flag, keys in (("uploading", ("object_name", "object_name_right")), ("results_uploading", RESULT_KEYS)):
            for doc in client[database_name]["videos"].find({flag: True}):
                files = [(doc[k], media_cache.get(doc[k])) for k in keys if doc.get(k)]
                if files and all(p for _, p in files):
                    send(doc["_id"], files, flag)
                else:
                    print(f"video {doc['_id']}: was not fully uploaded and its local copy is gone")
    except Exception as ex:
        print(f"could not check for unsent videos: {ex!r}")
