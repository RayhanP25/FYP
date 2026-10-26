# ViTPose-B 512×384 — training pipeline

Trains ViTPose-Base (top-down, heatmap) to predict our 18 body keypoints from video frames annotated
in CVAT. This is the pipeline behind the model the SportPose backend uses.

Training uses **only your own annotated data** and the **public** ViTPose-B weights released by
OpenMMLab (trained on the public COCO dataset). No checkpoint from us is needed.

It runs in two stages, exactly as our released model was trained:

| Stage | Config | Starts from | What it does |
|---|---|---|---|
| 1 | `vitpose_base_512_v1.py` | Public COCO ViTPose-B, resized to 512×384 | Learns the 18 keypoints (new head), lr 5e-4, up to 80 epochs, sigma-3 heatmaps |
| 2 | `vitpose_base_512_v2.py` | Your stage-1 best checkpoint | Refines it: lr 1e-4, 30 epochs, sharper UDP sigma-2 heatmaps |

## Files

```
training/vitpose_v2/
├── vitpose_base_512_v1.py       stage 1 config
├── vitpose_base_512_v2.py       stage 2 config
├── metainfo_18kp.py             the 18 keypoints: names, left/right pairs, OKS sigmas
├── train.py                     runs training for a config
├── tools/fix_vitpose_ckpt.py    resizes the public checkpoint from 256×192 to 512×384
├── data/prepare_studio.py       CVAT XML + videos  →  frames + labels
├── data/yolo_to_coco.py         frames + labels    →  COCO keypoint JSON
├── data/make_clean_val_json.py  writes val_clean.json (optionally leaves recordings out)
└── requirements.txt
```

## 1. Install

Tested on Windows 11 with an RTX 4050 Laptop GPU (6 GB), Python 3.10, CUDA 12.1.

```bash
conda create -n vitpose python=3.10 -y
conda activate vitpose
pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121
pip install -U openmim
mim install mmcv==2.1.0
pip install -r requirements.txt
```

If installing `mmpose` fails while building `chumpy`, run `pip install chumpy==0.70 --no-build-isolation`
and repeat the last command.

**Run every command below from inside `training/vitpose_v2/`.** All paths in the configs are relative
to this folder, so it can live anywhere on disk.

## 2. Where everything goes

You create two folders: `studio_dataset/` (your data) and `checkpoints/` (filled in step 4).
Everything else is created by the scripts.

```
training/vitpose_v2/
├── studio_dataset/                          ← YOUR DATA (you create this)
│   ├── annotations/
│   │   ├── train/
│   │   │   ├── <recording_1>/
│   │   │   │   ├── Camera_L.xml             CVAT export for Camera_L.mp4
│   │   │   │   └── Camera_R.xml             CVAT export for Camera_R.mp4
│   │   │   ├── <recording_2>/ …
│   │   │   └── …
│   │   └── val/
│   │       └── <recording_n>/Camera_L.xml, Camera_R.xml
│   └── videos/                              same tree as annotations/
│       ├── train/
│       │   ├── <recording_1>/Camera_L.mp4, Camera_R.mp4
│       │   └── …
│       └── val/
│           └── <recording_n>/Camera_L.mp4, Camera_R.mp4
│
├── checkpoints/                             ← you create this (step 4)
│   ├── td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314.pth            public, downloaded
│   ├── td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314_512x384.pth    resized, used by stage 1
│   └── vitpose_base512_v1_best.pth                                                  your stage-1 best, used by stage 2
│
├── datasets/studio_yolo/{images,labels}/{train,val}/   created by step 5
├── coco/train.json, val.json, val_clean.json           created by step 5 (read by both configs)
└── runs/                                               created by training
```

Rules for `studio_dataset/`:
- **Train / validation are chosen by folder.** Put whole recordings in `val/`, never single frames,
  so no validation footage is seen in training. 1–3 recordings in `val/` is enough.
- **Annotation and video must match by name:** `annotations/<subset>/<recording>/Camera_X.xml` ↔
  `videos/<subset>/<recording>/Camera_X.mp4` (`.mp4`, `.mov` or `.avi`). `X` can be any camera name;
  upper/lower case does not matter.
- Recording folder names are free (we used `split_16`, `split_17`, …).
- Any video resolution and frame rate works; frames are extracted at full resolution.

## 3. Annotation format (CVAT)

- Task type: video, one **skeleton** label with **18 points**. Each point's label must start with its
  index: `0_Nose, 1_Neck, 2_L_Shoulder, 3_R_Shoulder, 4_L_Elbow, 5_R_Elbow, 6_L_Wrist, 7_R_Wrist,
  8_L_Finger, 9_R_Finger, 10_L_Hip, 11_R_Hip, 12_L_Knee, 13_R_Knee, 14_L_Ankle, 15_R_Ankle,
  16_L_Toe, 17_R_Toe`. The text after the number is free; the number decides the keypoint.
  "Left" and "right" are the **person's** left and right.
- Export each camera's job with **Export annotations → "CVAT for video 1.1"** and save it as
  `studio_dataset/annotations/<subset>/<recording>/Camera_X.xml`.
- Only frames annotated by hand (CVAT **keyframes**) are used; frames CVAT interpolates in between are
  ignored. Annotating every 5th frame worked well for us. If a whole track is annotated on every frame,
  every 5th frame is used.
- Mark hidden joints as **occluded** and joints outside the picture as **outside**
  (they become COCO visibility 1 and 0; visible joints are 2).
- **One person per video.** All tracks of a frame are merged into one skeleton.

## 4. Get the public starting weights

```bash
mkdir checkpoints
mim download mmpose --config td-hm_ViTPose-base_8xb64-210e_coco-256x192 --dest checkpoints
python tools/fix_vitpose_ckpt.py --src checkpoints/td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314.pth --in-h 512 --in-w 384
```

`mim download` saves OpenMMLab's public ViTPose-B (COCO, 256×192) into `checkpoints/`.
`fix_vitpose_ckpt.py` resizes its position embedding to the 512×384 input and writes
`checkpoints/td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314_512x384.pth`, which is the file
`load_from` in `vitpose_base_512_v1.py` points to.

## 5. Prepare the data

```bash
python data/prepare_studio.py
python data/yolo_to_coco.py --datasets datasets/studio_yolo --split train --out coco/train.json
python data/yolo_to_coco.py --datasets datasets/studio_yolo --split val --out coco/val.json
python data/make_clean_val_json.py
```

1. `prepare_studio.py` reads `studio_dataset/` and writes the hand-annotated frames as JPGs plus labels
   to `datasets/studio_yolo/{images,labels}/{train,val}`. The person box is the keypoint extent + 8%.
   (Use `--studio <path>` if your `studio_dataset` is somewhere else.)
2. `yolo_to_coco.py` writes `coco/train.json` and `coco/val.json` (COCO keypoint format, absolute image
   paths, so do not move `datasets/` afterwards — rerun steps 5.1–5.2 if you do).
3. `make_clean_val_json.py` writes `coco/val_clean.json`, the validation file both configs use.
   Add `--exclude <recording> …` to leave whole recordings out of validation.

Both configs read exactly these two files: `coco/train.json` and `coco/val_clean.json`.

## 6. Stage 1 — train from the public weights

```bash
python train.py --config vitpose_base_512_v1.py --work-dir runs/v1
```

Validates every 5 epochs and keeps the best checkpoint by COCO AP as
`runs/v1/best_coco_AP_epoch_N.pth`. Stops early after 6 validations (30 epochs) without improvement.
Our run: best at epoch 10, stopped at epoch 40.

## 7. Stage 2 — refine the stage-1 model

Copy your stage-1 best to the file name the stage-2 config loads, then train:

```bash
copy runs\v1\best_coco_AP_epoch_N.pth checkpoints\vitpose_base512_v1_best.pth
python train.py --config vitpose_base_512_v2.py --work-dir runs/v2
```

(`N` is the epoch number in the file name; on Linux/macOS use `cp runs/v1/... checkpoints/...`.)

Validates every 2 epochs; the final model is `runs/v2/best_coco_AP_epoch_N.pth`.
Our run: best COCO AP 0.9682 at epoch 24, ~1 h 50 min on an RTX 4050 Laptop.

GPU memory: batch 12 uses ~4.6 GB. If you run out of memory, lower `BATCH` near the top of both configs.

## 8. Use the trained model in SportPose

Copy `runs/v2/best_coco_AP_epoch_N.pth` to `backend/models/` and set `_POSE_CKPT` in
`backend/pose_estimator.py` to its file name. The keypoints and input size must stay the same as here.

## Notes

- `CocoDataset` in the configs means the COCO **annotation format** — MMPose's loader for any COCO-style
  keypoint JSON. Your data enters only through `coco/train.json` and `coco/val_clean.json`;
  `metainfo_18kp.py` replaces COCO's 17 keypoints with our 18.
- **Extra public data (optional).** Our released model also trained on 1,121 COCO-WholeBody images
  (1,477 people) converted to the same 18 keypoints, alongside 1,507 studio frames. Any dataset in the
  same 18-keypoint YOLO-pose layout (`<name>/images/train`, `<name>/labels/train`) placed under
  `datasets/` can be added in step 5:
  `python data/yolo_to_coco.py --datasets datasets/studio_yolo datasets/<name> --split train --out coco/train.json`.
  Validation should stay on your own recordings only.

### How our released model was trained

Same steps as above, with our studio recordings plus COCO-WholeBody:

| Set | Source | Images | People |
|---|---|---|---|
| Train | Studio recordings Split_16–25, split_31–35 (both cameras) | 1,507 | 1,507 |
| Train | COCO-WholeBody, converted to the 18 keypoints | 1,121 | 1,477 |
| Validation | Studio recordings split_26 (69) + split_28 (86); split_27 left out | 155 | 155 |

Versions used: Python 3.10, PyTorch 2.1.2 + CUDA 12.1, MMCV 2.1.0, MMEngine 0.10.7, MMPose 1.3.2,
MMPretrain 1.2.0.
