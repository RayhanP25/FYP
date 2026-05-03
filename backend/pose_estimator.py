import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import math

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

def calculate_angle(p1: list, p2: list, p3: list) -> dict:
    """
    Calculate angle between three points (p1-p2-p3).
    Returns dictionary with angle in degrees and confidence.
    """
    # Check if all points exist and have confidence
    if not p1 or not p2 or not p3 or len(p1) < 3 or len(p2) < 3 or len(p3) < 3:
        return {"angle": None, "confidence": 0.0}
    
    # Extract coordinates and confidences
    x1, y1, conf1 = p1
    x2, y2, conf2 = p2
    x3, y3, conf3 = p3
    
    # Vector from p2 to p1: v1 = p1 - p2
    # Vector from p2 to p3: v2 = p3 - p2
    v1 = [x1 - x2, y1 - y2]
    v2 = [x3 - x2, y3 - y2]
    
    # Calculate dot product and magnitudes
    dot_product = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2)
    
    # Avoid division by zero
    if mag1 == 0 or mag2 == 0:
        return {"angle": None, "confidence": 0.0}
    
    # Calculate angle in radians and convert to degrees
    cos_angle = dot_product / (mag1 * mag2)
    # Clamp to avoid numerical errors
    cos_angle = max(-1.0, min(1.0, cos_angle))
    angle_rad = math.acos(cos_angle)
    angle_deg = math.degrees(angle_rad)
    
    # Calculate confidence as product of individual confidences
    angle_confidence = conf1 * conf2 * conf3
    
    return {"angle": angle_deg, "confidence": angle_confidence}

def calculate_frame_angles(keypoints: list) -> dict:
    """
    Calculate all relevant angles for a frame.
    Returns dictionary with angle names as keys and angle/confidence as values.
    """
    if not keypoints:
        return {}
    
    angles = {}
    
    # Left knee: angle between left hip, left knee, and left ankle
    if len(keypoints) > 12:
        left_knee = calculate_angle(keypoints[8], keypoints[10], keypoints[12])
        angles["left_knee"] = left_knee
    
    # Right knee: angle between right hip, right knee, and right ankle
    if len(keypoints) > 13:
        right_knee = calculate_angle(keypoints[9], keypoints[11], keypoints[13])
        angles["right_knee"] = right_knee
    
    # Left hip: angle between left shoulder, left hip, and left knee
    if len(keypoints) > 10:
        left_hip = calculate_angle(keypoints[2], keypoints[8], keypoints[10])
        angles["left_hip"] = left_hip
    
    # Right hip: angle between right shoulder, right hip, and right knee
    if len(keypoints) > 11:
        right_hip = calculate_angle(keypoints[3], keypoints[9], keypoints[11])
        angles["right_hip"] = right_hip
    
    # Left elbow: angle between left shoulder, left elbow, and left wrist
    if len(keypoints) > 6:
        left_elbow = calculate_angle(keypoints[2], keypoints[4], keypoints[6])
        angles["left_elbow"] = left_elbow
    
    # Right elbow: angle between right shoulder, right elbow, and right wrist
    if len(keypoints) > 7:
        right_elbow = calculate_angle(keypoints[3], keypoints[5], keypoints[7])
        angles["right_elbow"] = right_elbow
    
    return angles

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

        # Store keypoint data with angles
        frame_angles = calculate_frame_angles(custom_18) if custom_18 else {}
        frame_data.append({
            "frame_index": frame_idx,
            "keypoints": custom_18,
            "angles": frame_angles
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

