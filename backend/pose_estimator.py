import os
import cv2
import numpy as np
import math

# --- ViTPose (MMPose) engine -------------------------------------------------
# Replaces MediaPipe. Output format is unchanged: 18 keypoints [x, y, conf],
# x/y normalised 0-1, in the project's keypoint order -- so triangulation,
# angles, healing, storage and the frontend all keep working unchanged.
from mmpose.apis import init_model, inference_topdown
from mmpose.datasets.datasets.utils import parse_pose_metainfo
from mmdet.apis import DetInferencer

_HERE = os.path.dirname(os.path.abspath(__file__))
_MODEL_DIR = os.path.join(_HERE, "models")
_POSE_CONFIG = os.path.join(_MODEL_DIR, "vitpose_base_512_v2.py")
_POSE_CKPT = os.path.join(_MODEL_DIR, "best_coco_AP_epoch_24.pth")
_POSE_METAINFO = os.path.join(_MODEL_DIR, "metainfo_18kp.py")

NUM_KEYPOINTS = 18

# Re-detect the person every N frames. Keep this at 1: ViTPose is a top-down
# model, so it only sees the crop defined by this box. Reusing a stale box on a
# moving athlete crops limbs out and the keypoints land wrong -- and the person
# detector is only ~5% of the per-frame cost, so skipping it buys almost nothing.
DET_EVERY = int(os.environ.get("POSE_DET_EVERY", "1"))
# Horizontal-flip test averaging. Matches how the model was evaluated, but costs
# a second forward pass per frame. Set POSE_FLIP_TEST=0 to halve inference time.
FLIP_TEST = os.environ.get("POSE_FLIP_TEST", "1") not in ("0", "false", "False")

# Minimum score for a keypoint to be considered usable (drawing, triangulation).
# This is NOT the old MediaPipe 0.5: MediaPipe reported a `presence` logit that
# sat near 1.0 for every visible landmark, so 0.5 almost never rejected anything.
# ViTPose reports the UDP heatmap peak instead -- correctly located joints often
# score 0.2-0.4 (toes, fingers, motion blur, self-occlusion), so reusing 0.5 here
# deletes good keypoints. 0.3 is MMPose's own default visualisation threshold
# (kpt_thr) for this score type.
MIN_KEYPOINT_CONFIDENCE = float(os.environ.get("POSE_MIN_CONF", "0.3"))


def _pick_device():
    forced = os.environ.get("POSE_DEVICE")
    if forced:
        return forced
    try:
        import torch
        return "cuda:0" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


_DEVICE = _pick_device()
_pose_model = None
_detector = None


def _load_models():
    """Load ViTPose + person detector once (heavy); reused across requests."""
    global _pose_model, _detector
    if _pose_model is not None:
        return

    for path in (_POSE_CONFIG, _POSE_CKPT, _POSE_METAINFO):
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Pose model asset missing: {path}. The checkpoint is gitignored -- "
                f"copy best_coco_AP_epoch_24.pth into {_MODEL_DIR}."
            )

    model = init_model(_POSE_CONFIG, _POSE_CKPT, device=_DEVICE)

    # init_model resolves dataset_meta from the checkpoint, else from the config's
    # *train* dataloader -- which inherits plain 17-keypoint COCO from the base
    # config. That mismatch silently produces wrong flip_indices against our
    # 18-channel head, so pin the metainfo explicitly instead of trusting it.
    model.dataset_meta = parse_pose_metainfo(dict(from_file=_POSE_METAINFO))
    n = model.dataset_meta["num_keypoints"]
    if n != NUM_KEYPOINTS:
        raise RuntimeError(f"Expected {NUM_KEYPOINTS}-keypoint metainfo, got {n}.")

    model.cfg.model.test_cfg["flip_test"] = FLIP_TEST

    _pose_model = model
    _detector = DetInferencer(model="rtmdet_tiny_8xb32-300e_coco",
                              device=_DEVICE, show_progress=False)


def _detect_person(frame_bgr, last_box=None):
    """Return one xyxy person box.

    The box is passed to the pose model as-is: GetBBoxCenterScale already
    applies its own 1.25 padding, and the model was trained on unpadded boxes,
    so expanding it here would shrink the athlete relative to training crops.

    If no person is found, reuse the previous box rather than falling back to
    the whole frame -- a full 16:9 frame letterboxed into the model's 3:4 input
    leaves the athlete too small to localise.
    """
    o = _detector(frame_bgr, return_datasamples=True, no_save_vis=True)["predictions"][0].pred_instances
    b = o.bboxes.cpu().numpy(); s = o.scores.cpu().numpy(); l = o.labels.cpu().numpy()
    m = (l == 0) & (s > 0.3)                       # class 0 = person
    if not m.any():
        if last_box is not None:
            return last_box
        h, w = frame_bgr.shape[:2]
        return np.array([[0, 0, w, h]], dtype=float)
    b = b[m]; s = s[m]
    return b[s.argmax()][None].astype(float)       # highest-confidence person


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
    if not p1 or not p2 or not p3 or len(p1) < 3 or len(p2) < 3 or len(p3) < 3:
        return {"angle": None, "confidence": 0.0}

    x1, y1, conf1 = p1
    x2, y2, conf2 = p2
    x3, y3, conf3 = p3

    # A missing joint is written out as [0, 0, 0]. That is a non-empty list, so
    # the truthiness guard above lets it through -- without this check the angle
    # gets measured against the origin and reported as a real value.
    if conf1 <= 0 or conf2 <= 0 or conf3 <= 0:
        return {"angle": None, "confidence": 0.0}

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
    if len(normalized_kp) > 16:
        angles["left_ankle"] = to_anatomical(calculate_angle(normalized_kp[12], normalized_kp[14], normalized_kp[16]))
    if len(normalized_kp) > 17:
        angles["right_ankle"] = to_anatomical(calculate_angle(normalized_kp[13], normalized_kp[15], normalized_kp[17]))
    return angles

def draw_keypoints_on_frame(frame, keypoints, color_line=(0, 255, 0), color_pt=(0, 0, 255)):
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
                if (start_conf > MIN_KEYPOINT_CONFIDENCE
                        and end_conf > MIN_KEYPOINT_CONFIDENCE):
                    start_pos = (int(start_x * width), int(start_y * height))
                    end_pos = (int(end_x * width), int(end_y * height))
                    cv2.line(frame, start_pos, end_pos, color_line, 2)
    for kp in keypoints:
        if len(kp) >= 3:
            x, y, conf = kp
            if conf > MIN_KEYPOINT_CONFIDENCE:
                pos = (int(x * width), int(y * height))
                cv2.circle(frame, pos, 4, color_pt, -1)
    return frame


def _run_inference(video_path: str) -> dict:
    """Run ViTPose per frame; returns the SAME structure MediaPipe did:
       18 keypoints as [x, y, conf], x/y normalised 0-1, project keypoint order."""
    _load_models()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # STRICTLY ENFORCE 30 FPS (ignores corrupted headers completely)
    fps = 30.0
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_idx = 0
    frame_data = []
    last_box = None
    first_error = None

    while True:
        success, frame = cap.read()                 # BGR frame
        if not success:
            break

        # Normalise against the real frame, not the (sometimes wrong) header.
        h, w = frame.shape[:2]
        if frame_idx == 0:
            video_width, video_height = w, h

        if last_box is None or frame_idx % DET_EVERY == 0:
            last_box = _detect_person(frame, last_box)

        try:
            r = inference_topdown(_pose_model, frame, last_box, bbox_format="xyxy")[0].pred_instances
            kp = r.keypoints[0]                      # (18, 2) pixels
            sc = r.keypoint_scores[0]                # (18,)
            custom_18 = [[float(kp[i, 0]) / w,
                          float(kp[i, 1]) / h,
                          float(sc[i])] for i in range(NUM_KEYPOINTS)]
        except Exception as e:
            # Don't let a config/shape error masquerade as "no person detected"
            # for every single frame -- surface the first one.
            if first_error is None:
                first_error = e
                print(f"[pose_estimator] inference failed on frame {frame_idx}: {e!r}")
            custom_18 = None

        frame_data.append({
            "frame_index": frame_idx,
            "keypoints": custom_18,
            "angles": calculate_frame_angles(custom_18) if custom_18 else {}
        })
        frame_idx += 1

    cap.release()

    if frame_idx > 0 and all(f["keypoints"] is None for f in frame_data):
        raise RuntimeError(
            f"ViTPose produced no keypoints for any of the {frame_idx} frames."
        ) from first_error

    return {
        "fps": fps,
        "total_frames": frame_idx,
        "video_width": video_width,
        "video_height": video_height,
        "frames": frame_data
    }


def _render_overlay(video_path: str, frames: list, output_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # STRICTLY ENFORCE 30 FPS OUTPUT WRITER
    fps = 30.0
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
    raw_result = _run_inference(video_path)

    if raw_output_path:
        _render_overlay(video_path, raw_result["frames"], raw_output_path)

    if not apply_healing:
        _render_overlay(video_path, raw_result["frames"], output_path)
        return raw_result

    from pose_postprocess import heal_and_smooth
    kwargs = {"healed_confidence": 0.6}
    if heal_kwargs:
        kwargs.update(heal_kwargs)
    healed_result = heal_and_smooth(raw_result, **kwargs)

    for i, fr in enumerate(healed_result["frames"]):
        if i < len(raw_result["frames"]):
            fr["angles_raw"] = raw_result["frames"][i].get("angles", {})
        else:
            fr["angles_raw"] = {}

    _render_overlay(video_path, healed_result["frames"], output_path)
    return healed_result
