#!/usr/bin/env python3
"""
fix_vitpose_ckpt.py -- pre-resize a COCO ViTPose checkpoint's position embedding
so it can WARM-START a higher-resolution ViTPose config.

mmpretrain's resize_pos_embed assumes a SQUARE token grid, but ViTPose uses a
NON-square grid (e.g. 16x12 for 256x192), so loading a 256x192 checkpoint into a
512x384 model crashes. This resizes the pos_embed with correct non-square bicubic
interpolation and saves a new checkpoint that loads cleanly (the pose head still
re-inits for 18 kpts, which mmengine handles).

USAGE (base, 256x192 -> 512x384):
  python rtmpose\\fix_vitpose_ckpt.py ^
    --src rtmpose\\ckpts\\td-hm_ViTPose-base_8xb64-210e_coco-256x192-216eae50_20230314.pth ^
    --in-h 512 --in-w 384
Then set load_from in the config to the *_512x384.pth it prints.
"""
import argparse, os
import torch
import torch.nn.functional as F


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="COCO ViTPose checkpoint .pth")
    ap.add_argument("--in-h", type=int, default=512, help="target input height")
    ap.add_argument("--in-w", type=int, default=384, help="target input width")
    ap.add_argument("--src-h", type=int, default=256, help="checkpoint input height")
    ap.add_argument("--src-w", type=int, default=192, help="checkpoint input width")
    ap.add_argument("--patch", type=int, default=16)
    args = ap.parse_args()

    ck = torch.load(args.src, map_location="cpu")
    sd = ck["state_dict"] if "state_dict" in ck else ck
    key = "backbone.pos_embed"
    if key not in sd:
        print("No backbone.pos_embed in checkpoint; keys:", [k for k in sd if "pos_embed" in k]); return
    pe = sd[key]                                   # [1, L, C]
    C = pe.shape[-1]
    sh, sw = args.src_h // args.patch, args.src_w // args.patch   # source grid
    th, tw = args.in_h // args.patch, args.in_w // args.patch     # target grid
    extra = pe.shape[1] - sh * sw                  # 1 if a cls/extra token is present
    grid = pe[:, extra:, :].reshape(1, sh, sw, C).permute(0, 3, 1, 2)   # [1,C,sh,sw]
    grid = F.interpolate(grid, size=(th, tw), mode="bicubic", align_corners=False)
    grid = grid.permute(0, 2, 3, 1).reshape(1, th * tw, C)             # [1, th*tw, C]
    sd[key] = grid
    sd.pop("backbone.cls_token", None)             # model uses with_cls_token=False

    out = os.path.splitext(args.src)[0] + f"_{args.in_h}x{args.in_w}.pth"
    torch.save(ck, out)
    print(f"pos_embed {tuple(pe.shape)} (grid {sh}x{sw}, extra={extra}) -> {tuple(grid.shape)} (grid {th}x{tw})")
    print(f"saved: {out}")
    print(f"set  load_from = r'{os.path.abspath(out)}'  in your config")


if __name__ == "__main__":
    main()
