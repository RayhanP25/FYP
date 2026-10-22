import os

_base_ = ['mmpose::body_2d_keypoint/topdown_heatmap/coco/td-hm_ViTPose-base_8xb64-210e_coco-256x192.py']

# Paths are relative to this folder; {{fileDirname}} is filled in by mmengine when the config loads.
DATA_DIR = os.path.join('{{fileDirname}}', 'coco')
TRAIN_JSON = os.path.join(DATA_DIR, 'train.json')
VAL_JSON = os.path.join(DATA_DIR, 'val_clean.json')
METAINFO = dict(from_file=os.path.join('{{fileDirname}}', 'metainfo_18kp.py'))
NUM_KPTS = 18
BATCH = 12

# Warm start from the v1 ViTPose-B 512x384 model (18-keypoint head).
# Set to None to start from the MAE-pretrained backbone of the base config instead.
load_from = os.path.join('{{fileDirname}}', 'checkpoints', 'vitpose_base512_v1_best.pth')

max_epochs = 30
train_cfg = dict(by_epoch=True, max_epochs=max_epochs, val_interval=2)

# Low-LR fine-tune: linear warm-up, then cosine decay.
optim_wrapper = dict(type='AmpOptimWrapper', loss_scale='dynamic',
                     optimizer=dict(lr=1e-4))
param_scheduler = [
    dict(type='LinearLR', start_factor=0.01, by_epoch=False, begin=0, end=100),
    dict(type='CosineAnnealingLR', begin=0, end=max_epochs, T_max=max_epochs,
         by_epoch=True, convert_to_iter_based=True),
]

# UDP heatmaps at 512x384 input with sigma 2.
codec = dict(type='UDPHeatmap', input_size=(384, 512), heatmap_size=(96, 128), sigma=2)

model = dict(
    backbone=dict(img_size=(512, 384)),
    head=dict(out_channels=NUM_KPTS, decoder=codec))

# use_udp=True must match the UDP codec.
train_pipeline = [
    dict(type='LoadImage'),
    dict(type='GetBBoxCenterScale'),
    dict(type='RandomFlip', direction='horizontal'),
    dict(type='RandomHalfBody'),
    dict(type='RandomBBoxTransform'),
    dict(type='TopdownAffine', input_size=codec['input_size'], use_udp=True),
    dict(type='GenerateTarget', encoder=codec),
    dict(type='PackPoseInputs'),
]
val_pipeline = [
    dict(type='LoadImage'),
    dict(type='GetBBoxCenterScale'),
    dict(type='TopdownAffine', input_size=codec['input_size'], use_udp=True),
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
                    max_keep_ckpts=2, interval=2))
custom_hooks = [dict(type='EarlyStoppingHook', monitor='coco/AP', rule='greater',
                     patience=6, min_delta=0.001)]
