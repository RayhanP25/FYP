from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Cookie
from minio_client import BUCKET, minio_client
from datetime import timedelta, datetime
from database import client, database_name
from bson import ObjectId
from pydantic import BaseModel
import os
import tempfile
import uuid
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import background_upload
import media_cache
import progress
import video_io

MAX_UPLOAD_MB = 100
from urllib.parse import quote
from routes.users import get_current_user
from access import can_access_owner, can_access_video, names, visible_owner_ids

# from database.minio_config import minio_client

router = APIRouter()

class OwnerUpdate(BaseModel):
    owner_id: str

class NameUpdate(BaseModel):
    original_filename: str

@router.post("/upload-video")
async def upload_video(video: UploadFile = File(...), job: str = None, current_user: dict = Depends(get_current_user)):
    # Validate file type
    allowed_extensions = {"mp4", "mov", "avi"}
    file_ext = video.filename.split(".")[-1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file format. Allowed formats: {', '.join(allowed_extensions)}"
        )
    
    # Validate file size
    max_size = MAX_UPLOAD_MB * 1024 * 1024
    too_big = HTTPException(status_code=400, detail=f"This video is too large. The limit is {MAX_UPLOAD_MB} MB.")
    if video.size and video.size > max_size:
        raise too_big
    if job:                                   # the page polls GET /api/progress/<job>
        progress.start(job, ["Converting the video"])
    
    # Every upload is stored as a browser-ready H.264 MP4: MOV and AVI files (and MP4s in other codecs,
    # e.g. iPhone HEVC) don't play in Chrome / Edge, so they are converted here first.
    tmp_dir = tempfile.mkdtemp(prefix="upload_")
    src = os.path.join(tmp_dir, f"in.{file_ext}")
    dst = os.path.join(tmp_dir, "out.mp4")
    try:
        received = 0
        with open(src, "wb") as f:
            while chunk := await video.read(8 * 1024 * 1024):
                received += len(chunk)
                if received > max_size:
                    raise too_big
                f.write(chunk)
        progress.stage("Converting the video", key=job)
        try:
            converted = await run_in_threadpool(video_io.to_browser_mp4, src, dst)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        path = dst if converted else src
        object_name = f"{uuid.uuid4()}.mp4"
        stored_name = os.path.splitext(video.filename)[0] + ".mp4"
        stored_size = os.path.getsize(path)
        # Kept on this PC (the analysis reads it from here) and sent to cloud storage in the background.
        local = media_cache.put(object_name, path, move=True)
        if local is None:                      # no local copy possible: upload now, before answering
            try:
                minio_client.fput_object(BUCKET, object_name, path, content_type="video/mp4",
                                         part_size=10 * 1024 * 1024)
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
    except HTTPException as e:
        progress.finish(job, error=str(e.detail))
        raise
    finally:
        for p in (src, dst):
            if os.path.exists(p):
                os.unlink(p)
        os.rmdir(tmp_dir)
    
    # Save metadata to MongoDB
    videos_collection = client[database_name]["videos"]
    
    video_doc = {
        "user_id": str(current_user["_id"]),
        "object_name": object_name,
        "bucket_name": BUCKET,
        "original_filename": stored_name,
        "content_type": "video/mp4",
        "file_size": stored_size,
        "uploaded_from": video.filename if stored_name != video.filename else None,
        "recorded_by": str(current_user["_id"]),   # who added it; user_id (the owner) can change later
        "uploading": local is not None,
        "uploaded_at": datetime.now()
    }
    
    result = videos_collection.insert_one(video_doc)
    video_doc["_id"] = result.inserted_id
    if local is not None:
        background_upload.send(result.inserted_id, [(object_name, local)])
    progress.finish(job)
    
    return {"object_name": object_name, "video_id": str(video_doc["_id"])}

def _people(ids):
    """{user id: (full name, role)}; ids of deleted accounts map to ("Deleted user", None)."""
    valid = {i for i in ids if i and ObjectId.is_valid(i)}
    found = {str(u["_id"]): (u.get("full_name"), u.get("role"))
             for u in client[database_name]["users"].find({"_id": {"$in": [ObjectId(i) for i in valid]}},
                                                          {"full_name": 1, "role": 1})}
    return {i: found.get(i, ("Deleted user", None)) for i in valid}


def _recorded_by(video_doc, people=None):
    """Who recorded or uploaded the video, and their role. Older videos have no recorded_by: their owner then."""
    who = video_doc.get("recorded_by") or video_doc.get("user_id")
    name, role = (people if people is not None else _people([who])).get(who, (None, None))
    return {"recorded_by_id": who, "recorded_by_name": name, "recorded_by_role": role,
            "recorded_by_known": bool(video_doc.get("recorded_by"))}


@router.get("/get-video/{video_id}")
async def get_video(video_id: str, view: str = "left", variant: str = "overlay", download: bool = False,
                    current_user: dict = Depends(get_current_user)):
    """variant="plain": the camera view without a skeleton drawn (the analysis page draws raw or processed
    keypoints over it). Falls back to the overlay video when there is no plain one (older analyses)."""
    # Find video metadata in MongoDB
    videos_collection = client[database_name]["videos"]
    
    try:
        video_doc = videos_collection.find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    
    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Verify user ownership (admin can access any video)
    if not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=403, detail="Access denied: You don't own this video")
    
    # Use processed video if available, otherwise use original.
    # Stereo clips also have a right-view overlay the user can switch to.
    right_object_name = video_doc.get("processed_object_name_right")
    if not video_doc.get("processed_object_name") and video_doc.get("object_name_right"):
        right_object_name = video_doc["object_name_right"]     # not analysed yet: the right camera's own file
    if view == "right" and right_object_name:
        object_name = right_object_name
    else:
        object_name = video_doc.get("processed_object_name") or video_doc["object_name"]
    plain = None
    if variant == "plain" and video_doc.get("processed_object_name"):
        is_stereo = video_doc.get("layout") == "side_by_side" or video_doc.get("source") == "stereo_camera"
        if is_stereo:
            plain = video_doc.get("plain_object_name_right" if view == "right" else "plain_object_name")
        elif view != "right":
            plain = video_doc["object_name"]          # a 2D analysis ran on the upload itself
        object_name = plain or object_name
    
    # Generate presigned URL from MinIO
    headers = None
    if download:
        base = video_doc.get("original_filename") or video_doc.get("object_name", "video")
        stem, dot, ext = base.rpartition(".")
        if not dot or not ext.isalnum() or len(ext) > 4:
            stem, ext = base, video_doc["object_name"].rpartition(".")[2] or "mp4"
        camera = "right" if view == "right" and right_object_name else "left"
        name = f"{stem}-{camera}{'-no-skeleton' if plain else ''}.{ext}"
        headers = {"response-content-disposition": f"attachment; filename*=UTF-8''{quote(name)}"}
    try:
        presigned_url = minio_client.presigned_get_object(
            bucket_name=video_doc["bucket_name"],
            object_name=object_name,
            expires=timedelta(hours=1),
            response_headers=headers,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate video URL: {str(e)}")
    
    return {
        "video_id": video_id,
        "presigned_url": presigned_url,
        "original_filename": video_doc.get("original_filename")
            or video_doc.get("filename")
            or video_doc.get("object_name", "Untitled video"),
        "content_type": video_doc.get("content_type", "video/mp4"),
        "uploaded_at": video_doc.get("uploaded_at") or video_doc.get("created_at"),
        "owner_id": video_doc["user_id"],
        "owner_name": names([video_doc["user_id"]]).get(video_doc["user_id"]),
        **_recorded_by(video_doc),
        "uploading": bool(video_doc.get("uploading")),
        "source": video_doc.get("source", "upload"),
        "is_processed": bool(video_doc.get("processed_object_name")),
        "view": "right" if (view == "right" and right_object_name) else "left",
        "variant": "plain" if plain else "overlay",
        "has_right_view": bool(right_object_name)
    }

@router.get("/my-videos")
async def get_my_videos(current_user: dict = Depends(get_current_user)):
    videos_collection = client[database_name]["videos"]
    owners = visible_owner_ids(current_user)
    videos = list(videos_collection.find({"user_id": {"$in": owners}} if owners is not None else {}))
    ids = [str(v["_id"]) for v in videos]
    user_names = names([v["user_id"] for v in videos])
    people = _people([v.get("recorded_by") or v["user_id"] for v in videos])

    # Convert ObjectId to string and format response.
    # Use .get() with fallbacks so a document missing a field (e.g. a camera
    # recording) can never crash the whole list.
    analysis_modes = {
        a["video_id"]: (a.get("result") or {}).get("mode")
        for a in client[database_name]["pose_analysis"].find(
            {"video_id": {"$in": ids}}, {"video_id": 1, "result.mode": 1})
    }

    result = []
    for video in videos:
        vid = str(video["_id"])
        has_right = bool(video.get("processed_object_name_right"))
        result.append({
            "has_analysis": vid in analysis_modes,
            "is_stereo": analysis_modes.get(vid) == "stereo_3d" or has_right,
            "has_right_view": has_right,
            "video_id": str(video["_id"]),
            "original_filename": video.get("original_filename")
                or video.get("filename")
                or video.get("object_name", "Untitled video"),
            "content_type": video.get("content_type", "video/mp4"),
            "file_size": video.get("file_size", 0),
            "uploaded_at": video.get("uploaded_at") or video.get("created_at"),
            "source": video.get("source", "upload"),
            "owner_id": video["user_id"],
            "owner_name": user_names.get(video["user_id"]),
            **_recorded_by(video, people),
        })

    return {"videos": result}

@router.put("/videos/{video_id}/owner")
async def set_video_owner(video_id: str, body: OwnerUpdate, current_user: dict = Depends(get_current_user)):
    try:
        video_doc = client[database_name]["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")
    if current_user.get("role") == "athlete" or not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=403, detail="Access denied: You can't move this video")
    if not ObjectId.is_valid(body.owner_id) or not client[database_name]["users"].find_one({"_id": ObjectId(body.owner_id)}):
        raise HTTPException(status_code=404, detail="User not found")
    if not can_access_owner(current_user, body.owner_id):
        raise HTTPException(status_code=403, detail="You can only move videos to yourself or your athletes.")
    client[database_name]["videos"].update_one({"_id": video_doc["_id"]}, {"$set": {"user_id": body.owner_id}})
    client[database_name]["pose_analysis"].update_many({"video_id": video_id}, {"$set": {"user_id": body.owner_id}})
    return {"video_id": video_id, "owner_id": body.owner_id}

@router.patch("/videos/{video_id}/name")
async def rename_video(video_id: str, body: NameUpdate, current_user: dict = Depends(get_current_user)):
    try:
        video_doc = client[database_name]["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")
    if not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=403, detail="Access denied: You don't own this video")
    ext = video_doc["object_name"].rpartition(".")[2]
    stem = body.original_filename.strip()
    if stem.lower().endswith(f".{ext.lower()}"):
        stem = stem[:-len(ext) - 1].strip()
    if not stem:
        raise HTTPException(status_code=400, detail="Video name cannot be empty")
    name = f"{stem}.{ext}"
    client[database_name]["videos"].update_one({"_id": video_doc["_id"]}, {"$set": {"original_filename": name}})
    return {"video_id": video_id, "original_filename": name}

@router.delete("/delete-video/{video_id}")
async def delete_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a video from MinIO storage and MongoDB metadata."""
    videos_collection = client[database_name]["videos"]
    analysis_collection = client[database_name]["pose_analysis"]

    # Find video metadata in MongoDB
    try:
        video_doc = videos_collection.find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")

    # Verify user ownership (admin can delete any video)
    if not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=403, detail="Access denied: You don't own this video")

    # Delete from MinIO (both original and processed if exists)
    try:
        minio_client.remove_object(
            bucket_name=video_doc["bucket_name"],
            object_name=video_doc["object_name"]
        )
    except Exception as e:
        if not video_doc.get("uploading"):     # still uploading: it may not be in storage yet
            raise HTTPException(status_code=500, detail=f"Failed to delete video from storage: {str(e)}")
    for key in ("object_name", "object_name_right"):
        media_cache.remove(video_doc.get(key))
    if video_doc.get("object_name_right"):
        try:
            minio_client.remove_object(bucket_name=video_doc["bucket_name"], object_name=video_doc["object_name_right"])
        except Exception:
            pass

    # Delete processed videos if they exist
    for key in ("processed_object_name", "processed_object_name_right", "plain_object_name", "plain_object_name_right"):
        if video_doc.get(key):
            try:
                minio_client.remove_object(
                    bucket_name=video_doc["bucket_name"],
                    object_name=video_doc[key]
                )
            except Exception:
                pass  # Ignore if processed video doesn't exist

    # Delete from MongoDB
    try:
        videos_collection.delete_one({"_id": ObjectId(video_id)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete video metadata: {str(e)}")

    # Delete associated pose analysis if exists
    try:
        analysis_collection.delete_one({"video_id": video_id})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete associated pose analysis: {str(e)}")

    return {"message": "Video deleted successfully"}

def _stored_copy(bucket, object_name):
    """(path, is_temp): this PC's copy of a stored video, downloaded if there is none."""
    cached = media_cache.get(object_name)
    if cached:
        return cached, False
    response = minio_client.get_object(bucket, object_name)
    total = int(response.headers.get("Content-Length") or 0)
    progress.stage("Getting the video", total=total)
    fd, tmp = tempfile.mkstemp(suffix=".mp4")
    with os.fdopen(fd, "wb") as f:
        for chunk in response.stream(amt=1024 * 1024):
            f.write(chunk)
            progress.add(len(chunk))
    return tmp, True


def _crop_half(src, right):
    """One camera of an older side-by-side recording, at its full size."""
    import subprocess
    import cv2
    cap = cv2.VideoCapture(src)
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    half = W // 2
    w = (W - half if right else half) // 2 * 2
    enc = video_io.pick_encoder(w, H) or "libx264"
    fd, dst = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    cmd = [video_io.ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", "-i", src,
           "-vf", f"crop={w}:{H - H % 2}:{half if right else 0}:0", "-an", "-c:v", enc, *video_io._ENCODERS[enc],
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst]
    if subprocess.run(cmd, capture_output=True).returncode != 0:
        raise HTTPException(status_code=500, detail="Could not cut out that camera's view.")
    return dst


@router.get("/download-video/{video_id}")
def download_full_size(video_id: str, view: str = "left", skeleton: bool = False, job: str = None,
                       current_user: dict = Depends(get_current_user)):
    """A camera's video at the size it was recorded (2560 x 1440 for the 2K cameras), with or without the
    skeleton drawn. The analysis page's own videos are smaller (1280 wide) so they load and play quickly."""
    from pose_estimator import _render_overlay
    from routes.edits import apply_to as apply_keypoint_edits
    try:
        video_doc = client[database_name]["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    if not video_doc or not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=404, detail="Video not found")
    if job:
        progress.start(job, ["Getting the video", "Drawing the skeleton"])
    right = view == "right"
    temps = []
    try:
        if video_doc.get("object_name_right"):                     # recorded as two files
            src, tmp = _stored_copy(video_doc["bucket_name"], video_doc["object_name_right" if right else "object_name"])
            temps += [src] if tmp else []
        else:
            src, tmp = _stored_copy(video_doc["bucket_name"], video_doc["object_name"])
            temps += [src] if tmp else []
            if video_doc.get("layout") == "side_by_side":           # older recordings: both cameras in one file
                progress.stage("Getting the video")
                src = _crop_half(src, right)
                temps.append(src)
        out = src
        if skeleton:
            analysis = client[database_name]["pose_analysis"].find_one({"video_id": video_id})
            if not analysis:
                raise HTTPException(status_code=404, detail="This video has not been analysed yet.")
            result = apply_keypoint_edits(analysis, analysis.get("result")) or {}
            frames = result.get("frames_right") if right else result.get("frames")
            if not frames:
                raise HTTPException(status_code=404, detail="No skeleton for that camera.")
            fd, out = tempfile.mkstemp(suffix=".mp4")
            os.close(fd)
            temps.append(out)
            progress.stage("Drawing the skeleton", total=len(frames))
            _render_overlay(src, frames, out, fps=result.get("fps") or video_doc.get("fps"), stabilize_confidence=True)
    except HTTPException as e:
        progress.finish(job, error=str(e.detail))
        for t in temps:
            os.unlink(t)
        raise
    except Exception as e:
        progress.finish(job, error=str(e))
        for t in temps:
            os.unlink(t)
        raise HTTPException(status_code=500, detail=f"Could not prepare the download: {e}")
    progress.finish(job)
    stem = (video_doc.get("original_filename") or "video").rpartition(".")[0] or "video"
    camera = "-right" if right else ("-left" if video_doc.get("source") == "stereo_camera" else "")
    name = f"{stem}{camera}{'' if skeleton else '-no-skeleton'}.mp4"

    def cleanup():
        for t in temps:
            if os.path.exists(t):
                os.unlink(t)
    return FileResponse(out, media_type="video/mp4", filename=name, background=BackgroundTask(cleanup))
