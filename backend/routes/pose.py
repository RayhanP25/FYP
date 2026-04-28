from fastapi import APIRouter, Depends, HTTPException
from database import client, database_name
from minio_client import minio_client
from routes.users import get_current_user
from pose_estimator import process_video_with_overlays
from bson import ObjectId
import os
import tempfile
import uuid
from datetime import datetime

router = APIRouter()

@router.post("/process-video/{video_id}")
async def process_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """
    Synchronously process a video: download from MinIO, run pose estimation with overlays,
    save processed video to MinIO, and update video metadata.
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
    if video_doc.get("processed_object_name"):
        return {"status": "already_processed", "processed_object_name": video_doc["processed_object_name"]}
    
    # 3. Download video from MinIO to a temporary file
    try:
        response = minio_client.get_object(video_doc["bucket_name"], video_doc["object_name"])
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
            for chunk in response.stream(amt=1024*1024):
                tmp_file.write(chunk)
            temp_input_path = tmp_file.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")
    
    # 4. Process video with overlays
    try:
        temp_output_path = tempfile.mktemp(suffix="_processed.mp4")
        result = process_video_with_overlays(temp_input_path, temp_output_path)
    except Exception as e:
        # Clean up temp files
        os.unlink(temp_input_path)
        if os.path.exists(temp_output_path):
            os.unlink(temp_output_path)
        raise HTTPException(status_code=500, detail=f"Pose estimation failed: {str(e)}")
    
    # 5. Delete input temp file
    os.unlink(temp_input_path)
    
    # 6. Upload processed video to MinIO
    try:
        processed_object_name = f"processed_{uuid.uuid4()}.mp4"
        with open(temp_output_path, 'rb') as f:
            minio_client.put_object(
                bucket_name="sport-pose-videos",
                object_name=processed_object_name,
                data=f,
                length=-1,
                part_size=10*1024*1024,
                content_type="video/mp4"
            )
    except Exception as e:
        os.unlink(temp_output_path)
        raise HTTPException(status_code=500, detail=f"Failed to upload processed video: {str(e)}")
    
    # 7. Delete output temp file
    os.unlink(temp_output_path)
    
    # 8. Update video metadata with processed video info
    videos_collection.update_one(
        {"_id": ObjectId(video_id)},
        {"$set": {"processed_object_name": processed_object_name}}
    )

    # 9. Store keypoint analysis in MongoDB
    analysis_collection = client[database_name]["pose_analysis"]
    analysis_doc = {
        "video_id": video_id,
        "user_id": str(current_user["_id"]),
        "status": "completed",
        "result": result,  # contains fps, total_frames, frames with keypoints
        "created_at": datetime.now()
    }
    existing_analysis = analysis_collection.find_one({"video_id": video_id})
    if existing_analysis:
        analysis_collection.update_one({"_id": existing_analysis["_id"]}, {"$set": analysis_doc})
    else:
        analysis_collection.insert_one(analysis_doc)

    return {
        "status": "completed",
        "processed_object_name": processed_object_name,
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
