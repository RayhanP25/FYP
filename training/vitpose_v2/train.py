"""Train ViTPose-B 512x384 (v2) on the 18-keypoint dataset.

    python train.py --config vitpose_base_512_v2.py --work-dir runs/vitpose_base512_v2
"""
import argparse
import os

import mmpose  # noqa: F401
from mmengine.config import Config
from mmengine.runner import Runner

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    """Load the config, set the output folder and run mmengine's training loop."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.path.join(HERE, "vitpose_base_512_v2.py"))
    ap.add_argument("--work-dir", default=os.path.join(HERE, "runs", "vitpose_base512_v2"))
    args = ap.parse_args()
    cfg = Config.fromfile(args.config)
    cfg.work_dir = args.work_dir
    os.makedirs(cfg.work_dir, exist_ok=True)
    runner = Runner.from_cfg(cfg)
    runner.train()
    print("\nDONE. Best checkpoint in:", cfg.work_dir)


if __name__ == "__main__":
    main()
