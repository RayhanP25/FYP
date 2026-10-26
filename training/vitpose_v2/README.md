# ViTPose-B 512×384 (v2) — training pipeline

Fine-tunes ViTPose-Base on our 18-keypoint studio dataset. The resulting model
(`best_coco_AP_epoch_24.pth`) is the one the backend uses.

## Pipeline

```
CVAT annotations (per recording, per camera)
   │  data/prepare_studio.py      hand-annotated frames → images + YOLO-pose labels
   ▼
datasets/studio_yolo/{images,labels}/{train,val}
   │  data/yolo_to_coco.py        → COCO keypoint JSON (+ COCO-WholeBody images for training)
   ▼
coco/train.json, coco/val.json
   │  data/make_clean_val_json.py → coco/val_clean.json (split_27 excluded)
   ▼
train.py + vitpose_base_512_v2.py  (MMPose CocoDataset reads the JSONs; metainfo_18kp.py
                                     defines our 18 keypoints instead of COCO's 17)
```

`CocoDataset` in the config refers to the COCO **annotation format**: it is MMPose's loader for any
COCO-style keypoint JSON. Our data enters through `ann_file=coco/train.json` and
`coco/val_clean.json`, with `metainfo=metainfo_18kp.py`.

## Run (from this folder)

```bash
python data/prepare_studio.py --studio path/to/studio_dataset
python data/yolo_to_coco.py --datasets datasets/studio_yolo datasets/cocowb_yolo --split train --out coco/train.json
python data/yolo_to_coco.py --datasets datasets/studio_yolo --split val --out coco/val.json
python data/make_clean_val_json.py --src coco/val.json --out coco/val_clean.json
python train.py --config vitpose_base_512_v2.py --work-dir runs/vitpose_base512_v2
```

`studio_dataset/` layout: `annotations/{train,val}/<split>/Camera_L.xml|Camera_R.xml` (CVAT) and
`videos/{train,val}/<split>/Camera_L.mp4|Camera_R.mp4`.

`datasets/cocowb_yolo/` holds COCO-WholeBody images already converted to the same 18-keypoint
YOLO-pose format (prepared separately).

The warm start expects the v1 model at `checkpoints/vitpose_base512_v1_best.pth`
(or set `load_from = None` in the config).

## Data used for the released model

| Set | Source | Images | People |
|---|---|---|---|
| Train | Studio recordings Split_16–25, split_31–35 (both cameras) | 1,507 | 1,507 |
| Train | COCO-WholeBody, mapped to 18 keypoints | 1,121 | 1,477 |
| Validation | Studio recordings split_26 (69) + split_28 (86) | 155 | 155 |

- Only hand-annotated frames are used (every 5th frame); interpolated frames are not.
- Train and validation are split **by recording**, so no validation footage is seen in training.
- Keypoint visibility follows COCO: 2 = visible, 1 = occluded, 0 = not labelled.

## Environment

MMPose 1.3.2, MMPretrain 1.2.0, MMEngine, PyTorch 2.1.2 + CUDA 12.1.
Original run: RTX 4050 Laptop (6 GB), batch 12, ~1 h 50 min; best COCO AP 0.9682 at epoch 24.
