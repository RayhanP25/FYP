from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Cookie
from minio_client import minio_client
from datetime import timedelta, datetime
from database import client, database_name
from bson import ObjectId
import uuid
from routes.users import get_current_user

# from database.minio_config import minio_client

router = APIRouter()

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
async def get_video(video_id: str, current_user: dict = Depends(get_current_user)):
    # Find video metadata in MongoDB
    videos_collection = client[database_name]["videos"]
    
    try:
        video_doc = videos_collection.find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    
    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Verify user ownership
    if video_doc["user_id"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Access denied: You don't own this video")
    
    # Use processed video if available, otherwise use original
    object_name = video_doc.get("processed_object_name") or video_doc["object_name"]
    
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
        "is_processed": bool(video_doc.get("processed_object_name"))
    }

@router.get("/my-videos")
async def get_my_videos(current_user: dict = Depends(get_current_user)):
    # Get all videos for the current user
    videos_collection = client[database_name]["videos"]
    
    videos = list(videos_collection.find({"user_id": str(current_user["_id"])}))
    
    # Convert ObjectId to string and format response.
    # Use .get() with fallbacks so a document missing a field (e.g. a camera
    # recording) can never crash the whole list.
    result = []
    for video in videos:
        result.append({
            "video_id": str(video["_id"]),
            "original_filename": video.get("original_filename")
                or video.get("filename")
                or video.get("object_name", "Untitled video"),
            "content_type": video.get("content_type", "video/mp4"),
            "file_size": video.get("file_size", 0),
            "uploaded_at": video.get("uploaded_at") or video.get("created_at"),
            "source": video.get("source", "upload"),
        })

    return {"videos": result}

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

    # Verify user ownership
    if video_doc["user_id"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Access denied: You don't own this video")

    # Delete from MinIO (both original and processed if exists)
    try:
        minio_client.remove_object(
            bucket_name=video_doc["bucket_name"],
            object_name=video_doc["object_name"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete video from storage: {str(e)}")

    # Delete processed video if exists
    if video_doc.get("processed_object_name"):
        try:
            minio_client.remove_object(
                bucket_name=video_doc["bucket_name"],
                object_name=video_doc["processed_object_name"]
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
    except Exception:
        raise HTTPException(status_code=500, detail=f"Failed to delete associated pose analysis: {str(e)}")

    return {"message": "Video deleted successfully"}