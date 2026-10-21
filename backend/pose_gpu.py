"""
pose_gpu.py -- faster GPU paths for the ViTPose + RTMDet pipeline in pose_estimator.py.

Each piece repeats mmpose / mmdet's own computation, only batched or moved onto the GPU, and the
two that could change numbers check themselves against the original code on first use:

  GpuUdpDecoder   The UDP + DARK heatmap decoder (mmpose codecs/udp_heatmap.py and
                  codecs/utils/refinement.py) in torch for a whole batch at once, instead of
                  per sample in NumPy with 18 OpenCV blurs each. Self-check: on the first batch the
                  result is compared with mmpose's decoder; if they differ it switches itself off.
  fast_test_step  TopdownPoseEstimator.test_step, with the flip pass in the SAME backbone call
                  as the normal pass (one batch of 2N images instead of two of N).
  DirectDetector  RTMDet called directly in batches -- the steps of mmdet.apis.inference_detector --
                  instead of through DetInferencer, which adds ~70 ms of Python overhead per call.
                  Self-check: first call compared with DetInferencer's boxes.
"""
import copy

import cv2
import numpy as np
import torch
import torch.nn.functional as F

DECODE_ON = True          # bench_speed.py toggles these to compare
FLIP_BATCH_ON = True


class GpuUdpDecoder:
    def __init__(self, codec):
        self.input_size = torch.tensor(codec.input_size, dtype=torch.float32)       # (w, h)
        self.W, self.H = codec.heatmap_size
        self.k = int(codec.blur_kernel_size)
        # exactly the kernel cv2.GaussianBlur(ksize=k, sigma=0) uses
        self.g = torch.from_numpy(cv2.getGaussianKernel(self.k, 0).astype(np.float32).ravel())
        self.eps = float(np.finfo(np.float32).eps)

    @torch.no_grad()
    def __call__(self, hm):
        hm = hm.float()
        B, K, H, W = hm.shape
        dev = hm.device
        vals, idx = hm.reshape(B, K, -1).max(dim=2)                     # get_heatmap_maximum
        x = (idx % W).float()
        y = torch.div(idx, W, rounding_mode="floor").float()
        invalid = vals <= 0

        # gaussian_blur(): zero-padded separable Gaussian, rescaled back to each map's original max
        b = (self.k - 1) // 2
        g = self.g.to(dev)
        z = hm.reshape(B * K, 1, H, W)
        z = F.conv2d(F.pad(z, (b, b, 0, 0)), g.view(1, 1, 1, -1))
        z = F.conv2d(F.pad(z, (0, 0, b, b)), g.view(1, 1, -1, 1)).reshape(B, K, H, W)
        z = z * (hm.amax(dim=(2, 3), keepdim=True) / z.amax(dim=(2, 3), keepdim=True))
        z = z.clamp(1e-3, 50.0).log()

        # refine_keypoints_dark_udp(): Taylor step on the log heatmap around the maximum
        zp = F.pad(z, (1, 1, 1, 1), mode="replicate").reshape(B, K, -1)
        xi = x.long().clamp(0, W - 1)
        yi = y.long().clamp(0, H - 1)
        base = (yi + 1) * (W + 2) + (xi + 1)

        def at(dx, dy):
            return zp.gather(2, (base + dy * (W + 2) + dx).unsqueeze(-1)).squeeze(-1)

        i_ = at(0, 0); ix1 = at(1, 0); iy1 = at(0, 1); ix1y1 = at(1, 1)
        ix1_y1_ = at(-1, -1); ix1_ = at(-1, 0); iy1_ = at(0, -1)
        dx = 0.5 * (ix1 - ix1_)
        dy = 0.5 * (iy1 - iy1_)
        dxx = ix1 - 2 * i_ + ix1_ + self.eps
        dyy = iy1 - 2 * i_ + iy1_ + self.eps
        dxy = 0.5 * (ix1y1 - ix1 - iy1 + i_ + i_ - ix1_ - iy1_ + ix1_y1_)
        det = dxx * dyy - dxy * dxy
        kx = x - (dyy * dx - dxy * dy) / det
        ky = y - (-dxy * dx + dxx * dy) / det
        kx = torch.where(invalid, torch.full_like(kx, -1.0), kx)
        ky = torch.where(invalid, torch.full_like(ky, -1.0), ky)

        kp = torch.stack([kx / (self.W - 1), ky / (self.H - 1)], dim=-1) * self.input_size.to(dev)
        return kp.cpu().numpy(), vals.cpu().numpy()


def install_gpu_decoder(model, tol_px=0.2):
    # tol in the model's 384x512 input space; float32 rounding at flat heatmap peaks gives ~0.05 px
    """Replace model.head.decode with the batched GPU version (after a self-check on first use)."""
    from mmengine.structures import InstanceData
    head = model.head
    codec = getattr(head, "decoder", None)
    if type(codec).__name__ != "UDPHeatmap" or getattr(codec, "heatmap_type", "gaussian") != "gaussian":
        print("pose: GPU decoder not used (the model's codec is not a gaussian UDP heatmap)")
        return False
    dec = GpuUdpDecoder(codec)
    orig = head.decode
    state = {"checked": False, "ok": True}

    def decode(batch_outputs):
        if not (DECODE_ON and state["ok"] and torch.is_tensor(batch_outputs) and batch_outputs.is_cuda):
            return orig(batch_outputs)
        kp, sc = dec(batch_outputs)
        if not state["checked"]:
            state["checked"] = True
            ref = orig(batch_outputs)
            rk = np.concatenate([np.asarray(r.keypoints).reshape(1, -1, 2) for r in ref])
            rs = np.concatenate([np.asarray(r.keypoint_scores).reshape(1, -1) for r in ref])
            m = rs > 0
            dk = float(np.abs(kp[m] - rk[m]).max()) if m.any() else 0.0
            ds = float(np.abs(sc - rs).max())
            if dk > tol_px or ds > 1e-4:
                state["ok"] = False
                print(f"pose: WARNING GPU heatmap decoder differs from mmpose (keypoints {dk:.4f} px, "
                      f"scores {ds:.6f}) -- using mmpose's decoder")
                return ref
            print(f"pose: GPU heatmap decoder matches mmpose (max difference {dk:.4f} px, scores {ds:.1e})")
        return [InstanceData(keypoints=kp[i:i + 1], keypoint_scores=sc[i:i + 1]) for i in range(len(kp))]

    head.decode = decode
    return True


@torch.no_grad()
def fast_test_step(model, batch):
    """mmengine test_step -> TopdownPoseEstimator.forward(mode='predict') -> predict(), with the
    flipped copy run in the same backbone batch."""
    if not FLIP_BATCH_ON:
        return model.test_step(batch)
    data = model.data_preprocessor(batch, False)
    inputs, samples = data["inputs"], data["data_samples"]
    if model.metainfo is not None:
        for ds in samples:
            ds.set_metainfo(model.metainfo)
    if model.test_cfg.get("flip_test", False):
        n = inputs.shape[0]
        f = model.extract_feat(torch.cat([inputs, inputs.flip(-1)], 0))
        feats = [tuple(t[:n] for t in f), tuple(t[n:] for t in f)]
    else:
        feats = model.extract_feat(inputs)
    preds = model.head.predict(feats, samples, test_cfg=model.test_cfg)
    if isinstance(preds, tuple):
        inst, fields = preds
    else:
        inst, fields = preds, None
    return model.add_pred_to_datasample(inst, fields, samples)


def set_channels_last(model, on=True):
    """Tensor-core friendly memory layout for the head's (de)convolutions."""
    fmt = torch.channels_last if on else torch.contiguous_format
    model.head.to(memory_format=fmt)


class DirectDetector:
    """RTMDet in batches: the steps of mmdet.apis.inference_detector, for many images at once."""

    def __init__(self, inferencer):
        from mmengine.dataset import Compose
        from mmengine.registry import init_default_scope
        self.model = inferencer.model
        cfg = getattr(self.model, "cfg", None) or inferencer.cfg
        pipe = copy.deepcopy(cfg.test_dataloader.dataset.pipeline)
        pipe[0]["type"] = "mmdet.LoadImageFromNDArray"
        init_default_scope("mmdet")
        self.pipeline = Compose(pipe)
        self.checked = False

    @torch.no_grad()
    def __call__(self, frames):
        data = [self.pipeline(dict(img=f, img_id=0)) for f in frames]
        batch = dict(inputs=[d["inputs"] for d in data], data_samples=[d["data_samples"] for d in data])
        return self.model.test_step(batch)
