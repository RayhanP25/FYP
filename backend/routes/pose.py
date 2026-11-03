from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from database import client, database_name
from minio_client import BUCKET, minio_client
from access import can_access_analysis, can_access_video
from routes.users import get_current_user
from routes.edits import apply_to as apply_keypoint_edits
from pose_estimator import process_video_with_overlays, POSE_MIN_CONF, POSE_SURE_CONF
from bson import ObjectId
import functools
import background_upload
import calibration_store
import media_cache
import progress
from concurrent.futures import ThreadPoolExecutor
import os
import tempfile
import uuid
from datetime import datetime

router = APIRouter()

# calibration.npz lives in backend/ ; this file is backend/routes/pose.py
CALIB_PATH = os.path.join(os.path.dirname(__file__), "..", "calibration.npz")


STAGES = ["Getting the video", "Preparing the camera views", "Finding body points", "Building the 3D skeleton",
          "Drawing the skeleton", "Saving the results"]


def _local_copy(bucket, object_name):
    """(path, is_temp): the local copy of a stored video, downloaded from cloud storage if this PC has none."""
    cached = media_cache.get(object_name)
    if cached:
        return cached, False
    response = minio_client.get_object(bucket, object_name)
    total = int(response.headers.get("Content-Length") or 0)
    progress.stage("Getting the video", total=total)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
        for chunk in response.stream(amt=1024 * 1024):
            tmp_file.write(chunk)
            progress.add(len(chunk))
    return tmp_file.name, True


def _upload_results(files):
    """Upload the result videos [(object name, path)] to storage in parallel, with progress in bytes."""
    files = [(n, p) for n, p in files if p and os.path.exists(p)]
    progress.stage("Saving the results", total=sum(os.path.getsize(p) for _, p in files))
    key = progress.current()

    def send(item):
        name, path = item
        with open(path, "rb") as f:
            minio_client.put_object(bucket_name=BUCKET, object_name=name, data=progress.CountingReader(f, key),
                                    length=os.path.getsize(path), part_size=10 * 1024 * 1024, content_type="video/mp4")
        return name
    done = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for (name, path), fut in [(f, pool.submit(send, f)) for f in files]:
            try:
                done[name] = fut.result()
            except Exception as ex:
                print(f"upload of {name} failed: {ex!r}")
    return done


def _holding_uploads(fn):
    """Recordings waiting to upload in the background pause while this runs (functools.wraps keeps the
    parameters FastAPI reads)."""
    @functools.wraps(fn)
    def run(*args, **kwargs):
        with background_upload.hold():
            return fn(*args, **kwargs)
    return run


@router.post("/process-video/{video_id}")
@_holding_uploads
def process_video(
    video_id: str,
    force: bool = False,                      # set ?force=true to re-process
    calibration_id: Optional[str] = None,     # stereo: analyse with this saved calibration (kept for next time)
    current_user: dict = Depends(get_current_user),
):
    """
    Synchronously process a video: download from MinIO, run pose estimation,
    save processed video to MinIO, and update video metadata.

    Side-by-side stereo recordings (layout == "side_by_side") are routed through
    triangulation to produce 3D keypoints when calibration.npz is present.

    Pass ?force=true to re-run processing on a clip that was already processed.
    """
    # 1. Verify video exists and belongs to user
    videos_collection = client[database_name]["videos"]
    try:
        video_doc = videos_collection.find_one({"_id": ObjectId(video_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    if not video_doc or not can_access_video(current_user, video_doc):
        raise HTTPException(status_code=404, detail="Video not found or access denied")

    # 2. Skip only if already processed AND not forcing a re-run
    if video_doc.get("processed_object_name") and not force:
        return {"status": "already_processed", "processed_object_name": video_doc["processed_object_name"]}

    # A calibration picked on the page replaces the one the recording was filmed with.
    picked_calibration = None
    if calibration_id:
        picked_calibration = (calibration_store.col.find_one({"_id": ObjectId(calibration_id)}, {"npz": 0})
                              if ObjectId.is_valid(calibration_id) else None)
        if not picked_calibration:
            raise HTTPException(status_code=404, detail="Calibration not found")

    # 3. The video file(s): the copy on this PC when there is one, else downloaded from cloud storage.
    #    Progress for the page: GET /api/progress/analysis-<video_id>.
    progress.start(f"analysis-{video_id}", STAGES)
    temp_inputs = []                           # downloaded copies, deleted at the end (cached ones are kept)
    temp_input_right_path = None
    try:
        temp_input_path, is_temp = _local_copy(video_doc["bucket_name"], video_doc["object_name"])
        if is_temp:
            temp_inputs.append(temp_input_path)
        if video_doc.get("object_name_right"):
            temp_input_right_path, is_temp = _local_copy(video_doc["bucket_name"], video_doc["object_name_right"])
            if is_temp:
                temp_inputs.append(temp_input_right_path)
    except Exception as e:
        for q in temp_inputs:
            os.unlink(q)
        progress.finish(error=str(e))
        raise HTTPException(status_code=500, detail=f"Could not get the video: {str(e)}")

    # 4. Process. Stereo recordings -> triangulation (3D); everything else -> normal 2D.
    is_stereo = (video_doc.get("layout") == "side_by_side"
                 or video_doc.get("source") == "stereo_camera")
    temp_output_right_path = None
    plain_paths = ()                          # stereo: both camera views without a skeleton drawn
    # The calibration the recording was filmed with (falls back to the active one, calibration.npz).
    calib_path, calib_is_temp, calib_doc = CALIB_PATH, False, None
    if is_stereo:
        try:
            calib_path, calib_is_temp, calib_doc = calibration_store.file_for(
                calibration_id or video_doc.get("calibration_id"))
        except Exception as ex:
            print(f"calibration library unavailable, using calibration.npz: {ex!r}")
    try:
        temp_output_path = tempfile.mktemp(suffix="_processed.mp4")
        if is_stereo and os.path.exists(calib_path):
            from stereo_process import process_stereo_video
            temp_output_right_path = tempfile.mktemp(suffix="_processed_right.mp4")
            plain_paths = (tempfile.mktemp(suffix="_plain_L.mp4"), tempfile.mktemp(suffix="_plain_R.mp4"))
            result = process_stereo_video(temp_input_path, temp_output_path,
                                          calib_path=calib_path,
                                          output_path_right=temp_output_right_path,
                                          plain_paths=plain_paths,
                                          input_path_right=temp_input_right_path)
        else:
            # If it's stereo but calibration is missing, fall back to 2D so it
            # still works (analyses the left half is not split here -- whole frame).
            # Healing is required with ViTPose: unlike MediaPipe's VIDEO running
            # mode it has no frame-to-frame tracker, so occluded joints must be
            # gated and interpolated temporally here instead.
            progress.stage("Finding body points")
            result = process_video_with_overlays(temp_input_path, temp_output_path, apply_healing=True)
    except Exception as e:
        progress.finish(error=str(e))
        for q in temp_inputs:
            os.unlink(q)
        if os.path.exists(temp_output_path):
            os.unlink(temp_output_path)
        if temp_output_right_path and os.path.exists(temp_output_right_path):
            os.unlink(temp_output_right_path)
        for p in plain_paths:
            if os.path.exists(p):
                os.unlink(p)
        raise HTTPException(status_code=500, detail=f"Pose estimation failed: {str(e)}")
    finally:
        if calib_is_temp and os.path.exists(calib_path):
            os.unlink(calib_path)

    # 5. Delete downloaded input copies (local cached copies stay for next time)
    for q in temp_inputs:
        os.unlink(q)

    # 6-7. Upload the result videos to storage, all at once (new names each run so the browser can't cache
    #      an old one): the overlay of each view, and both views without a skeleton (stereo) so the analysis
    #      page can draw the raw or the processed keypoints over them itself.
    processed_object_name = f"processed_{uuid.uuid4()}.mp4"
    uploads = [(processed_object_name, temp_output_path)]
    processed_object_name_right = None
    if temp_output_right_path and os.path.exists(temp_output_right_path):
        processed_object_name_right = f"processed_right_{uuid.uuid4()}.mp4"
        uploads.append((processed_object_name_right, temp_output_right_path))
    plain_keys = {}
    for key, path in zip(("plain_object_name", "plain_object_name_right"), plain_paths):
        name = f"{key.replace('_object_name', '')}_{uuid.uuid4()}.mp4"
        plain_keys[name] = key
        uploads.append((name, path))
    # The page plays them from this PC at once (GET /api/media/...); cloud storage gets them in the background.
    progress.stage("Saving the results")
    kept = [(n, media_cache.put(n, p, move=True)) for n, p in uploads if p and os.path.exists(p)]
    results_uploading = all(c for _, c in kept)
    if results_uploading:
        sent = {n for n, _ in kept}
    else:                                       # no local copies possible: upload now, as before
        sent = set(_upload_results(uploads))
    for _, path in uploads:
        if path and os.path.exists(path):
            os.unlink(path)
    if processed_object_name not in sent:
        progress.finish(error="upload failed")
        raise HTTPException(status_code=500, detail="Failed to upload processed video")
    if processed_object_name_right not in sent:
        processed_object_name_right = None
    plain_names = {plain_keys[n]: n for n in plain_keys if n in sent}   # missing: the page uses the overlays

    # 8. Update video metadata with processed video info
    update_fields = {"processed_object_name": processed_object_name, **plain_names,
                     "results_uploading": results_uploading}
    if processed_object_name_right:
        update_fields["processed_object_name_right"] = processed_object_name_right
    if picked_calibration and is_stereo:          # later re-analyses and keypoint edits use it too
        update_fields["calibration_id"] = str(picked_calibration["_id"])
        update_fields["calibration_setup"] = picked_calibration.get("setup")
    videos_collection.update_one({"_id": ObjectId(video_id)}, {"$set": update_fields})
    if results_uploading:
        background_upload.send(ObjectId(video_id), kept, "results_uploading")

    # How the page should draw keypoints itself (same rules as the overlay videos).
    result["overlay_conf"] = {"min": POSE_MIN_CONF, "sure": POSE_SURE_CONF}

    # 9. Store keypoint analysis in MongoDB (stereo result also carries frames_3d)
    analysis_collection = client[database_name]["pose_analysis"]
    analysis_doc = {
        "video_id": video_id,
        "user_id": video_doc["user_id"],
        "status": "completed",
        "result": result,
        "created_at": datetime.now()
    }
    
    # Delete any edited keypoints cause re-analysing vids would remove them
    client[database_name]["keypoint_edits"].delete_many({"video_id": video_id})

    if is_stereo and "frames_3d" in result:
        if calib_doc is None:
            try:
                calib_doc = calibration_store.active()
            except Exception:
                calib_doc = None
        if calib_doc:
            analysis_doc["calibration_id"] = str(calib_doc["_id"])
            analysis_doc["calibration_setup"] = calib_doc.get("setup")
    existing_analysis = analysis_collection.find_one({"video_id": video_id})
    if existing_analysis:
        analysis_collection.update_one({"_id": existing_analysis["_id"]}, {"$set": analysis_doc})
    else:
        analysis_collection.insert_one(analysis_doc)

    progress.finish()
    return {
        "status": "completed",
        "mode": result.get("mode", "2d"),
        "processed_object_name": processed_object_name,
        "total_frames": result["total_frames"],
        "fps": result["fps"],
        "has_3d": "frames_3d" in result,
        "healing_report": result.get("healing_report"),
        "stereo_report": result.get("stereo_report"),
        "timing": result.get("timing"),
    }


@router.get("/get-analysis/{video_id}")
async def get_analysis(video_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve pose analysis results for a video."""
    analysis_collection = client[database_name]["pose_analysis"]
    analysis = analysis_collection.find_one({"video_id": video_id})
    if not analysis or not can_access_analysis(current_user, analysis):
        raise HTTPException(status_code=404, detail="No analysis found for this video")
    analysis["_id"] = str(analysis["_id"])
    try:                                        # manual keypoint corrections (routes/edits.py)
        analysis["result"] = apply_keypoint_edits(analysis, analysis.get("result"))
    except Exception as ex:                     # show the analysis even if the edits can't be applied
        print(f"keypoint edits not applied for {video_id}: {ex!r}")
    return analysis
