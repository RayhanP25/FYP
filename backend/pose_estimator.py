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
    if not p1 or not p2 or not p3 or len(p1) < 3 or len(p2) < 3 or len(p3) < 3:
        return {"angle": None, "confidence": 0.0}

    x1, y1, conf1 = p1
    x2, y2, conf2 = p2
    x3, y3, conf3 = p3

    v1 = [x1 - x2, y1 - y2]
    v2 = [x3 - x2, y3 - y2]

    dot_product = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2)

    if mag1 == 0 or mag2 == 0:
        return {"angle": None, "confidence": 0.0}

    cos_angle = dot_product / (mag1 * mag2)
    cos_angle = max(-1.0, min(1.0, cos_angle))
    angle_rad = math.acos(cos_angle)
    angle_deg = math.degrees(angle_rad)

    angle_confidence = conf1 * conf2 * conf3
    return {"angle": angle_deg, "confidence": angle_confidence}

def detect_facing_direction(keypoints: list) -> str:
    if len(keypoints) < 4:
        return 'right'
    left_shoulder_x = keypoints[2][0]
    right_shoulder_x = keypoints[3][0]
    if left_shoulder_x < right_shoulder_x:
        return 'right'
    else:
        return 'left'

def normalize_keypoints(keypoints: list, facing: str) -> list:
    if facing == 'right' or not keypoints:
        return keypoints
    normalized = []
    for kp in keypoints:
        if len(kp) >= 3:
            normalized.append([-kp[0], kp[1], kp[2]])  # Flip X
        else:
            normalized.append(kp)
    return normalized

def calculate_frame_angles(keypoints: list) -> dict:
    if not keypoints:
        return {}
    angles = {}
    facing = detect_facing_direction(keypoints)
    normalized_kp = normalize_keypoints(keypoints, facing)

    def to_anatomical(angle_data):
        if angle_data["angle"] is not None:
            angle_data["angle"] = 180 - angle_data["angle"]
        return angle_data

    if len(normalized_kp) > 14:
        angles["left_knee"] = to_anatomical(calculate_angle(normalized_kp[10], normalized_kp[12], normalized_kp[14]))
    if len(normalized_kp) > 15:
        angles["right_knee"] = to_anatomical(calculate_angle(normalized_kp[11], normalized_kp[13], normalized_kp[15]))
    if len(normalized_kp) > 12:
        angles["left_hip"] = to_anatomical(calculate_angle(normalized_kp[2], normalized_kp[10], normalized_kp[12]))
    if len(normalized_kp) > 13:
        angles["right_hip"] = to_anatomical(calculate_angle(normalized_kp[3], normalized_kp[11], normalized_kp[13]))
    if len(normalized_kp) > 6:
        angles["left_elbow"] = to_anatomical(calculate_angle(normalized_kp[2], normalized_kp[4], normalized_kp[6]))
    if len(normalized_kp) > 7:
        angles["right_elbow"] = to_anatomical(calculate_angle(normalized_kp[3], normalized_kp[5], normalized_kp[7]))
    if len(normalized_kp) > 8:
        angles["left_wrist"] = to_anatomical(calculate_angle(normalized_kp[4], normalized_kp[6], normalized_kp[8]))
    if len(normalized_kp) > 9:
        angles["right_wrist"] = to_anatomical(calculate_angle(normalized_kp[5], normalized_kp[7], normalized_kp[9]))
    if len(normalized_kp) > 4:
        angles["left_shoulder"] = to_anatomical(calculate_angle(normalized_kp[1], normalized_kp[2], normalized_kp[4]))
    if len(normalized_kp) > 5:
        angles["right_shoulder"] = to_anatomical(calculate_angle(normalized_kp[1], normalized_kp[3], normalized_kp[5]))
    # NOTE: indices 16/17 are the foot/toe index from MediaPipe (31/32), not the heel.
    if len(normalized_kp) > 16:
        angles["left_ankle"] = to_anatomical(calculate_angle(normalized_kp[12], normalized_kp[14], normalized_kp[16]))
    if len(normalized_kp) > 17:
        angles["right_ankle"] = to_anatomical(calculate_angle(normalized_kp[13], normalized_kp[15], normalized_kp[17]))
    return angles

def draw_keypoints_on_frame(frame, keypoints, color_line=(0, 255, 0), color_pt=(0, 0, 255)):
    """Draw keypoints and skeleton on a frame using OpenCV."""
    if keypoints is None:
        return frame
    height, width = frame.shape[:2]
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
                    cv2.line(frame, start_pos, end_pos, color_line, 2)
    for kp in keypoints:
        if len(kp) >= 3:
            x, y, conf = kp
            if conf > 0.5:
                pos = (int(x * width), int(y * height))
                cv2.circle(frame, pos, 4, color_pt, -1)
    return frame


# Mapping from MediaPipe 33 landmarks to custom 18-keypoint indices
_MP_MAPPING = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32]


def _run_inference(video_path: str) -> dict:
    """PASS 1 — run MediaPipe over the whole video and collect RAW keypoints.
    No drawing here. Returns the raw result dict."""
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

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_idx = 0
    frame_data = []

    while True:
        success, frame = cap.read()
        if not success:
            break
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = int(frame_idx * (1000 / fps))
        detection_result = detector.detect_for_video(mp_image, timestamp_ms)

        if detection_result.pose_landmarks:
            landmarks = detection_result.pose_landmarks[0]
            kp = [[lm.x, lm.y, lm.presence] for lm in landmarks]
            neck = [(kp[11][0] + kp[12][0]) / 2.0,
                    (kp[11][1] + kp[12][1]) / 2.0,
                    min(kp[11][2], kp[12][2])]
            custom_18 = [kp[0], neck] + [kp[i] for i in _MP_MAPPING[1:]]
        else:
            custom_18 = None

        frame_data.append({
            "frame_index": frame_idx,
            "keypoints": custom_18,
            "angles": calculate_frame_angles(custom_18) if custom_18 else {}
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


def _render_overlay(video_path: str, frames: list, output_path: str):
    """PASS 2 — re-read the source video and draw the given keypoints
    (raw or healed) onto each frame, writing a browser-friendly H.264 file."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    idx = 0
    while True:
        success, frame = cap.read()
        if not success:
            break
        kp = frames[idx]["keypoints"] if idx < len(frames) else None
        frame = draw_keypoints_on_frame(frame, kp)
        out.write(frame)
        idx += 1

    cap.release()
    out.release()


def process_video_with_overlays(
    video_path: str,
    output_path: str,
    raw_output_path: str = None,
    apply_healing: bool = True,
    heal_kwargs: dict = None,
) -> dict:
    """
    Full pipeline:
      Pass 1  -> MediaPipe inference (raw keypoints + angles)
      Heal    -> temporal occlusion recovery + One-Euro smoothing
      Pass 2  -> draw HEALED skeleton onto the video (output_path)

    Args:
        output_path     : where the HEALED overlay video is written
        raw_output_path : optional; if given, also writes the RAW (unsmoothed)
                          overlay video here, for before/after comparison
        apply_healing   : set False to reproduce the old raw-only behaviour
        heal_kwargs     : optional dict forwarded to heal_and_smooth(), e.g.
                          {"beta": 0.6, "max_gap": 12}

    Returns the (healed) result dict, including a 'healing_report'.
    """
    raw_result = _run_inference(video_path)

    # optional: write the raw overlay first (the "before" video)
    if raw_output_path:
        _render_overlay(video_path, raw_result["frames"], raw_output_path)

    if not apply_healing:
        _render_overlay(video_path, raw_result["frames"], output_path)
        return raw_result

    from pose_postprocess import heal_and_smooth
    kwargs = {"healed_confidence": 0.6}          # >0.5 so healed joints render
    if heal_kwargs:
        kwargs.update(heal_kwargs)
    healed_result = heal_and_smooth(raw_result, **kwargs)

    # attach the RAW (pre-healing) angles to each frame so the frontend
    # can plot a before/after comparison from a single analysis document
    for i, fr in enumerate(healed_result["frames"]):
        if i < len(raw_result["frames"]):
            fr["angles_raw"] = raw_result["frames"][i].get("angles", {})
        else:
            fr["angles_raw"] = {}

    # write the healed overlay (the "after" video)
    _render_overlay(video_path, healed_result["frames"], output_path)
    return healed_result
