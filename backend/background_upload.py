"""
background_upload.py -- send a video's files to cloud storage after the request has returned.

A recording (or an upload) is kept on this PC (media_cache.py) and its database entry is marked
"uploading" until every file is in storage. The analysis reads the local copy, so nobody has to wait for
the upload. If the server stops half way, resume_pending() sends the rest when it starts again.
"""
import os
import threading

import media_cache
from database import client, database_name
from minio_client import BUCKET, minio_client


def _send(video_id, files):
    videos = client[database_name]["videos"]
    try:
        for object_name, path in files:
            minio_client.fput_object(BUCKET, object_name, path, content_type="video/mp4",
                                     part_size=16 * 1024 * 1024, num_parallel_uploads=4)
        videos.update_one({"_id": video_id}, {"$set": {"uploading": False}})
        for _, path in files:                  # a temp file the cache could not take is not needed any more
            if os.path.dirname(os.path.abspath(path)) != os.path.abspath(media_cache.DIR) and os.path.exists(path):
                os.unlink(path)
    except Exception as ex:                    # tried again when the server next starts
        print(f"video {video_id}: upload to storage failed ({ex!r}); it stays on this PC and is retried")


def send(video_id, files):
    """files: [(object name, local path)]. Returns at once; the upload runs in a background thread."""
    threading.Thread(target=_send, args=(video_id, files), daemon=True).start()


def resume_pending():
    """Server start: send videos whose upload was interrupted (they are still in the local cache)."""
    try:
        for doc in client[database_name]["videos"].find({"uploading": True}):
            files = [(doc[k], media_cache.get(doc[k])) for k in ("object_name", "object_name_right") if doc.get(k)]
            if files and all(p for _, p in files):
                send(doc["_id"], files)
            else:
                print(f"video {doc['_id']}: was not fully uploaded and its local copy is gone")
    except Exception as ex:
        print(f"could not check for unsent videos: {ex!r}")
