r"""
trt_build.py -- builds the TensorRT engine for the ViTPose backbone on THIS graphics card.

Run it once per PC, in the backend's .venv after installing the TensorRT packages (see requirements-venv.txt),
with the backend stopped:
    cd backend
    .venv\Scripts\activate
    python tools\trt_build.py
Then set POSE_TRT=1 in .env and start the backend.

1. exports the backbone of models/vitpose_base_512_v2.py + best_coco_AP_epoch_24.pth to ONNX
2. builds a TensorRT engine from it (half precision, batches of 1 to 32 crops of 512x384), a few minutes
3. checks it: the same random batch through PyTorch (as the system runs it: half precision) and through the
   engine, and prints how far the feature maps differ
The engine is saved as models/vitpose_v2_backbone_<GPU>_trt<version>.engine (not in git; one per GPU).
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

import torch  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-batch", type=int, default=32, help="largest batch (16 frames x 2 with the flip test)")
    ap.add_argument("--opt-batch", type=int, default=32)
    ap.add_argument("--workspace-gb", type=float, default=2.0)
    a = ap.parse_args()

    from core import mmcv_ext_shim
    mmcv_ext_shim.install()                      # as the backend does, before mmpose (mmcv-lite)
    import tensorrt as trt
    from mmpose.apis import init_model
    from pose import pose_trt

    cfg = os.path.join(BACKEND, "models", "vitpose_base_512_v2.py")
    ckpt = os.path.join(BACKEND, "models", "best_coco_AP_epoch_24.pth")
    gpu = torch.cuda.get_device_name(0)
    print(f"GPU {gpu} | PyTorch {torch.__version__} | TensorRT {trt.__version__}")
    model = init_model(cfg, ckpt, device="cuda:0").eval()
    w, h = model.cfg.codec["input_size"]                   # (384, 512)

    class Backbone(torch.nn.Module):
        def __init__(self, bb):
            super().__init__()
            self.bb = bb

        def forward(self, x):
            return self.bb(x)[0]

    onnx_path = os.path.join(BACKEND, "models", "vitpose_v2_backbone.onnx")
    engine_path = pose_trt.engine_name(gpu, trt.__version__)

    # Half precision: older TensorRT takes a float32 model plus the FP16 flag; newer TensorRT (11+) takes the
    # precision from the model itself ("strongly typed"), so the backbone is exported in half precision then.
    fp16_flag = getattr(trt.BuilderFlag, "FP16", None)
    strong_flag = getattr(trt.NetworkDefinitionCreationFlag, "STRONGLY_TYPED", None)
    strongly_typed = fp16_flag is None or int(trt.__version__.split(".")[0]) >= 11
    print(f"   half precision via {'a half-precision model (strongly typed)' if strongly_typed else 'the FP16 flag'}")

    print("1/3 exporting the backbone to ONNX ...")
    export = Backbone(model.backbone).eval()
    x = torch.randn(2, 3, h, w, device="cuda:0")
    if strongly_typed:
        import copy
        export = copy.deepcopy(export).half()
        x = x.half()
    torch.onnx.export(export, x, onnx_path, input_names=["input"], output_names=["feat"],
                      dynamic_axes={"input": {0: "n"}, "feat": {0: "n"}}, opset_version=17, dynamo=False)
    del export
    torch.cuda.empty_cache()

    print("2/3 building the TensorRT engine (a few minutes) ...")
    t0 = time.time()
    logger = trt.Logger(trt.Logger.WARNING)
    builder = trt.Builder(logger)
    flags = (1 << int(strong_flag)) if strongly_typed and strong_flag is not None else 0
    network = builder.create_network(flags)
    parser = trt.OnnxParser(network, logger)
    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            for i in range(parser.num_errors):
                print("  ONNX:", parser.get_error(i))
            raise SystemExit("could not read the ONNX file")
    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, int(a.workspace_gb * (1 << 30)))
    if not strongly_typed:
        config.set_flag(fp16_flag)
    prof = builder.create_optimization_profile()
    prof.set_shape("input", (1, 3, h, w), (a.opt_batch, 3, h, w), (a.max_batch, 3, h, w))
    config.add_optimization_profile(prof)
    data = builder.build_serialized_network(network, config)
    if data is None:
        raise SystemExit("TensorRT could not build the engine")
    with open(engine_path, "wb") as f:
        f.write(data)
    print(f"   built in {time.time() - t0:.0f} s -> {engine_path}")

    print("3/3 checking it against PyTorch ...")
    eng = pose_trt.TrtBackbone(engine_path)
    torch.manual_seed(0)
    x = torch.randn(32, 3, h, w, device="cuda:0")
    with torch.no_grad(), torch.autocast("cuda", dtype=torch.float16):
        ref = model.backbone(x)[0].float()
    got = eng(x)[0]
    d = (got - ref).abs()
    rel = (d.norm() / ref.norm()).item()
    print(f"   feature maps {tuple(got.shape)}: max difference {d.max().item():.4f}, mean {d.mean().item():.5f}, "
          f"relative {rel:.2e} (PyTorch half precision vs TensorRT)")

    def speed(fn, n=20):
        for _ in range(3):
            fn()
        torch.cuda.synchronize()
        t = time.perf_counter()
        for _ in range(n):
            fn()
        torch.cuda.synchronize()
        return 1000 * (time.perf_counter() - t) / n

    def torch_run():
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.float16):
            model.backbone(x)
    t_pt, t_trt = speed(torch_run), speed(lambda: eng(x))
    print(f"   one batch of 32 crops (16 frames with the flip test): PyTorch {t_pt:.0f} ms, TensorRT {t_trt:.0f} ms "
          f"-> {t_pt / t_trt:.1f}x faster")
    os.remove(onnx_path)
    print("done. Next: compare with the current results (_debug\\abl\\full_ablation.py --models v2,v2_trt).")


if __name__ == "__main__":
    main()
