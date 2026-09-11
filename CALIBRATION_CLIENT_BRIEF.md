# Stereo Calibration — Technical Brief & Client Q&A

Prep material for explaining the calibration process to the client and defending it in
technical review. Everything here is grounded in the actual code:
`backend/stereo_calibrate.py`, `backend/triangulate.py`, `backend/stereo_process.py`.

---

## 1. What calibration is and why we do it

We use **two cameras** to view the athlete from two slightly different angles (like two
eyes). To convert those two flat 2D views into accurate **3D**, we must first learn:

- each camera's internal optics (focal length, optical centre) and lens distortion, and
- exactly how the two cameras are positioned relative to each other (rotation + distance).

This is a **one-time, offline** step, run with the backend stopped so both cameras are free.
The output is a small file, `calibration.npz`, used at analysis time to triangulate body
joints into true 3D positions in millimetres.

---

## 2. Step-by-step process (`stereo_calibrate.py`)

1. **Board setup.** Print a checkerboard. Code expects **9×6 inner corners**, **40 mm
   squares** (`SQUARE_MM = 40.0`). `objp` holds the known 3D coordinates of every corner
   (flat board, z = 0), scaled to mm. Telling it the true square size is what makes all 3D
   output metric (millimetres).
2. **Open both cameras.** `open_cam()` opens left/right (indices from `.env`), sets MJPG at
   1280×720, and retries a few times (Windows can leave a camera briefly "busy").
3. **Live detection loop.** Each frame from both cameras → grayscale →
   `cv2.findChessboardCorners` (adaptive threshold + normalise + fast check). If found,
   `cv2.cornerSubPix` refines corners to sub-pixel accuracy (11×11 window, 30 iters / 0.001
   eps). Preview shows both feeds side by side; the status line turns green only when the
   board is detected in **both** views simultaneously.
4. **Capture pairs (SPACE).** Grabs a fresh, tightly-synced pair (`grab()` both cameras
   back-to-back, then `retrieve()`) to minimise the time gap between the two views,
   re-detects corners, and **stores the pair only if the board is found in both views.**
   Repeat 15–25 times with the board at varied positions, distances, and tilts, filling
   different parts of both frames. `u` = undo last pair, `q` = quit.
5. **Calibrate (c).** Requires ≥ ~8–10 pairs. Runs in stages:
   - `cv2.calibrateCamera` per camera → intrinsics `K1/K2`, distortion `D1/D2`, and a
     left/right RMS.
   - `cv2.stereoCalibrateExtended` with `CALIB_FIX_INTRINSIC` → rotation `R`, translation
     `T`, overall stereo RMS, and a per-pair error list.
   - **Bad-pair cleanup** (section 6), then re-run calibration on the survivors.
6. **Save.** Writes `calibration.npz`: `K1, D1, K2, D2, R, T`, both image sizes, final RMS,
   square size.

**Quality targets printed at the end:** stereo **RMS reprojection error < 1.0 px**, and a
sensible **baseline `|T|`** (camera separation) in mm.

---

## 3. Plain-language explanation for the client

> "We use two cameras to see the athlete from two angles, like your two eyes. To turn two
> flat views into accurate 3D, the cameras must first be *calibrated* — we learn each
> camera's lens behaviour and exactly how far apart and at what angle the two cameras are.
>
> We do this once, using a printed checkerboard, because its exact geometry is known. We
> hold the board in front of both cameras in many positions and take about 20 snapshots
> where both cameras clearly see it. The software finds the grid corners automatically. By
> comparing where the corners actually appear versus where they should appear for a known
> flat grid, it solves for the lens characteristics and the relationship between the two
> cameras.
>
> We measure quality with 'reprojection error' — after calibrating, we project the 3D model
> back onto the images and measure how many pixels off it is from the real corners. We aim
> for under one pixel. Any snapshot clearly worse than the rest is automatically thrown out
> and we recalculate. The result is a small calibration file. From then on, when we record a
> real athlete, we detect their joints in both views and triangulate each joint into a true
> 3D position in millimetres, letting us measure real joint angles in space rather than on a
> flat image."

---

## 4. How bad image pairs are detected and removed (the key question)

Two gates:

### Gate 1 — at capture (prevention)
A pair is only stored if the checkerboard is detected in **both** views on a fresh synced
grab:

```python
okL2, cL2 = find_corners(gcL)
okR2, cR2 = find_corners(gcR)
if okL2 and okR2:
    objpoints.append(objp.copy())
    imgL.append(cL2); imgR.append(cR2)
else:
    print("  board not found in both ... hold steady and try again")
```

"Bad" here = board not cleanly visible in both cameras → pair never added.

### Gate 2 — at calibration (statistical outlier removal)
Inside the `c` branch:

```python
per = np.asarray(res[-1]).reshape(-1, 2).mean(axis=1)   # per-pair reprojection error (avg L & R)
med = float(np.median(per))
thresh = max(1.0, med * 1.5)                              # keep if <= 1.5x median (floor 1.0 px)
good = [i for i in range(len(o)) if per[i] <= thresh]
if 8 <= len(good) < len(o):
    print(f"  dropping {len(o) - len(good)} bad pair(s), recalibrating...")
    o = [o[i] for i in good]; l = [l[i] for i in good]; r = [r[i] for i in good]
    # re-run calibrateCamera + stereoCalibrate on survivors only
```

**How good vs bad is decided:** `cv2.stereoCalibrateExtended` returns a **per-pair
reprojection error** (`perViewErrors`, always the last return value) — for each pair, the
average pixel distance between detected corners and where the calibrated model reprojects
them. The code takes the **median** and flags any pair worse than **1.5× the median** (with a
1.0 px floor so an already-excellent set isn't over-pruned) as an **outlier**, drops it, and
recalibrates on the survivors — but only if ≥ 8 good pairs remain, so the set is never
stripped below a usable size.

**In one sentence:** good = low reprojection error relative to the group; bad = an outlier
well above the median, which is removed and the calibration re-run without it.

---

## 5. From calibration to 3D (`triangulate.py`)

At analysis time, for each frame's paired 2D joints (left + right):
1. `cv2.undistortPoints` removes lens distortion and intrinsics → normalised coordinates.
2. Projection matrices `P1 = [I|0]`, `P2 = [R|T]`.
3. `cv2.triangulatePoints` intersects the two lines of sight → 3D point in the **left
   camera frame, in mm**.
4. Joints below **0.5 confidence** in either view are skipped and returned as `NaN`.
5. 3D joint angles computed via the dot-product angle at each joint (`angle_3d`).

---

## 6. Strict technical-review questions & short answers

**Target / ground truth**
- *Why a checkerboard?* Known, rigid, high-contrast geometry; corners detect to sub-pixel.
- *9×6 inner corners, and did you measure the 40 mm squares?* Yes — square size sets the
  metric scale; a wrong value scales all 3D output.
- *How many pairs, and why?* ~15–25 across varied poses to condition the solve; too few or
  all-similar poses gives an unstable result.

**Synchronisation**
- *Cameras aren't hardware-genlocked — how do you handle it?* At capture we `grab()` both
  then `retrieve()` to minimise the inter-camera gap, and calibrate only on a still board.
  (Honest: sync is software-level, a few ms.)

**Detection**
- *Sub-pixel refinement?* `cornerSubPix`, 11×11 window, 30 iters / 0.001 eps.
- *Partial board?* `findChessboardCorners` fails → pair never captured.

**Calibration math**
- *Fixed or optimised intrinsics in the stereo step?* Estimate per-camera intrinsics first,
  then `stereoCalibrate` with `CALIB_FIX_INTRINSIC`.
- *What are R and T, units?* Right camera's rotation/translation relative to left; T in mm.
- *Distortion model?* OpenCV default (radial + tangential) in `D1/D2`.

**Validation (pushed hardest)**
- *RMS and acceptable range?* Aim < 1.0 px stereo RMS.
- *How do you remove bad pairs?* See section 4.
- *Is median×1.5 rigorous?* It's a practical median-based filter, not a formal statistical
  test — a fair critique; a robust MAD / z-score threshold would be an improvement.
- *Held-out validation?* Currently evaluated on the same pairs used to fit — a known
  limitation worth stating.
- *Baseline sanity?* We print `|T|` and compare to the real camera separation.

**Downstream**
- *How are joints triangulated?* See section 5.
- *2D→3D error propagation?* Not formally quantified yet (be honest).

**"Do you want to see the calibration code?"** — Yes; offer it at the depth they want:
- Read-only walkthrough of `stereo_calibrate.py`, highlighting the capture loop and cleanup
  block (best live).
- Short annotated excerpt — just the ~20 lines of bad-pair rejection (if they only care
  about validation).
- Full file / repo link (if they'll review independently).

---

## 7. Glossary (the "big words")

- **Calibration** — measuring a camera's optics and the geometry between two cameras so
  measurements become accurate and metric.
- **Intrinsics (K)** — internal camera parameters: focal length and optical centre.
- **Distortion coefficients (D)** — how the lens bends straight lines; mathematically undone.
- **Extrinsics (R, T)** — rotation and translation of the second camera relative to the first.
- **Baseline** — physical distance between the two cameras (`|T|`); like the gap between eyes.
- **Checkerboard / inner corners** — the calibration target; inner corners are the internal
  grid intersections (a 10×7-square board = 9×6 inner corners).
- **Sub-pixel refinement** — locating a corner more precisely than one whole pixel.
- **Reprojection error** — project known 3D points back into the image and measure the pixel
  gap to detected points; the core accuracy metric.
- **RMS error** — one summary number for all those pixel gaps; lower is better; target < 1 px.
- **Triangulation** — intersecting two lines of sight to recover a 3D position.
- **Normalised coordinates** — points after removing lens/intrinsics, for clean geometry math.
- **Median / outlier** — median is the middle value; an outlier is far above it and is dropped.
