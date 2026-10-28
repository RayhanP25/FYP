"""
Lets the backend run with mmcv-lite (the pure-Python mmcv, no compiled CUDA ops).

Why: there is no prebuilt full mmcv for the PyTorch versions that support RTX 50-series
GPUs (torch 2.7+ / CUDA 12.8), and building it needs Visual Studio + the CUDA toolkit.
The pipeline only needs one compiled op: NMS in the RTMDet person detector. This module
supplies it through torchvision (same result: keep the highest score, drop boxes whose
IoU with a kept box is above the threshold). Any other compiled op raises a clear error
if something ever calls it.

With the full mmcv installed (e.g. the old conda env) install() does nothing.
Call install() before importing mmdet / mmpose.
"""
import importlib
import importlib.machinery
import os
import sys
import types

_installed = False


def install():
    """Returns True if the stand-in was installed, False if the real compiled ops exist."""
    global _installed
    # torch >= 2.6 loads checkpoints with weights_only=True by default, which mmengine 0.10.x
    # does not expect (our .pth files hold training metadata). These are our own files.
    os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")
    if _installed:
        return True
    try:
        importlib.import_module("mmcv._ext")
        return False
    except ImportError:
        pass

    import torch
    import torchvision

    ext = types.ModuleType("mmcv._ext")
    ext.__spec__ = importlib.machinery.ModuleSpec("mmcv._ext", None)   # mmengine looks this up; no loader = "not full mmcv"

    def nms(bboxes, scores, iou_threshold, offset=0):
        if bboxes.numel() == 0:
            return bboxes.new_zeros((0,), dtype=torch.long)
        boxes = bboxes.float()
        if offset:                      # mmcv's offset=1 means a box covers x1..x2 inclusive
            boxes = boxes.clone()
            boxes[:, 2:] += offset
        return torchvision.ops.nms(boxes, scores.float(), float(iou_threshold))

    ext.nms = nms

    def _missing(name):
        def op(*args, **kwargs):
            raise RuntimeError(f"mmcv op '{name}' needs the compiled mmcv; this install uses mmcv-lite "
                               "(see backend/mmcv_ext_shim.py)")
        return op

    def __getattr__(name):              # mmcv checks every op name exists when its modules load
        if name.startswith("__"):
            raise AttributeError(name)
        return _missing(name)

    ext.__getattr__ = __getattr__
    sys.modules["mmcv._ext"] = ext
    import mmcv
    mmcv._ext = ext
    _installed = True
    print("pose: mmcv-lite detected, using torchvision NMS")
    return True
