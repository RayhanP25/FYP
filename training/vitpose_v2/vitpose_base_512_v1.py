import os

_base_ = ['mmpose::body_2d_keypoint/topdown_heatmap/coco/td-hm_ViTPose-base_8xb64-210e_coco-256x192.py']

# Paths are relative to this folder; {{fileDirname}} is filled in by mmengine when the config loads.
DATA_DIR = os.path.join('{{fileDirname}}', 'coco')
TRAIN_JSON = os.path.join(DATA_DIR, 'train.json')
VAL_JSON = os.path.join(DATA_DIR, 'val_clean.json')
METAINFO = dict(from_file=os.path.join('{{fileDirname}}', 'metainfo_18kp.py'))
NUM_KPTS = 18
BATCH = 12

# Warm start from the public COCO ViTPose-B checkpoint, resized to 512x384 by tools/fix_vitpose_ckpt.py.
# The 17-keypoint COCO head does not match our 18 keypoints, so the head starts fresh.
load_from = os.path.join('{{fileDirname}}', 'checkpoints',
                         'td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314_512x384.pth')

max_epochs = 80
train_cfg = dict(by_epoch=True, max_epochs=max_epochs, val_interval=5)
optim_wrapper = dict(type='AmpOptimWrapper', loss_scale='dynamic')

# MSRA heatmaps at 512x384 input (w=384, h=512), heatmap 96x128, sigma 3.
codec = dict(type='MSRAHeatmap', input_size=(384, 512), heatmap_size=(96, 128), sigma=3)

model = dict(
    backbone=dict(img_size=(512, 384)),
    head=dict(out_channels=NUM_KPTS, decoder=codec))

train_pipeline = [
    dict(type='LoadImage'),
    dict(type='GetBBoxCenterScale'),
    dict(type='RandomFlip', direction='horizontal'),
    dict(type='RandomHalfBody'),
    dict(type='RandomBBoxTransform'),
    dict(type='TopdownAffine', input_size=codec['input_size']),
    dict(type='GenerateTarget', encoder=codec),
    dict(type='PackPoseInputs'),
]
val_pipeline = [
    dict(type='LoadImage'),
    dict(type='GetBBoxCenterScale'),
    dict(type='TopdownAffine', input_size=codec['input_size']),
    dict(type='PackPoseInputs'),
]

dataset_type = 'CocoDataset'
train_dataloader = dict(
    batch_size=BATCH, num_workers=0, persistent_workers=False,
    dataset=dict(type=dataset_type, data_root='', data_mode='topdown',
                 ann_file=TRAIN_JSON, data_prefix=dict(img=''), metainfo=METAINFO,
                 pipeline=train_pipeline))
val_dataloader = dict(
    batch_size=BATCH, num_workers=0, persistent_workers=False,
    dataset=dict(type=dataset_type, data_root='', data_mode='topdown',
                 ann_file=VAL_JSON, data_prefix=dict(img=''), metainfo=METAINFO,
                 bbox_file=None, test_mode=True, pipeline=val_pipeline))
test_dataloader = val_dataloader

val_evaluator = dict(type='CocoMetric', ann_file=VAL_JSON, use_area=False)
test_evaluator = val_evaluator

# Keep the best checkpoint by COCO AP; stop early when AP stops improving.
default_hooks = dict(
    checkpoint=dict(type='CheckpointHook', save_best='coco/AP', rule='greater',
                    max_keep_ckpts=2, interval=5))
custom_hooks = [dict(type='EarlyStoppingHook', monitor='coco/AP', rule='greater',
                     patience=6, min_delta=0.001)]
