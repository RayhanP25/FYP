from fastapi import APIRouter, Depends, HTTPException
from database import client, database_name
from minio_client import minio_client
from routes.users import get_current_user
from pose_estimator import extract_18_keypoints
from bson import ObjectId
import os
import tempfile
from datetime import datetime

router = APIRouter()

@router.post("/process-video/{video_id}")
async def process_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """
    Synchronously process a video: download from MinIO, run pose estimation,
    store results in MongoDB.
    """
    # 1. Verify video exists and belongs to user
    videos_collection = client[database_name]["videos"]
    try:
        video_doc = videos_collection.find_one({"_id": ObjectId(video_id), "user_id": str(current_user["_id"])})
    except:
        raise HTTPException(status_code=400, detail="Invalid video ID")
    
    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found or access denied")
    
    # 2. Check if already processed
    analysis_collection = client[database_name]["pose_analysis"]
    existing = analysis_collection.find_one({"video_id": video_id})
    if existing and existing.get("status") == "completed":
        return {"status": "already_processed", "analysis_id": str(existing["_id"])}
    
    # 3. Download video from MinIO to a temporary file
    try:
        response = minio_client.get_object(video_doc["bucket_name"], video_doc["object_name"])
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
            for chunk in response.stream(amt=1024*1024):
                tmp_file.write(chunk)
            temp_path = tmp_file.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")
    
    # 4. Run pose estimation (synchronous)
    try:
        result = extract_18_keypoints(temp_path)
    except Exception as e:
        # Clean up temp file
        os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"Pose estimation failed: {str(e)}")
    
    # 5. Delete temp file
    os.unlink(temp_path)
    
    # 6. Store analysis in MongoDB
    analysis_doc = {
        "video_id": video_id,
        "user_id": str(current_user["_id"]),
        "status": "completed",
        "result": result,  # contains fps, total_frames, frames with keypoints
        "created_at": datetime.now()
    }
    if existing:
        # Update existing record
        analysis_collection.update_one({"_id": existing["_id"]}, {"$set": analysis_doc})
        analysis_id = str(existing["_id"])
    else:
        insert_result = analysis_collection.insert_one(analysis_doc)
        analysis_id = str(insert_result.inserted_id)
    
    return {
        "status": "completed",
        "analysis_id": analysis_id,
        "total_frames": result["total_frames"],
        "fps": result["fps"]
    }

@router.get("/get-analysis/{video_id}")
async def get_analysis(video_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve pose analysis results for a video."""
    analysis_collection = client[database_name]["pose_analysis"]
    analysis = analysis_collection.find_one({"video_id": video_id, "user_id": str(current_user["_id"])})
    if not analysis:
        raise HTTPException(status_code=404, detail="No analysis found for this video")
    
    # Convert ObjectId to string
    analysis["_id"] = str(analysis["_id"])
    return analysis
