# Stereo calibration and triangulation

Calibration and 3D triangulation code used for the two-camera pose system (FYP-B, Group 13).

## Files

| File | Purpose |
|---|---|
| `stereo_calibrate.py` | Calibrates the two cameras from checkerboard photos, a recording, or live capture |
| `triangulate.py` | Converts matching 2D points from the left and right camera into 3D (mm) |
| `calibration.npz` | The calibration used for the toe-walk test (9 Oct 2026) |

## Setup

Python 3.8 or newer.

```
pip install numpy opencv-python python-dotenv
```

Keep `stereo_calibrate.py` and `triangulate.py` in the same folder.

## 1. Quick test (no cameras or photos needed)

```
python stereo_calibrate.py --selftest
```

This builds two synthetic cameras with a known setup, renders checkerboard photos, calibrates from them and checks the result against the true values. It takes 1-2 minutes and ends with:

```
SELFTEST PASSED: baseline 3655.4 (true 3656.0), fx error 0.01%, ...
```

## 2. Inspect the calibration file

```
python -c "import numpy as np; d=np.load('calibration.npz'); print('size', d['size1'], '| baseline mm %.1f' % np.linalg.norm(d['T']), '| RMS px %.3f' % d['rms'], '| floor square error %.2f%%' % d['floor_square_depth_err_pct'])"
```

Expected for the supplied file:

| Value | |
|---|---|
| Image size | 2560 x 1440 |
| Baseline (distance between cameras) | 3629.3 mm (tape: 3600 mm) |
| Stereo RMS | 0.857 px |
| Floor check (80 mm squares, towards the cameras) | -0.18% |
| Photo pairs | 76 (two sessions) |

The file contains `K1 D1 K2 D2` (camera matrices and distortion), `R T` (right camera relative to the left, T in mm), `size1 size2`, `rms`, `square_mm`, `R_level` (floor levelling) and the check values.

## 3. Triangulate points

```python
from triangulate import load_calibration, triangulate_pair

calib = load_calibration("calibration.npz")
ptsL = [[1250.0, 640.0]]          # pixel coordinates in the left image (2560 x 1440)
ptsR = [[1310.0, 655.0]]          # same point in the right image
print(triangulate_pair(ptsL, ptsR, calib))   # (N, 3) in mm, left camera frame
```

`triangulate_keypoints()` takes the 18 keypoints per view as `[x, y, confidence]` with x and y normalised to 0-1, so videos recorded at a smaller size with the same aspect ratio (e.g. 1280 x 720) work with this calibration. It also applies `R_level`, so the floor is horizontal in the output.

## 4. Run a calibration

The board is a 9 x 6 inner-corner checkerboard with 80 mm squares (A1 print).

**From saved photos** (folders with `pair_01_L.png`, `pair_01_R.png`, ... and optionally `floor_L.png`, `floor_R.png`):

```
python stereo_calibrate.py --from-folder session_1 session_2 --out my_calibration.npz
```

**From recordings** (side-by-side left|right video):

```
python stereo_calibrate.py --from-video board.mp4 --floor-video floor.mp4 --out my_calibration.npz
```

- `board.mp4`: move the board over the whole picture of both cameras, near and far, tilted left/right and forwards/backwards, holding it still about 1 s at each position (25-40 positions).
- `floor.mp4`: the board lying flat on the floor where the person stands, 3-5 s.

**Live, with the cameras connected:**

```
python stereo_calibrate.py
```

Keys: `SPACE` capture a pair, `u` undo, `c` calibrate and save, `f` floor level (board flat on the floor), `q` quit. The on-screen guide shows image coverage, tilt and near/far spread.

Settings can be put in a `.env` file next to the script:

```
CAMERA_LEFT_INDEX=2
CAMERA_RIGHT_INDEX=0
CAMERA_WIDTH=2560
CAMERA_HEIGHT=1440
CALIB_SQUARE_MM=80
EXPECTED_BASELINE_MM=3600
```

The report printed at the end includes the stereo RMS, the square size measured in 3D, the board tilt range and, after the floor step, the floor check (square size along the depth direction).

## Notes

- A calibration is only valid for the camera positions, focus and image size it was made with. Autofocus is switched off during capture.
- An existing `calibration.npz` is kept as `calibration_backup_<date>.npz` before a new one is saved.
- Photos from each live session are saved in `calib_sessions/<date_time>/`, so a calibration can be re-run with `--from-folder`.
