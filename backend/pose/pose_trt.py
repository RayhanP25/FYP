"""
pose_trt.py -- the ViTPose backbone run by NVIDIA TensorRT instead of PyTorch (POSE_TRT=1, off by default).

Only the backbone (the vision transformer, almost all of the AI's work) is replaced. Everything around it stays
PyTorch / mmpose exactly as before: the data preprocessing, the flip test, the heatmap head, the decoder. So the
results can only differ by the backbone's rounding, which tools/trt_build.py checks when it builds the engine.

The engine is built once per graphics card and TensorRT version by tools/trt_build.py and saved next to the model
(models/vitpose_v2_backbone_<GPU>_trt<version>.engine). It needs the tensorrt package, which is only in the
separate test environment (.venv-trt) until it has been compared with the current results.
"""
import glob
import os
import threading

import torch

from core.paths import BACKEND_DIR

MODELS_DIR = os.path.join(BACKEND_DIR, "models")


def engine_name(gpu_name, trt_version):
    gpu = "".join(c if c.isalnum() else "_" for c in gpu_name).strip("_")
    return os.path.join(MODELS_DIR, f"vitpose_v2_backbone_{gpu}_trt{trt_version}.engine")


def find_engine():
    import tensorrt as trt
    path = engine_name(torch.cuda.get_device_name(0), trt.__version__)
    if os.path.exists(path):
        return path
    others = glob.glob(os.path.join(MODELS_DIR, "vitpose_v2_backbone_*.engine"))
    hint = f" (found {', '.join(os.path.basename(o) for o in others)}, built for another GPU / TensorRT)" if others else ""
    raise FileNotFoundError(f"no TensorRT engine for this GPU: run tools\\trt_build.py{hint}")


class TrtBackbone(torch.nn.Module):
    """Drop-in for model.backbone: takes the (N, 3, 512, 384) batch, returns (feature map,) like mmpretrain's
    VisionTransformer with out_type='featmap'. One execution context per thread (the two cameras run in two)."""

    def __init__(self, path):
        super().__init__()
        import tensorrt as trt
        self.trt = trt
        self.path = path
        self.logger = trt.Logger(trt.Logger.WARNING)
        with open(path, "rb") as f, trt.Runtime(self.logger) as rt:
            self.engine = rt.deserialize_cuda_engine(f.read())
        if self.engine is None:
            raise RuntimeError(f"could not load {path}")
        names = [self.engine.get_tensor_name(i) for i in range(self.engine.num_io_tensors)]
        self.inp = next(n for n in names if self.engine.get_tensor_mode(n) == trt.TensorIOMode.INPUT)
        self.out = next(n for n in names if self.engine.get_tensor_mode(n) == trt.TensorIOMode.OUTPUT)
        self.in_dtype = torch.float16 if self.engine.get_tensor_dtype(self.inp) == trt.DataType.HALF else torch.float32
        self.out_dtype = torch.float16 if self.engine.get_tensor_dtype(self.out) == trt.DataType.HALF else torch.float32
        self.max_batch = self.engine.get_tensor_profile_shape(self.inp, 0)[2][0]
        self._local = threading.local()

    def _context(self):
        ctx = getattr(self._local, "ctx", None)
        if ctx is None:
            ctx = self._local.ctx = self.engine.create_execution_context()
        return ctx

    @torch.no_grad()
    def forward(self, x):
        if x.shape[0] > self.max_batch:                  # larger than the engine was built for: in parts
            return (torch.cat([self.forward(p)[0] for p in torch.split(x, self.max_batch)], 0),)
        x = x.to(self.in_dtype).contiguous()
        ctx = self._context()
        ctx.set_input_shape(self.inp, tuple(x.shape))
        out = torch.empty(tuple(ctx.get_tensor_shape(self.out)), dtype=self.out_dtype, device=x.device)
        ctx.set_tensor_address(self.inp, x.data_ptr())
        ctx.set_tensor_address(self.out, out.data_ptr())
        if not ctx.execute_async_v3(torch.cuda.current_stream().cuda_stream):
            raise RuntimeError("TensorRT could not run the backbone")
        return (out.float(),)


def install(model):
    """Replace model.backbone with the TensorRT engine. Returns a short description, or raises."""
    path = find_engine()
    model.backbone = TrtBackbone(path)
    return os.path.basename(path)
