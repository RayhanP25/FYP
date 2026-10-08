"""Inference-only config for the ViTPose-Base @512 (v2) champion model.

This is the same architecture as the training config, but with all paths made
relative to this file so it works inside the backend (no D:\\DK\\... paths), and
with training-only pieces (optimizer, schedules, evaluators) removed.

Place beside this file, in the same backend/models/ folder:
  - best_coco_AP_epoch_24.pth   (the trained checkpoint)
  - metainfo_18kp.py            (the 18-keypoint metainfo, copied from training)

If init_model ever errors on this file, the guaranteed-safe fallback is to copy
your working rtmpose/vitpose_base_512_v2.py here and change only three lines:
the METAINFO path -> local metainfo_18kp.py, remove the D:\\DK RTMPOSE_DIR, and
set load_from = None.
"""
_base_ = ['mmpose::body_2d_keypoint/topdown_heatmap/coco/'
          'td-hm_ViTPose-base_8xb64-210e_coco-256x192.py']

NUM_KPTS = 18
# {{fileDirname}} = the folder of THIS config file (filled in by mmengine when it loads
# the config; __file__ is not available inside mmengine configs).
METAINFO = dict(from_file='{{fileDirname}}/metainfo_18kp.py')

# same decoder/head as training (UDP heatmap, 512x384 input)
codec = dict(type='UDPHeatmap', input_size=(384, 512), heatmap_size=(96, 128), sigma=2)
model = dict(backbone=dict(img_size=(512, 384)),
             head=dict(out_channels=NUM_KPTS, decoder=codec))

val_pipeline = [
    dict(type='LoadImage'),
    dict(type='GetBBoxCenterScale'),
    dict(type='TopdownAffine', input_size=codec['input_size'], use_udp=True),
    dict(type='PackPoseInputs'),
]

# init_model reads the 18-keypoint metainfo from here to set model.dataset_meta.
test_dataloader = dict(
    batch_size=1, num_workers=0, persistent_workers=False, drop_last=False,
    sampler=dict(type='DefaultSampler', shuffle=False),
    dataset=dict(type='CocoDataset', data_root='', data_mode='topdown',
                 ann_file='', data_prefix=dict(img=''), metainfo=METAINFO,
                 test_mode=True, pipeline=val_pipeline))
val_dataloader = test_dataloader

# not used for inference
val_evaluator = None
test_evaluator = None
load_from = None
