import os
import threading
import time
import cv2
import numpy as np
import math
from mmpose.apis import init_model, inference_topdown
from mmdet.apis import DetInferencer

import video_io

_HERE = os.path.dirname(os.path.abspath(__file__))
_POSE_CONFIG = os.path.join(_HERE, "models", "vitpose_base_512_v2.py")
_POSE_CKPT   = os.path.join(_HERE, "models", "best_coco_AP_epoch_24.pth")


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

POSE_MIN_CONF = float(os.environ.get("POSE_MIN_CONF", "0.3"))
POSE_SURE_CONF = float(os.environ.get("POSE_SURE_CONF", "0.7"))
# Re-run the person detector every N frames; the box is reused between runs.
DET_EVERY = int(os.environ.get("POSE_DET_EVERY", "10"))
# Frames per GPU pass. 1 = the original one-frame-at-a-time path (mmpose inference_topdown).
POSE_BATCH = int(os.environ.get("POSE_BATCH", "16"))
# Half precision on the GPU: faster, but check accuracy first (backend/bench_pose.py).
POSE_FP16 = os.environ.get("POSE_FP16", "0") == "1"
# GPU fast paths (pose_gpu.py); each can be turned off in .env to compare.
POSE_GPU_DECODE = os.environ.get("POSE_GPU_DECODE", "1") == "1"      # heatmap decoding on the GPU
POSE_FLIP_BATCH = os.environ.get("POSE_FLIP_BATCH", "1") == "1"      # flip pass in the same batch
POSE_FAST_DET = os.environ.get("POSE_FAST_DET", "0") == "1"          # RTMDet without DetInferencer (no measured gain)
POSE_PREFETCH = os.environ.get("POSE_PREFETCH", "1") == "1"          # read video ahead in a thread
POSE_CHANNELS_LAST = os.environ.get("POSE_CHANNELS_LAST", "0") == "1"  # no measured gain
# Flip test = run every crop twice (mirrored too) and average: ~1.4x slower, but turning it off moved
# keypoints by 0.6 px median / 6 px max in bench_speed.py, so it stays on unless you choose speed.
POSE_FLIP_TEST = os.environ.get("POSE_FLIP_TEST", "1") == "1"
# RTMDet keeps every box above 0.001 (thousands, 80 classes) and runs NMS on all of them: ~75 ms per
# image. We only use the best person above 0.3 (_person_box), and greedy NMS never lets a box below
# 0.3 suppress one above it, so dropping those first returns the same box much faster. 0 = default.
DET_SCORE_THR = float(os.environ.get("POSE_DET_SCORE_THR", "0.3"))
_direct_det = None
_pose_model = None
_detector = None
_pipeline = None
_lock = threading.Lock()          # the detector and one-time setup are not thread-safe


def _load_models():
    """Load ViTPose + person detector once (heavy); reused across requests."""
    global _pose_model, _detector
    if _pose_model is None:
        if _DEVICE.startswith("cuda"):
            import torch
            torch.backends.cudnn.benchmark = True      # fixed-size crops -> pick the fastest kernels once
            print(f"pose: running on GPU {torch.cuda.get_device_name(0)}")
        else:
            print("pose: WARNING running on CPU -- PyTorch in this environment cannot see CUDA")
        _pose_model = init_model(_POSE_CONFIG, _POSE_CKPT, device=_DEVICE)
        _pose_model.test_cfg["flip_test"] = POSE_FLIP_TEST
        _detector = DetInferencer(model="rtmdet_tiny_8xb32-300e_coco",
                                  device=_DEVICE, show_progress=False)
        tune_detector(DET_SCORE_THR)
        if _DEVICE.startswith("cuda"):
            _setup_gpu_paths()


def tune_detector(score_thr):
    """Set RTMDet's pre-NMS score threshold (see DET_SCORE_THR). Returns the previous settings."""
    cfg = getattr(getattr(_detector.model, "bbox_head", None), "test_cfg", None)
    if cfg is None:
        return None
    old = dict(score_thr=cfg.get("score_thr"), nms_pre=cfg.get("nms_pre"))
    if score_thr > 0:
        cfg["score_thr"] = max(float(old["score_thr"] or 0), score_thr)
        cfg["nms_pre"] = min(int(old["nms_pre"] or 1000), 1000)
    return old


def _setup_gpu_paths():
    global _direct_det
    import pose_gpu
    pose_gpu.FLIP_BATCH_ON = POSE_FLIP_BATCH
    if POSE_GPU_DECODE:
        pose_gpu.install_gpu_decoder(_pose_model)
    if POSE_CHANNELS_LAST:
        pose_gpu.set_channels_last(_pose_model, True)
    if POSE_FAST_DET:
        try:
            _direct_det = pose_gpu.DirectDetector(_detector)
        except Exception as e:
            print(f"pose: direct detector unavailable ({e!r}); using DetInferencer")
            _direct_det = None


def _detect_person(frame_bgr):
    """Return one xyxy person box; fall back to the full frame if none found."""
    o = _detector(frame_bgr, return_datasamples=True, no_save_vis=True)["predictions"][0].pred_instances
    return _person_box(o, frame_bgr)


def _detect_people(frames):
    """Batched _detect_person: one detector pass for several frames."""
    global _direct_det
    if _direct_det is not None and POSE_FAST_DET:
        try:
            boxes = [_person_box(p.pred_instances, f) for p, f in zip(_direct_det(frames), frames)]
            if not _direct_det.checked:          # first use: must give the same boxes as DetInferencer
                _direct_det.checked = True
                ref = _detect_person(frames[0])
                d = float(np.abs(np.asarray(boxes[0]) - np.asarray(ref)).max())
                if d > 2.0:
                    print(f"pose: WARNING direct detector box differs by {d:.1f} px -- using DetInferencer")
                    _direct_det = None
                    return [_detect_person(f) for f in frames]
                print(f"pose: direct detector matches DetInferencer (max box difference {d:.2f} px)")
            return boxes
        except Exception as e:
            print(f"pose: direct detector failed ({e!r}); using DetInferencer")
            _direct_det = None
    if len(frames) == 1:
        return [_detect_person(frames[0])]
    preds = _detector(list(frames), batch_size=len(frames), return_datasamples=True,
                      no_save_vis=True)["predictions"]
    return [_person_box(p.pred_instances, f) for p, f in zip(preds, frames)]


def _person_box(o, frame_bgr):
    b = o.bboxes.cpu().numpy(); s = o.scores.cpu().numpy(); l = o.labels.cpu().numpy()
    m = (l == 0) & (s > 0.3)                       # class 0 = person
    if not m.any():
        h, w = frame_bgr.shape[:2]
        return np.array([[0, 0, w, h]], dtype=float)
    b = b[m]; s = s[m]
    x1, y1, x2, y2 = b[s.argmax()]                 # highest-confidence person
    bw, bh = x2 - x1, y2 - y1
    return np.array([[max(0, x1 - 0.1 * bw), max(0, y1 - 0.1 * bh),
                      x2 + 0.1 * bw, y2 + 0.1 * bh]], dtype=float)


def _pose_pipeline():
    """mmpose's test pipeline (crop + resize around the box), built once instead of every frame."""
    global _pipeline
    with _lock:
        return _build_pipeline()


def _build_pipeline():
    global _pipeline
    if _pipeline is None:
        from mmengine.dataset import Compose
        from mmengine.registry import init_default_scope
        init_default_scope(_pose_model.cfg.get("default_scope", "mmpose"))
        _pipeline = Compose(_pose_model.cfg.test_dataloader.dataset.pipeline)
    return _pipeline


_fp16_hooked = False


def _ensure_fp16_hook():
    """Heatmaps back to float32 before decoding (the decoder's OpenCV blur has no float16).
    Harmless in float32 runs, so it is never removed."""
    global _fp16_hooked
    with _lock:
        _add_fp16_hook()


def _add_fp16_hook():
    global _fp16_hooked
    if not _fp16_hooked:
        import torch
        _pose_model.head.register_forward_hook(lambda m, i, o: o.float() if torch.is_tensor(o) else o)
        _fp16_hooked = True


def _pose_batch(frames, boxes):
    """ViTPose on several (frame, box) pairs in one GPU pass. Same steps as
    mmpose.apis.inference_topdown (pipeline -> pseudo_collate -> test_step), just batched."""
    import torch
    from mmengine.dataset import pseudo_collate
    pipe = _pose_pipeline()
    data = []
    for f, b in zip(frames, boxes):
        info = dict(img=f, bbox=np.asarray(b, np.float32).reshape(1, 4), bbox_score=np.ones(1, np.float32))
        info.update(_pose_model.dataset_meta)
        data.append(pipe(info))
    batch = pseudo_collate(data)
    step = _pose_model.test_step
    if _DEVICE.startswith("cuda") and POSE_FLIP_BATCH:
        import pose_gpu
        step = lambda b: pose_gpu.fast_test_step(_pose_model, b)
    with torch.no_grad():
        if POSE_FP16 and _DEVICE.startswith("cuda"):
            _ensure_fp16_hook()
            with torch.autocast("cuda", dtype=torch.float16):
                return step(batch)
        return step(batch)


def _capture_fps(cap, default=30.0):
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0.0 or not np.isfinite(fps):
        return default
    return fps


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

    angle_confidence = min(conf1, conf2, conf3)
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

def draw_keypoints_on_frame(frame, keypoints, color_line=(0, 255, 0), color_pt=(0, 0, 255),
                            color_unsure=(0, 215, 255)):
    """Sure joints (conf >= POSE_SURE_CONF): red points, green lines.
    Uncertain / probably occluded joints (POSE_MIN_CONF <= conf < POSE_SURE_CONF):
    yellow, thinner -- shown instead of hidden. Below POSE_MIN_CONF: not drawn."""
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
                if start_conf >= POSE_MIN_CONF and end_conf >= POSE_MIN_CONF:
                    sure = start_conf >= POSE_SURE_CONF and end_conf >= POSE_SURE_CONF
                    start_pos = (int(start_x * width), int(start_y * height))
                    end_pos = (int(end_x * width), int(end_y * height))
                    cv2.line(frame, start_pos, end_pos, color_line if sure else color_unsure, 2 if sure else 1)
    for kp in keypoints:
        if len(kp) >= 3:
            x, y, conf = kp
            if conf >= POSE_MIN_CONF:
                pos = (int(x * width), int(y * height))
                if conf >= POSE_SURE_CONF:
                    cv2.circle(frame, pos, 4, color_pt, -1)
                else:
                    cv2.circle(frame, pos, 4, color_unsure, 1)     # hollow = uncertain
    return frame


def _run_inference(video_path: str) -> dict:
    """Run ViTPose per frame; returns the SAME structure MediaPipe did:
       18 keypoints as [x, y, conf], x/y normalised 0-1, project keypoint order."""
    _load_models()

    cap = video_io.VideoReader(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Preserve the source FPS when possible; fall back to 30 for broken headers.
    fps = _capture_fps(cap)
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_data = []
    last_box = None
    det_time = 0.0
    det_runs = 0
    pose_time = 0.0
    batch = max(1, POSE_BATCH)

    def to_18(r):
        kp = r.keypoints[0]                          # (18, 2) pixels
        sc = r.keypoint_scores[0]                    # (18,)
        return [[float(kp[i, 0]) / video_width, float(kp[i, 1]) / video_height, float(sc[i])]
                for i in range(18)]

    def read_chunk():
        chunk = []
        while len(chunk) < batch:
            success, frame = cap.read()             # BGR frame
            if not success:
                break
            chunk.append(frame)
        return chunk

    if POSE_PREFETCH:
        import queue
        q = queue.Queue(maxsize=2)

        def reader():
            while True:
                c = read_chunk()
                q.put(c)
                if len(c) < batch:
                    break
        threading.Thread(target=reader, daemon=True).start()
        next_chunk = q.get
    else:
        next_chunk = read_chunk

    while True:
        chunk = next_chunk()
        if not chunk:
            break
        start = len(frame_data)

        # person boxes: detector every DET_EVERY frames (batched), box reused in between
        det_k = [k for k in range(len(chunk)) if (last_box is None and k == 0) or (start + k) % DET_EVERY == 0]
        found = {}
        if det_k:
            t_det = time.perf_counter()
            with _lock:
                try:
                    found = dict(zip(det_k, _detect_people([chunk[k] for k in det_k])))
                except Exception:
                    found = {k: _detect_person(chunk[k]) for k in det_k}
            det_time += time.perf_counter() - t_det
            det_runs += len(det_k)
        boxes = []
        for k in range(len(chunk)):
            if k in found:
                last_box = found[k]
            boxes.append(last_box)

        # pose
        t_pose = time.perf_counter()
        results = [None] * len(chunk)
        if batch > 1:
            try:
                results = [to_18(r.pred_instances) for r in _pose_batch(chunk, boxes)]
            except Exception as e:
                print(f"pose: batched inference failed ({e!r}); using one frame at a time for this chunk")
                results = [None] * len(chunk)
        for k in range(len(chunk)):
            if results[k] is None:
                try:
                    r = inference_topdown(_pose_model, chunk[k], boxes[k], bbox_format="xyxy")[0]
                    results[k] = to_18(r.pred_instances)
                except Exception:
                    results[k] = None
        pose_time += time.perf_counter() - t_pose

        for k, custom_18 in enumerate(results):
            frame_data.append({
                "frame_index": start + k,
                "keypoints": custom_18,
                "angles": calculate_frame_angles(custom_18) if custom_18 else {}
            })
        if len(chunk) < batch:
            break
    frame_idx = len(frame_data)

    cap.release()
    return {
        "fps": fps,
        "total_frames": frame_idx,
        "video_width": video_width,
        "video_height": video_height,
        "frames": frame_data,
        "timing": {
            "detection_seconds": round(det_time, 2),
            "pose_seconds": round(pose_time, 2),
            "detections_run": det_runs,
            "det_every": DET_EVERY,
            "batch": max(1, POSE_BATCH),
            "fp16": bool(POSE_FP16 and _DEVICE.startswith("cuda")),
            "device": _DEVICE,
        },
    }


def _overlay_confidences(frames):
    scores = np.zeros((len(frames), 18), dtype=float)
    for i, fr in enumerate(frames):
        if fr.get("keypoints"):
            for j, kp in enumerate(fr["keypoints"][:18]):
                if kp and len(kp) >= 3:
                    scores[i, j] = kp[2]
    if not len(frames):
        return scores
    padded = np.pad(scores, ((2, 2), (0, 0)), mode="edge")
    filtered = np.stack([np.median(padded[i:i + 5], axis=0)
                         for i in range(len(frames))])
    visible = np.zeros(18, dtype=bool)
    sure = np.zeros(18, dtype=bool)
    displayed = np.zeros_like(scores)
    for i, row in enumerate(filtered):
        visible = np.where(visible, row >= POSE_MIN_CONF - 0.05,
                           row >= POSE_MIN_CONF + 0.05)
        sure = visible & np.where(sure, row >= POSE_SURE_CONF - 0.05,
                                  row >= POSE_SURE_CONF + 0.05)
        displayed[i, visible] = POSE_MIN_CONF
        displayed[i, sure] = POSE_SURE_CONF
    return displayed


def _render_overlay(video_path: str, frames: list, output_path: str, fps: float = None,
                    stabilize_confidence: bool = False):
    cap = video_io.VideoReader(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    if fps is None:
        fps = _capture_fps(cap)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Browser-playable H.264: NVENC on the GPU when available, else CPU (see video_io.py).
    out = video_io.open_writer(output_path, w, h, fps)

    display_scores = _overlay_confidences(frames) if stabilize_confidence else None
    idx = 0
    while True:
        success, frame = cap.read()
        if not success:
            break
        kp = frames[idx]["keypoints"] if idx < len(frames) else None
        if kp is not None and display_scores is not None and idx < len(display_scores):
            kp = [[p[0], p[1], display_scores[idx, j] if p[2] > 0 else 0.0]
                  for j, p in enumerate(kp)]
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
    t_start = time.perf_counter()
    raw_result = _run_inference(video_path)

    if raw_output_path:
        _render_overlay(video_path, raw_result["frames"], raw_output_path, fps=raw_result["fps"])

    if not apply_healing:
        t_ov = time.perf_counter()
        _render_overlay(video_path, raw_result["frames"], output_path, fps=raw_result["fps"])
        raw_result["timing"]["overlay_seconds"] = round(time.perf_counter() - t_ov, 2)
        raw_result["timing"]["healing_seconds"] = 0.0
        raw_result["timing"]["total_seconds"] = round(time.perf_counter() - t_start, 2)
        return raw_result

    healed_result = heal_and_render(raw_result, video_path, output_path, {**UPLOAD_HEAL, **(heal_kwargs or {})})
    healed_result["timing"]["total_seconds"] = round(time.perf_counter() - t_start, 2)
    return healed_result


# Clean-up for single-camera uploads (stereo recordings use pose_postprocess's own defaults). Gentler than
# those: only points under 30% confidence are dropped (the overlay already hides them), gaps of up to 8 frames
# are filled, and a 5-frame window smooths. On fast movement the stricter settings drew joints several % of the
# frame off (straight-line fills through the motion, smoothing lag); these keep the model's own positions.
UPLOAD_HEAL = dict(
    conf_threshold=float(os.environ.get("POSE_2D_HEAL_CONF", "0.3")),
    max_gap=int(os.environ.get("POSE_2D_HEAL_MAX_GAP", "8")),
    window_length=int(os.environ.get("POSE_2D_HEAL_WINDOW", "5")),
)


def heal_and_render(raw_result: dict, video_path: str, output_path: str, heal_kwargs: dict = None,
                    raw_keypoints: list = None, render: bool = True) -> dict:
    """Heal + smooth the raw keypoints, keep the raw ones alongside, and render the overlay video.
    raw_keypoints: per-frame keypoints to store as "keypoints_raw" (default: raw_result's own), so the
    untouched model output stays available for comparison even when the caller edited raw_result
    (stereo swap fixing does)."""
    t_heal = time.perf_counter()
    from pose_postprocess import heal_and_smooth
    kwargs = {"healed_confidence": 0.6}
    if heal_kwargs:
        kwargs.update(heal_kwargs)
    healed_result = heal_and_smooth(raw_result, **kwargs)
    heal_time = time.perf_counter() - t_heal

    raw_frames = raw_result["frames"]
    for i, fr in enumerate(healed_result["frames"]):
        src = raw_frames[i] if i < len(raw_frames) else {}
        kp_raw = raw_keypoints[i] if raw_keypoints is not None and i < len(raw_keypoints) else src.get("keypoints")
        fr["keypoints_raw"] = kp_raw
        # Angles of the untouched detections (raw_result's own angles may already include caller fixes).
        fr["angles_raw"] = (calculate_frame_angles(kp_raw) if kp_raw else {}) if raw_keypoints is not None \
            else src.get("angles", {})

    healed_result["timing"] = dict(healed_result.get("timing", {}))
    healed_result["timing"]["healing_seconds"] = round(heal_time, 2)
    if render:          # stereo renders later, after the 3D refinement has filled hidden joints
        t_ov = time.perf_counter()
        _render_overlay(video_path, healed_result["frames"], output_path, fps=raw_result["fps"],
                        stabilize_confidence=True)
        healed_result["timing"]["overlay_seconds"] = round(time.perf_counter() - t_ov, 2)
    return healed_result
