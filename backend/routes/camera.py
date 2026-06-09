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


def _encode_frame_bytes(frame: np.ndarray, max_width: int = 1280) -> bytes | None:
    h, w = frame.shape[:2]
    if w > max_width:
        scale = max_width / w
        frame = cv2.resize(frame, (max_width, int(h * scale)))
    ret, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ret:
        return None
    return (
        b"--frame\r\n"
        b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
    )


async def _async_generate_single_frames(camera: WebCamera):
    """Async generator so MJPEG streaming does not block the API event loop."""
    while camera.is_open:
        frame = await asyncio.to_thread(camera.get_frame)
        if frame is None:
            await asyncio.sleep(0.02)
            continue
        chunk = await asyncio.to_thread(_encode_frame_bytes, frame)
        if chunk:
            yield chunk
        await asyncio.sleep(0.02)


async def _async_generate_stereo_frames():
    while camera_manager.left and camera_manager.right:
        if not camera_manager.left.is_open or not camera_manager.right.is_open:
            break
        left = await asyncio.to_thread(camera_manager.left.get_frame)
        right = await asyncio.to_thread(camera_manager.right.get_frame)
        if left is None or right is None:
            await asyncio.sleep(0.02)
            continue
        if left.shape[0] != right.shape[0]:
            right = cv2.resize(right, (left.shape[1], left.shape[0]))
        combined = np.hstack([left, right])
        chunk = await asyncio.to_thread(_encode_frame_bytes, combined)
        if chunk:
            yield chunk
        await asyncio.sleep(0.02)


def _require_active_cameras():
    if not camera_manager.left or not camera_manager.right:
        raise HTTPException(
            status_code=400,
            detail="Cameras are not started. Call POST /api/camera/start first.",
        )


@router.get("/status")
async def camera_status():
    return await asyncio.to_thread(camera_manager.status)


@router.get("/list")
async def list_cameras():
    """Probe indices off the event loop — probing can take several seconds."""
    return await asyncio.to_thread(StereoCameraManager.list_available)


@router.post("/start")
async def start_cameras():
    logger.info("POST /api/camera/start received")
    result = await asyncio.to_thread(camera_manager.start)
    return result


@router.post("/stop")
async def stop_cameras():
    logger.info("POST /api/camera/stop received")
    return await asyncio.to_thread(camera_manager.stop)


@router.get("/stream/left")
async def stream_left():
    _require_active_cameras()
    return StreamingResponse(
        _async_generate_single_frames(camera_manager.left),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/stream/right")
async def stream_right():
    _require_active_cameras()
    return StreamingResponse(
        _async_generate_single_frames(camera_manager.right),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/stream")
async def stream_stereo():
    """Side-by-side MJPEG of left and right webcams."""
    _require_active_cameras()
    return StreamingResponse(
        _async_generate_stereo_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
