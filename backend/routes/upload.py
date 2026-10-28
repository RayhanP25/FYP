from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Cookie
from minio_client import minio_client
from datetime import timedelta, datetime
from database import client, database_name
from bson import ObjectId
from pydantic import BaseModel
import uuid
from routes.users import get_current_user
from access import can_access_owner, can_access_video, names, visible_owner_ids

# from database.minio_config import minio_client

router = APIRouter()

class OwnerUpdate(BaseModel):
    owner_id: str

class NameUpdate(BaseModel):
    original_filename: str

@router.post("/upload-video")
async def upload_video(video: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    # Validate file type
    allowed_extensions = {"mp4", "mov", "avi"}
    file_ext = video.filename.split(".")[-1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file format. Allowed formats: {', '.join(allowed_extensions)}"
        )
    
    # Validate file size (100mb)
    max_size = 100 * 1024 * 1024
    if video.size and video.size > max_size:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is {max_size}"
        )
    
    # Generate unique filename
    object_name = f"{uuid.uuid4()}.{file_ext}"
    
    # Upload to MinIO
    try:
        minio_client.put_object(
            bucket_name="sport-pose-videos",
            object_name=object_name,
            data=video.file,
            length=-1,
            part_size=10*1024*1024,
            content_type=video.content_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Save metadata to MongoDB
    videos_collection = client[database_name]["videos"]
    
    video_doc = {
        "user_id": str(current_user["_id"]),
        "object_name": object_name,
        "bucket_name": "sport-pose-videos",
        "original_filename": video.filename,
        "content_type": video.content_type,
        "file_size": video.size,
        "uploaded_at": datetime.now()
    }
    
    result = videos_collection.insert_one(video_doc)
    video_doc["_id"] = result.inserted_id
    
    return {"object_name": object_name, "video_id": str(video_doc["_id"])}

@router.get("/get-video/{video_id}")
async def get_video(video_id: str, view: str = "left", variant: str = "overlay",
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
    try:
        presigned_url = minio_client.presigned_get_object(
            bucket_name=video_doc["bucket_name"],
            object_name=object_name,
            expires=timedelta(hours=1) 
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
    name = body.original_filename.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Video name cannot be empty")
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
        raise HTTPException(status_code=500, detail=f"Failed to delete video from storage: {str(e)}")

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