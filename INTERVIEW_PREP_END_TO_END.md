# SportPose — End-to-End Technical Defense

Prep for a deep technical review. Grounded in the actual code: `camera.py`,
`stereo_calibrate.py`, `triangulate.py`, `pose_estimator.py`, `stereo_process.py`,
`pose.py`, and the React frontend.

**Golden rule for tomorrow:** state the mechanism precisely, then volunteer the limitation
before he asks. A senior engineer trusts the person who already knows where the bodies are
buried. Never bluff a number you don't have — say "we haven't measured that yet, here's how
we would."

---

## 0. Framing — scope it honestly in the first 60 seconds

> "SportPose is a two-camera markerless 3D motion-capture web app. An athlete is recorded by
> a stereo camera pair; we run a pre-trained pose model on each view to get 2D joints, then
> use classical stereo geometry — calibration and triangulation — to reconstruct true 3D
> joint positions and compute 3D joint angles over time, displayed in a synchronized web UI.
>
> To be precise about the ML: the pose *estimation* is Google MediaPipe's pre-trained
> Pose Landmarker — we don't train a model. Our engineering contribution is the stereo
> reconstruction pipeline (calibration, synchronization, triangulation, floor leveling), the
> temporal analysis, and the full-stack system around it. We deliberately use *metric
> triangulation* rather than MediaPipe's monocular depth guess, because a single camera can't
> recover true depth."

Saying this up front stops him from thinking you're claiming to have trained a network, and
frames the classical-CV work — which is the real substance — as the contribution.

---

## 1. End-to-end pipeline (the narrative he asked for)

### Stage 0 — Calibration (one-time, offline) `stereo_calibrate.py`
Learns each camera's **intrinsics** (focal length, optical centre) + **distortion**, and the
**extrinsics** (`R`, `T`) between the two cameras, using a printed 9×6 checkerboard, 40 mm
squares. Steps: detect corners in both views (`findChessboardCorners` + sub-pixel
`cornerSubPix`) → capture ~20 still pairs → `calibrateCamera` per camera → `stereoCalibrate`
with `CALIB_FIX_INTRINSIC` → drop per-pair reprojection-error outliers (> 1.5× median) →
save `calibration.npz`. Quality metric = **RMS reprojection error** (target < 1 px). A floor
board + `f` key stores a leveling rotation `R_level` so the 3D stands upright.
**Risk:** wide 3.6 m baseline + small board → currently ~4 px RMS (being fixed).

### Stage 1 — Capture & synchronization `camera.py`
Two sources (USB webcams or phone IP-cams over WiFi). A background thread (`StereoManager._loop`)
reads them **sequentially** — `capL.read()` then `capR.read()` — with `CAP_PROP_BUFFERSIZE=1`
to minimise latency, caches the last good frame from each, and publishes the latest
`(left, right, timestamp)` triple. Live preview is an **MJPEG** stream.
**This is software-level sync, a few ms to tens of ms apart — not hardware genlock.** Say this
plainly; it's the #1 thing he'll probe (see Q1).

### Stage 2 — Recording & storage `camera.py`, MinIO, MongoDB
`Recorder._loop` pulls the latest synced pair, composes a **side-by-side** frame
(`cv2.hconcat`), and writes an MP4 paced to the **wall clock** (`expected_frames = elapsed ×
fps`; it duplicates the current frame to catch up so total duration is correct). On stop, the
file is uploaded to **MinIO** (object storage) and a document is written to **MongoDB**
(`videos` collection) tagged `layout="side_by_side"`, `source="stereo_camera"`.

### Stage 3 — Trigger & routing `pose.py`
User clicks "Extract Kinematics" → `POST /api/process-video/{id}`. The clip is pulled from
MinIO to a temp file. Routing: if `layout=="side_by_side"` (or `source=="stereo_camera"`)
**and** `calibration.npz` exists → 3D stereo path; otherwise → 2D fallback. Processing is
**synchronous inside the request** (a known scalability limit — Q10).

### Stage 4 — 2D pose per view `pose_estimator.py` (MediaPipe)
Each frame → BGR→RGB → `mp.Image` → **MediaPipe Pose Landmarker**, Tasks API, `VIDEO` running
mode, model file `pose_landmarker.task`. MediaPipe returns **33 landmarks**; we remap to a
custom **18-point** skeleton (`_MP_MAPPING`) and synthesise a **neck** = midpoint of the two
shoulders. Keypoints stored **normalised** `[x, y, presence]` in 0–1. For stereo, this runs
**twice** — once on the left half, once on the right half — with healing/smoothing **off**.

### Stage 5 — Triangulation to 3D `triangulate.py`
For each frame, pair joint *j* in left with joint *j* in right. Convert normalised coords to
pixels using each view's stored size → `cv2.undistortPoints` (removes distortion + intrinsics
→ normalised camera rays) → projection matrices `P1=[I|0]`, `P2=[R|T]` →
`cv2.triangulatePoints` (linear DLT) → 3D point in the **left-camera frame, in millimetres**.
A joint below **0.5 confidence in either view** is dropped to `NaN`. Optional `R_level` rotates
everything upright.

### Stage 6 — 3D angles `triangulate.py`
Joint angle at *b* = `arccos` of the normalised dot product of vectors (a−b) and (c−b), in 3D.
Angles are **invariant to scale and to global rotation** — a key robustness point (Q9).

### Stage 7 — Persistence `pose.py`, MongoDB, MinIO
The overlaid left-view video is re-uploaded to MinIO (`processed_object_name`). The full
result — per-frame 2D keypoints/angles **and** `frames_3d` (3D points + 3D angles) — is stored
in the `pose_analysis` collection.

### Stage 8 — Display & time-sync (React)
`AnalysisPage` shows three panels: the 2D overlay video (via a 1-hour MinIO **presigned URL**),
a `<canvas>` **3D skeleton viewer**, and an **ECharts** joint-angle graph. Time sync is
event-driven: the video dispatches a `sync-time` window event each animation frame; the chart
moves a vertical marker and the 3D viewer jumps to `frame = floor(time × fps)`. Auth is a JWT
in an **HttpOnly cookie**.

---

## 2. The questions he WILL ask — with model answers

### Q1. Synchronization — "How are the two cameras synchronized? Prove the frames are simultaneous."
**Answer:** They're **not hardware-synchronized.** We read them sequentially on one thread with
a 1-frame buffer, so a captured pair is a few ms to tens of ms apart, and the offset is
variable under load. **Why it's tolerable:** for calibration the board is held still, so the
offset doesn't matter; for a moving athlete, the triangulation error scales with
`motion_speed × time_offset`. At, say, 20 ms offset and a wrist moving 2 m/s, that's ~4 cm of
apparent displacement — real, and worst on fast limbs. **Honest extra:** our recording loop
uses `read()/read()`, which is *looser* than the `grab()/grab()`+`retrieve()/retrieve()` trick
we already use in calibration — porting that to recording is a cheap improvement. **Proper
fixes:** hardware genlock / external trigger, or timestamp each stream and interpolate to a
common clock. This is our biggest known weakness and we lead with it.

### Q2. Left/right correspondence — "How do you know joint *j* in the left image is the same joint as *j* in the right?"
**Answer:** We rely on MediaPipe producing a **consistent anatomical labeling** across both
views and pair by index. **The risk he's fishing for:** MediaPipe can **flip left/right limb
labels** when the subject faces away or is ambiguous — and because we pair index-to-index with
no geometric check, a flip would triangulate, e.g., a left wrist against a right wrist →
garbage 3D. **We currently do not enforce an epipolar-consistency check.** The correct fix is
to verify each candidate pair against the **epipolar constraint** (the right point should lie
on the epipolar line of the left point, via the fundamental/essential matrix) and reject or
relabel violations. Knowing this cold will impress him more than any feature.

### Q3. Triangulation method — "What triangulation are you using, and what does it optimize?"
**Answer:** `cv2.triangulatePoints` — **linear DLT**, solved via SVD. It minimises an
**algebraic** error, not the geometric reprojection error, and it has **no outlier rejection**.
A single bad 2D detection in one view corrupts that 3D point directly. Improvements we'd cite:
the **optimal/iterative triangulation** (minimise reprojection error), a **RANSAC**-style gate
on per-joint reprojection error, and **bundle adjustment** if we extended to more cameras.

### Q4. Confidence & occlusion — "What's your confidence signal, and how do you handle occlusion?"
**Answer:** We threshold MediaPipe's **`presence`** at 0.5 per view; a joint weak in either view
becomes `NaN` (a gap) rather than a wrong 3D point. **Nuance he may test:** MediaPipe exposes
both **`presence`** (landmark is in the image) and **`visibility`** (landmark is *visible*, i.e.
not occluded). For occlusion, `visibility` is arguably the better signal — a fair critique;
we chose `presence` and would evaluate `visibility` as an ablation. We do **no** cross-view
occlusion recovery (if one camera sees a joint and the other doesn't, we drop it instead of
falling back to the single view).

### Q5. Temporal filtering — "Is your 3D filtered over time? Show me the jitter handling."
**Answer:** The 2D fallback path has a `heal_and_smooth` step (`pose_postprocess.py`), but the
**stereo 3D path runs with healing OFF**, so 3D is **raw per-frame** and jittery. There's no
temporal model — no moving average, no **Kalman / One-Euro filter**, no velocity constraint.
That's a clear, easy next improvement and we'd name those filters specifically.

### Q6. Calibration quality — "What's your reprojection error, and is your validation sound?"
**Answer:** Current stereo RMS ≈ 4.2 px (target < 1), because we have a **3.6 m baseline
calibrated with a small 40 cm board** seen at steep convergence angles — a hard, wide-baseline
case. We're fixing it with a larger target and stricter still-board captures, and we added a
**baseline sanity check** (calibrated `|T|` vs the measured 3.6 m). **Validation caveat we
volunteer:** we currently evaluate on the **same pairs** used to fit, and our outlier rule is a
practical median×1.5 filter, not a formal robust estimator (MAD/z-score would be better).

### Q7. Model choice — "Why MediaPipe? Why not train your own, or use OpenPose / a transformer?"
**Answer:** MediaPipe gives real-time, robust single-person 2D landmarks with per-point
confidence and a tiny footprint, which suited a stereo pipeline where the **3D geometry**, not
the 2D detector, is the contribution. We didn't train because we had no labeled 3D ground truth
and off-the-shelf 2D was accurate enough to demonstrate the method. Alternatives with tradeoffs:
**OpenPose** (multi-person, heavier), **HRNet/ViTPose** (higher accuracy, more compute),
**monocular 3D lifters** like VideoPose3D (avoid stereo but give relative, not metric, depth).

### Q8. Depth — "MediaPipe already outputs a z. Why triangulate at all?"
**Answer:** MediaPipe's `z` is a **monocular, relative** depth estimate anchored to the hips,
in normalised units — not metric and not reliable for biomechanics. Stereo triangulation gives
**true metric depth in millimetres** from real geometry. Strong point; lean on it.

### Q9. Scale & coordinate frame — "What are your units, and what happens if the scale is wrong?"
**Answer:** 3D is in the **left-camera frame**, in **mm**, with scale set by the checkerboard
`SQUARE_MM`. If the square size is wrong, **positions** scale by that error — **but our
headline output is joint *angles*, which are invariant to scale and to global rotation.** So
scale/level errors hurt the 3D *picture* more than the *numbers we report*. This is your best
defensive line — it's true and it's exactly the kind of invariance a senior engineer respects.

### Q10. Performance & production — "Walk me through latency and how this scales."
**Answer:** `process-video` is **synchronous** — it downloads, runs MediaPipe twice
(both halves), triangulates, re-encodes, and uploads, all inside the HTTP request, so a long
clip blocks a worker. Production would need an **async job queue** (Celery/RQ) with progress,
and GPU inference. Also: **frame duplication** in the recorder means `fps` is nominal — if a
camera under-delivers, duplicated frames create zero-velocity artifacts in the 3D.

### Q11. Frame rate — "You hardcode 30 fps. Defend that."
**Answer:** `pose_estimator.py` forces `fps = 30` for both inference timestamps and the time
axis, to survive corrupted MP4 headers from the webcams. Downside: any non-30 fps clip is
mis-timed (a 60 fps clip plays/analyses at 2× wrong time). The fix is to read the true fps and
fall back to 30 only when it's missing — small change, on our list.

### Q12. Rolling shutter — "Your webcams have rolling shutter. What does that do here?"
**Answer:** Consumer webcams/phones expose rows sequentially, so a fast-moving limb is skewed
within a frame; combined with our inter-camera offset it compounds triangulation error on fast
motion. Global-shutter cameras or slower movements mitigate it. Good to name unprompted.

### Q13. Multi-person — "What if two athletes are in frame?"
**Answer:** We take `pose_landmarks[0]` — **single person only.** Multi-person needs multi-pose
detection plus **cross-view identity association** (which person in left = which in right),
which is a research problem in itself.

### Q14. Failure modes — "When does this break?"
Fast limbs (sync + rolling shutter), self-occlusion (joints → NaN), subject facing away
(possible L/R label flip), one camera bumped after calibration (extrinsics invalid), poor
lighting/motion blur (2D detection degrades), subject outside the calibrated volume.

---

## 3. Limitations to volunteer (maturity signals — say these before he asks)
1. Software-level, sequential-read synchronization; no genlock; recording sync is looser than
   calibration sync.
2. No epipolar / left-right correspondence check before triangulation.
3. Linear DLT triangulation, no per-joint outlier rejection, no bundle adjustment.
4. No temporal filtering on the 3D (stereo path runs healing off).
5. Calibration currently ~4.2 px RMS; evaluated on the fit set; median×1.5 outlier rule is
   heuristic.
6. Hardcoded 30 fps; nominal fps via frame duplication.
7. `presence` used instead of `visibility`; no cross-view occlusion fallback.
8. Single person; synchronous processing; no quantified accuracy yet.

---

## 4. Your strongest true talking points
- **Metric triangulation, not monocular guesswork** — real depth from geometry.
- **Reported output (angles) is invariant to scale and global rotation** — robust to the
  calibration errors that would otherwise scare a reviewer.
- **Modular, honest architecture** — 2D detector is swappable; calibration, triangulation,
  leveling, and app layers are cleanly separated.
- **We know our own weaknesses and the exact fixes** — genlock/timestamps, epipolar gating,
  optimal triangulation + RANSAC, Kalman/One-Euro smoothing, larger calibration target.

## 5. Planned accuracy validation (have an answer for "what's your error in degrees?")
We haven't quantified it yet. Plan: film a planar movement with a tripod DSLR side-on as a 2D
reference, and/or measure a static joint with a **goniometer**, and compare against the system's
angle for the same pose — reporting mean absolute error in degrees. Say this; don't invent a
number.

---

## 6. Deep-term glossary (so a definition question can't rattle you)
- **Intrinsics / extrinsics** — a camera's internal optics (focal length, principal point) /
  the rotation+translation between the two cameras.
- **Epipolar geometry** — the constraint that a point in one view must lie on a specific line
  (its *epipolar line*) in the other; encoded by the **fundamental/essential matrix**. Used to
  validate stereo correspondences.
- **Triangulation (DLT)** — recovering a 3D point by intersecting two back-projected rays;
  Direct Linear Transform solves it linearly via SVD.
- **Reprojection error** — distance in pixels between a detected point and the reprojection of
  its reconstructed 3D point; the core accuracy metric. **RMS** = its root-mean-square.
- **Bundle adjustment** — jointly optimising 3D points and camera parameters to minimise total
  reprojection error (gold standard; we don't do it).
- **RANSAC** — random-sample consensus; robustly fits a model while rejecting outliers.
- **Genlock** — hardware synchronisation of multiple cameras to a common clock/trigger.
- **Rolling vs global shutter** — sensor exposes rows sequentially vs all-at-once; rolling
  shutter skews fast motion.
- **Kalman / One-Euro filter** — temporal filters that smooth noisy time series (jittery
  keypoints) while tracking real motion.
- **Presence vs visibility (MediaPipe)** — probability a landmark is in the image vs
  probability it's visible (not occluded).
- **Homogeneous coordinates** — projective coordinates (extra scale term) that make the
  triangulation linear; divide by the last term to return to 3D.
- **Baseline** — distance between the two camera centres (`|T|`); larger baseline = better
  depth precision but harder correspondence.

## 7. If he asks something you don't know
Say: "I don't have that measured / I haven't implemented that." Then show you understand *why
it matters* and *how you'd approach it.* That answer beats a confident wrong one every time,
and it's the response a world-class engineer is actually testing for.
