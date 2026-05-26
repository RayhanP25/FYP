import asyncio
import logging

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

try:
    from camera_system.manager import StereoCameraManager
    from camera_system.web_camera import WebCamera
except ImportError:
    from ..camera_system.manager import StereoCameraManager
    from ..camera_system.web_camera import WebCamera

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/camera", tags=["Camera Integration"])

camera_manager = StereoCameraManager()


def _encode_frame(frame: np.ndarray):
    ret, buffer = cv2.imencode(".jpg", frame)
    if ret:
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
        )


def _generate_single_frames(camera: WebCamera):
    while camera.is_open:
        frame = camera.get_frame()
        if frame is None:
            continue
        yield from _encode_frame(frame)


def _generate_stereo_frames():
    while camera_manager.left and camera_manager.right:
        if not camera_manager.left.is_open or not camera_manager.right.is_open:
            break
        left = camera_manager.left.get_frame()
        right = camera_manager.right.get_frame()
        if left is None or right is None:
            continue
        if left.shape[0] != right.shape[0]:
            right = cv2.resize(right, (left.shape[1], left.shape[0]))
        combined = np.hstack([left, right])
        yield from _encode_frame(combined)


def _require_active_cameras():
    if not camera_manager.left or not camera_manager.right:
        raise HTTPException(
            status_code=400,
            detail="Cameras are not started. Call POST /api/camera/start first.",
        )


@router.get("/status")
def camera_status():
    return camera_manager.status()


@router.get("/list")
async def list_cameras():
    """Probe indices off the event loop — probing can take several seconds."""
    return await asyncio.to_thread(StereoCameraManager.list_available)


@router.post("/start")
async def start_cameras():
    logger.info("POST /api/camera/start received")
    result = await asyncio.to_thread(camera_manager.start)
    if not result.get("started"):
        raise HTTPException(status_code=400, detail=result)
    return result


@router.post("/stop")
async def stop_cameras():
    logger.info("POST /api/camera/stop received")
    return await asyncio.to_thread(camera_manager.stop)


@router.get("/stream/left")
def stream_left():
    _require_active_cameras()
    return StreamingResponse(
        _generate_single_frames(camera_manager.left),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/stream/right")
def stream_right():
    _require_active_cameras()
    return StreamingResponse(
        _generate_single_frames(camera_manager.right),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/stream")
def stream_stereo():
    """Side-by-side MJPEG of left and right webcams."""
    _require_active_cameras()
    return StreamingResponse(
        _generate_stereo_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
