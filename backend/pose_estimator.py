import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import tempfile
import os

def extract_18_keypoints(video_path: str) -> dict:
    """
    Process a video file and return 18-keypoint pose data for every frame.
    Returns: dict with 'fps', 'total_frames', and 'frames' list.
    """
    # Load the model
    model_path = 'pose_landmarker.task'
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        output_segmentation_masks=False,
        running_mode=vision.RunningMode.VIDEO
    )
    detector = vision.PoseLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_data = []
    frame_idx = 0

    # Mapping from MediaPipe 33 landmarks to custom 18-keypoint indices
    # 0: nose, 1: neck (computed), then 16 selected landmarks
    mapping = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32]

    while True:
        success, frame = cap.read()
        if not success:
            break

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Timestamp in milliseconds
        timestamp_ms = int(frame_idx * (1000 / fps))
        detection_result = detector.detect_for_video(mp_image, timestamp_ms)

        if detection_result.pose_landmarks:
            landmarks = detection_result.pose_landmarks[0]
            kp = [[lm.x, lm.y, lm.presence] for lm in landmarks]

            # Compute neck = midpoint of shoulders (indices 11 and 12)
            neck_x = (kp[11][0] + kp[12][0]) / 2.0
            neck_y = (kp[11][1] + kp[12][1]) / 2.0
            neck_conf = min(kp[11][2], kp[12][2])
            neck = [neck_x, neck_y, neck_conf]

            # Build 18 keypoints
            custom_18 = [kp[0], neck] + [kp[i] for i in mapping[1:]]
        else:
            custom_18 = None  # no person detected

        frame_data.append({
            "frame_index": frame_idx,
            "keypoints": custom_18
        })
        frame_idx += 1

    cap.release()
    detector.close()
    return {
        "fps": fps,
        "total_frames": frame_idx,
        "video_width": video_width,
        "video_height": video_height,
        "frames": frame_data
    }
