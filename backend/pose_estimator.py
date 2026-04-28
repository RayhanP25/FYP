import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np

# Skeleton connections for 18 keypoints
CONNECTIONS = [
    [0, 1],           # Nose to Neck
    [1, 2], [1, 3],   # Neck to Shoulders
    [2, 4], [4, 6], [6, 8],   # Left Arm
    [3, 5], [5, 7], [7, 9],   # Right Arm
    [2, 10], [3, 11],         # Shoulders to Hips
    [10, 11],                 # Pelvis
    [10, 12], [12, 14], [14, 16], # Left Leg
    [11, 13], [13, 15], [15, 17]  # Right Leg
]

def draw_keypoints_on_frame(frame, keypoints):
    """Draw keypoints and skeleton on a frame using OpenCV."""
    if keypoints is None:
        return frame

    height, width = frame.shape[:2]

    # Draw skeleton connections
    for start_idx, end_idx in CONNECTIONS:
        if start_idx < len(keypoints) and end_idx < len(keypoints):
            start_kp = keypoints[start_idx]
            end_kp = keypoints[end_idx]

            if len(start_kp) >= 3 and len(end_kp) >= 3:
                start_x, start_y, start_conf = start_kp
                end_x, end_y, end_conf = end_kp

                if start_conf > 0.5 and end_conf > 0.5:
                    start_pos = (int(start_x * width), int(start_y * height))
                    end_pos = (int(end_x * width), int(end_y * height))
                    cv2.line(frame, start_pos, end_pos, (0, 255, 0), 2)

    # Draw keypoints
    for i, kp in enumerate(keypoints):
        if len(kp) >= 3:
            x, y, conf = kp
            if conf > 0.5:
                pos = (int(x * width), int(y * height))
                cv2.circle(frame, pos, 4, (0, 0, 255), -1)

    return frame

def process_video_with_overlays(video_path: str, output_path: str) -> dict:
    """
    Process a video file, draw pose overlays on each frame, save as new video,
    and return keypoint data.
    Returns: dict with 'fps', 'total_frames', 'video_width', 'video_height', 'frames'.
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
    frame_idx = 0
    frame_data = []

    # Setup video writer with H.264 codec for browser compatibility
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (video_width, video_height))

    # Mapping from MediaPipe 33 landmarks to custom 18-keypoint indices
    mapping = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32]

    while True:
        success, frame = cap.read()
        if not success:
            break

        # Convert BGR to RGB for MediaPipe
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
            custom_18 = None

        # Store keypoint data
        frame_data.append({
            "frame_index": frame_idx,
            "keypoints": custom_18
        })

        # Draw overlays on frame
        frame_with_overlays = draw_keypoints_on_frame(frame, custom_18)
        out.write(frame_with_overlays)

        frame_idx += 1

    cap.release()
    out.release()
    detector.close()

    return {
        "fps": fps,
        "total_frames": frame_idx,
        "video_width": video_width,
        "video_height": video_height,
        "frames": frame_data
    }

