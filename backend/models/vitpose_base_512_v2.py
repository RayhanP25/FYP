"""Inference-only config for the ViTPose-Base @512 (v2) champion model.

Same architecture as the training config, with training-only pieces (optimizer,
schedules, evaluators) removed.

Lives in backend/models/ beside:
  - best_coco_AP_epoch_24.pth   (the trained checkpoint, gitignored)
  - metainfo_18kp.py            (the 18-keypoint metainfo, copied from training)

NOTE: this file must NOT contain `import` statements. mmengine switches to
"lazy import" config parsing as soon as it sees one, which is incompatible with
the plain `_base_ = [...]` string inheritance used below. That means the
metainfo path here cannot be made absolute -- it only resolves when the current
working directory is this folder. pose_estimator._load_models() therefore sets
`model.dataset_meta` explicitly from an absolute path after init_model(), and
that is the authoritative source of the 18-keypoint metainfo.
"""
_base_ = ['mmpose::body_2d_keypoint/topdown_heatmap/coco/'
          'td-hm_ViTPose-base_8xb64-210e_coco-256x192.py']

NUM_KPTS = 18
METAINFO = dict(from_file='metainfo_18kp.py')

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

test_dataloader = dict(
    batch_size=1, num_workers=0, persistent_workers=False, drop_last=False,
    sampler=dict(type='DefaultSampler', shuffle=False),
    dataset=dict(type='CocoDataset', data_root='', data_mode='topdown',
                 ann_file='', data_prefix=dict(img=''), metainfo=METAINFO,
                 test_mode=True, pipeline=val_pipeline))
val_dataloader = test_dataloader
# init_model reads dataset_meta from the *train* dataloader when the checkpoint
# carries none, so keep this in sync or it silently falls back to 17-kpt COCO.
train_dataloader = dict(dataset=dict(metainfo=METAINFO))

# not used for inference
val_evaluator = None
test_evaluator = None
load_from = None
