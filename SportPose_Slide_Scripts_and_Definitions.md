# SportPose — Slide Scripts & Keyword Definitions

Speaker script + jargon definitions for the **final 22-slide deck**, written for a review by a
top ML engineer. Grounded in the actual code (`camera.py`, `stereo_calibrate.py`,
`triangulate.py`, `pose_estimator.py`, `stereo_process.py`, `pose.py`, frontend).

**Delivery principles:** state the mechanism → volunteer the limitation → give the fix.
Never fabricate a number. If you don't know, say so and explain how you'd find out.

---

## Slide 1 — Title: "Client Update — An AI-Driven Spatial–Temporal Framework for Occlusion-Robust Sport Pose Estimation"

**Script:**
"This is a technical walkthrough of SportPose, our two-camera markerless 3D motion-capture
system. I'll go end to end: how the cameras capture and synchronize, how we calibrate them,
how we triangulate 2D detections into true 3D, and how we turn that into joint angles on
screen. One framing note up front: the pose *detector* is Google's pre-trained MediaPipe — we
don't train a network. Our engineering contribution is the stereo geometry pipeline around it:
calibration, synchronization, triangulation, and the full-stack app. We recover **metric** 3D
from real geometry, not a monocular depth guess."

**Defending the title (be ready — he WILL ask about these words):**
- *"AI-Driven"* — the AI component is the MediaPipe deep-learning pose model; the rest is
  classical computer vision. Say that plainly.
- *"Spatial"* — refers to the stereo triangulation that recovers 3D spatial coordinates.
- *"Temporal"* — we produce per-frame time series of joint angles; **honest caveat:** the 3D
  path is currently per-frame with no temporal smoothing yet (Kalman / One-Euro is planned).
  Don't claim strong temporal modeling you don't have.
- *"Occlusion-Robust"* — the *design intent* of two cameras is that a joint hidden from one
  view can be recovered from the other. **Honest caveat:** the current code drops a joint to
  NaN if it's low-confidence in *either* view, so single-view fallback is future work. Frame it
  as the rationale for stereo, not a solved feature.

**Keywords:**
- **Markerless motion capture** — measuring body movement from ordinary video, with no suit or
  reflective markers.
- **Stereo (vision)** — using two cameras at different positions to recover depth, like two eyes.
- **Metric 3D** — 3D coordinates in real-world units (millimetres), not arbitrary/relative scale.
- **Monocular depth** — a single camera's guess at depth; relative and unreliable, unlike stereo.
- **Kinematics** — the description of motion (positions, angles, velocities) without forces.

---

## Slide 2 — Section divider: "System & Setup"

**Script:**
"First, the physical system — the camera rig, how we capture, and the synchronization question,
which is the single most important thing to get right in any stereo setup."

**Keywords:**
- **Camera rig** — the fixed physical arrangement of the two cameras.
- **Synchronization** — making the two cameras' frames correspond to the same instant in time.

---

## Slide 3 — End-to-end pipeline (8 stages)

**Script:**
"Here's the whole system in eight stages. Stage 0, calibration, is a one-time offline step that
learns the camera geometry. Then per recording: capture two synchronized views, record them as
one side-by-side video and store it, route the clip to the stereo or 2D path based on its
metadata, run MediaPipe on each view to get 2D keypoints, triangulate the paired keypoints into
metric 3D, compute 3D joint angles and level them to the floor, and finally persist the results
and show them in a synchronized web UI. Every later slide zooms into one of these rows."

**Keywords:**
- **Intrinsics** — a camera's internal optics: focal length and optical (principal) point.
- **Distortion** — lens bending of straight lines, which we mathematically undo.
- **R, T** — rotation and translation of the right camera relative to the left (the extrinsics).
- **Checkerboard** — the known-geometry calibration target.
- **Keypoints** — detected body-joint locations (here 18 points).
- **Triangulate** — intersect the two cameras' sightlines to one point to recover its 3D position.
- **Left-cam frame** — the coordinate system centred on the left camera; all 3D is expressed here.
- **Metadata** — the stored tags on a clip (e.g. `layout`, `source`) used to route processing.

---

## Slide 4 — Physical camera rig (top-down)

**Script:**
"This is our real room, about 3 by 3.8 metres. Both cameras sit on the same wall, roughly 3.6 m
apart and about 2 m high, tilted down at a shared capture volume — the red box where the athlete
performs. It's a convergent setup: the optical axes cross in that volume. The athlete has to be
inside the overlap, because that's the only region both cameras see. The 3.6 m baseline is a
deliberate trade-off: a wide baseline gives better depth precision, but it makes calibration and
matching harder. And because all 3D comes out in the left camera's tilted frame, we add a
floor-leveling step to stand the skeleton upright."

**Keywords:**
- **Baseline** — the distance between the two camera centres; wider = better depth precision but
  harder correspondence and calibration.
- **Capture volume** — the 3D region where the athlete is recorded and both cameras overlap.
- **Convergent / verged rig** — cameras angled inward so their optical axes meet (vs parallel).
- **Optical axis** — the straight line out of the centre of a lens; the camera's aiming direction.
- **Overlapping field of view** — the region both cameras can see at once.
- **Depth precision** — how accurately depth can be resolved; improves with a wider baseline.
- **Correspondence** — matching the same real point across the two views.
- **Coordinate frame** — the reference axes in which 3D points are expressed.

---

## Slide 5 — Capture modes & signal path

**Script:**
"Live capture uses two USB webcams through OpenCV, forced to MJPG at 720p with a one-frame
buffer to minimise latency. It'll fail if another app like OBS or Zoom is holding a camera; the
indices are set in config. The signal path is: grab both cameras on one thread, compose them
side by side, serve an MJPEG preview, write the MP4, and upload to MinIO."

**Keywords:**
- **OpenCV** — the open-source computer-vision library we use for capture and geometry.
- **DirectShow** — the Windows camera backend OpenCV uses here.
- **MJPG / MJPEG** — Motion-JPEG; each frame is a JPEG image; used for capture and the live stream.
- **Buffer size 1** — keep only the newest frame so the preview isn't delayed.
- **Grab thread** — the background thread that pulls frames from both cameras.
- **Compose side-by-side** — join left and right frames into one wide image (`cv2.hconcat`).
- **VideoWriter** — the OpenCV object that encodes frames into an MP4 file.
- **MinIO** — a self-hosted, S3-compatible object store for the video files.

---

## Slide 6 — Capture & synchronization

**Script:**
"Here's how a synchronized pair is formed, and the honest limitation. One thread reads the
cameras one after the other — read left, then read right — caches the last good frame from each,
and publishes the newest pair. That means the two frames are **software-synchronized**, a few
milliseconds to tens of milliseconds apart, and the gap varies under load. This isn't hardware
genlock. The impact: triangulation error scales with motion speed times that time offset — so
it's worst on fast limbs and negligible when the subject is slow or still. For example, a 20 ms
offset on a wrist moving 2 m/s is about 4 cm of apparent displacement between the views. The
proper fixes are hardware genlock or timestamping each stream and interpolating to a common
clock. I'm flagging this up front because it's the biggest known weakness."

**Keywords:**
- **Sequential reads** — reading the two cameras one after the other, not simultaneously.
- **Last-good-frame cache** — keep each camera's most recent valid frame to pair with the other.
- **Genlock** — hardware sync locking cameras to a common trigger/clock (we don't have it).
- **Δt / time offset** — the small time gap between the left and right frames in a pair.
- **grab() / retrieve()** — OpenCV's split capture: `grab()` queues a frame, `retrieve()` decodes
  it; grabbing both then retrieving gives tighter sync than `read()/read()`.
- **Interpolation** — estimating a frame at an in-between timestamp to align the two streams.

---

## Slide 7 — Recording & storage

**Script:**
"We record both views as one side-by-side MP4 — a single file keeps left and right inherently
paired. The writer is paced to the wall clock: it works out how many frames *should* have elapsed
and duplicates the latest frame to catch up, so the clip's duration is correct. The caveat is
that the frame rate is therefore nominal — if a camera under-delivers, you get repeated frames,
which look like zero motion. Storage is split: the video bytes go to MinIO under a unique name
and are served later via one-hour presigned URLs; the metadata goes to MongoDB, including the
stereo tags that later route the clip to the 3D pipeline."

**Keywords:**
- **Composite frame** — one image holding both views side by side.
- **Wall-clock pacing** — timing writes against real elapsed time rather than camera callbacks.
- **Nominal fps** — the intended frame rate, which may not equal the true delivered rate.
- **Zero-velocity artifact** — a duplicated frame appears as a moment of no movement.
- **Object store** — storage for large binary files (videos), separate from the database.
- **UUID** — a universally unique identifier used as the file's object name.
- **Presigned URL** — a temporary, signed link that lets the browser fetch a file without
  storage credentials; ours expire in one hour.
- **Metadata tagging** — storing descriptive fields (`layout`, `source`, `fps`) alongside the file.

---

## Slide 8 — Section divider: "Calibration"

**Script:**
"Now calibration — the one-time step where we teach the system the exact geometry of the two
cameras, so that later we can turn two 2D points into one correct 3D point."

**Keywords:**
- **Calibration** — measuring each camera's optics and the geometry between the two cameras.

---

## Slide 9 — Calibration procedure (offline, one-time)

**Script:**
"The procedure: print a 9-by-6 inner-corner checkerboard with 40 mm squares — the known square
size is what makes our 3D metric. We detect the corners to sub-pixel accuracy in both views at
once, and store a pair only when the board is found in both. We capture about 20 pairs across
varied positions and tilts. Then we calibrate each camera individually to get its intrinsics and
distortion, run the stereo solve with intrinsics fixed to get the rotation and translation
between the cameras plus per-pair errors, drop the worst pairs and refit, and save everything to
calibration.npz — including the floor-leveling rotation."

**Keywords:**
- **Inner corners** — the internal grid intersections of the checkerboard (a 10×7 board = 9×6).
- **Metric scale** — real-world sizing; set by telling the solver the true square size.
- **findChessboardCorners** — OpenCV function that locates the board's corners in an image.
- **cornerSubPix / sub-pixel** — refining a corner to finer than one whole pixel for accuracy.
- **calibrateCamera** — OpenCV routine that estimates one camera's intrinsics + distortion.
- **K** — the intrinsics matrix (focal lengths + principal point).
- **D** — the distortion coefficients.
- **RMS** — root-mean-square reprojection error; the accuracy summary (target < 1 px).
- **stereoCalibrateExtended** — OpenCV stereo solve that also returns per-pair errors.
- **FIX_INTRINSIC** — flag telling the stereo solve to keep each camera's intrinsics fixed.
- **Per-pair error** — the reprojection error attributed to each captured image pair.
- **calibration.npz** — the saved file holding K1,D1,K2,D2,R,T, image sizes, RMS, square size, R_level.
- **R_level** — the stored rotation that levels the 3D output to the floor.

---

## Slide 10 — How bad image pairs are removed

**Script:**
"Quality control happens at two gates. Gate 1, at capture: a pair is only ever stored if the
board is detected in both views on a fresh synced grab — bad captures never enter the set. Gate
2, at calibration: the stereo solve returns a reprojection error per pair; we take the median and
drop any pair worse than 1.5 times it, with a 1-pixel floor, then recalibrate on the survivors —
but only if at least 8 good pairs remain, so we never over-prune. Reprojection error itself means:
project the reconstructed 3D board points back into the image and measure the pixel gap to the
detected corners; the RMS of those gaps is the accuracy number, and we aim under 1 pixel. Honest
caveat: the 1.5-times-median rule is a practical filter, not a formal robust estimator, and we
currently evaluate on the same pairs we fit — no held-out set yet."

**Keywords:**
- **Gate** — a checkpoint that admits or rejects data.
- **Reprojection error** — pixel distance between a detected point and the reprojection of its
  reconstructed 3D point; the core accuracy metric.
- **Median** — the middle value; robust to a few extreme outliers.
- **Threshold** — the cut-off (here `max(1.0 px, 1.5 × median)`) above which a pair is dropped.
- **Outlier** — a data point far from the rest; here a pair with unusually high error.
- **Robust estimator (MAD / z-score)** — a statistically principled outlier rule; stronger than
  our median×1.5 heuristic. (MAD = median absolute deviation.)
- **Held-out set** — data withheld from fitting, used to test generalization (we don't have one yet).

---

## Slide 11 — Quality metrics & the wide-baseline challenge

**Script:**
"The honest numbers. Target stereo RMS is under 1 pixel; ours is currently about 4.2, which we're
fixing. Our real baseline is 3.6 m, and we added a sanity check that warns if the calibrated
baseline is more than 15% off that. Why is the RMS high? A 3.6 m baseline calibrated with a small
40 cm board means few pixels per corner, and the steep convergence angle foreshortens the board
in at least one view. The tell is that each camera calibrated fine on its own — 1.6 and 0.27
pixels — but the stereo error was 4.2, which points to a synchronization or correspondence issue,
not a lens problem. And a per-pair median of 5.6 meant most pairs were bad, not just a few
outliers. Fixes in progress: a larger target, a perfectly still board and rigid cameras, the
baseline sanity check, and floor-leveling. A realistic goal for this rig is 1 to 1.5 pixels."

**Keywords:**
- **Stereo RMS** — the root-mean-square reprojection error of the stereo calibration.
- **|T|** — the magnitude of the translation vector = the physical baseline distance.
- **Sanity-check band** — the ±15% tolerance we compare the calibrated baseline against.
- **Convergence angle** — the angle between the two cameras' optical axes.
- **Foreshortening** — apparent compression of a surface viewed at a steep angle.
- **Per-camera vs stereo RMS** — good single-camera fits but bad stereo = a sync/matching problem.

---

## Slide 12 — Floor leveling — standing the skeleton upright

**Script:**
"Because the cameras are tilted down, the reconstructed skeleton comes out leaning. We fix that
by laying the checkerboard flat on the floor, capturing it in both cameras, triangulating its
corners, and fitting a plane — the plane's normal is 'up'. We compute a rotation, R_level, that
maps that normal to vertical, store it in calibration.npz, and apply it to every 3D frame. The
key point: joint angles are rotation-invariant, so leveling only changes how the skeleton is
oriented on screen — it never changes the measured angle numbers."

**Keywords:**
- **Plane normal** — the direction perpendicular to a surface; for a floor, it points up.
- **Plane fit** — finding the best-fit flat surface through a set of 3D points.
- **Vertical axis** — the world's up direction we align the floor normal to.
- **Rotation-invariant** — unchanged by rotating the whole scene; true of angles, not positions.
- **R_level** — the leveling rotation applied to all 3D output.

---

## Slide 13 — Section divider: "The 3D Pipeline"

**Script:**
"Now the core: turning the two camera views into metric 3D joint angles, and getting them onto
the screen."

**Keywords:** *(none new)*

---

## Slide 14 — 2D pose estimation (per view)

**Script:**
"Each view goes through MediaPipe's Pose Landmarker in video mode. Per frame we convert to RGB
and run detection with a timestamp locked to 30 fps. MediaPipe returns 33 landmarks; we remap
them to our 18-point skeleton and synthesize a neck as the midpoint of the shoulders. Keypoints
are stored normalized, 0 to 1, with a presence confidence. For stereo we run this twice, once per
half. And importantly, we do NOT use MediaPipe's z output — that's a monocular, relative guess;
our depth comes from triangulation instead."

**Keywords:**
- **MediaPipe Pose Landmarker** — Google's pre-trained body-keypoint model.
- **Tasks API** — MediaPipe's current interface for running its models.
- **VIDEO running mode** — a mode that expects monotonically increasing timestamps for video.
- **Landmark** — a single detected point output by the model (33 of them).
- **Remap** — relabel/select MediaPipe's 33 points into our 18-point scheme.
- **Synthesized neck** — a neck joint we compute (shoulder midpoint) since MediaPipe has none.
- **Normalized coordinates** — pixel positions expressed as fractions (0–1) of width/height.
- **Presence** — MediaPipe's confidence that a landmark is in the image.
- **Temporal healing** — a smoothing/gap-filling step over time (OFF on our 3D path).
- **Monocular z** — MediaPipe's single-camera relative depth, which we deliberately ignore.

---

## Slide 15 — Paired 2D → metric 3D (triangulation)

**Script:**
"Triangulation. For each frame we take the matching keypoint from the left and right views,
convert normalized coordinates to pixels, and undistort them — which removes lens distortion and
the intrinsics, leaving clean camera rays. We build projection matrices — the left is identity,
the right is R and T — and call OpenCV's linear triangulation to get a 3D point in the left
camera's frame, in millimetres. If a joint is below 0.5 confidence in either view, we output NaN
rather than a wrong point. The honest limits: this is linear DLT, which minimizes an algebraic
error; there's no per-joint outlier rejection, no bundle adjustment, and no epipolar check on the
correspondences."

**Keywords:**
- **undistortPoints** — OpenCV step that removes distortion + intrinsics, giving normalized rays.
- **Normalized camera rays** — directions from the camera centre after intrinsics are removed.
- **Projection matrix (P1, P2)** — 3×4 matrices mapping 3D to each image; P1 = [I|0], P2 = [R|T].
- **Identity [I|0]** — the left camera defines the origin, so its projection is the identity.
- **triangulatePoints** — OpenCV routine that intersects the two rays for the 3D point.
- **DLT (Direct Linear Transform)** — solving triangulation linearly via SVD.
- **Homogeneous coordinates** — projective coords with an extra scale term; divide out to get 3D.
- **NaN** — "not a number"; our marker for a missing/untrusted joint.
- **Algebraic vs geometric error** — DLT minimizes an algebraic quantity, not the true pixel
  (reprojection) error that optimal triangulation would.
- **Bundle adjustment** — jointly optimizing 3D points + cameras to minimize total reprojection
  error; the gold standard (we don't do it).
- **Epipolar check** — verifying a match lies on the expected epipolar line; catches mismatches.

---

## Slide 16 — 3D joint angles

**Script:**
"From the 3D points we compute joint angles directly: at a joint B with neighbours A and C, take
the vectors from B to A and B to C and the angle between them is the arccos of their normalized
dot product — a true 3D angle. We report 12: knees, hips, elbows, wrists, shoulders and ankles,
left and right. A missing endpoint just skips that angle for the frame. Why this output is robust:
angles are invariant to scale — a wrong square size mis-sizes positions but not angles — and
invariant to global rotation, so camera tilt and leveling don't change them. That means many
calibration errors hurt the picture more than the numbers we actually report."

**Keywords:**
- **Vector (A−B)** — the direction and length from point B to point A.
- **Dot product** — a scalar combining two vectors; its normalized value gives the cosine of the
  angle between them.
- **arccos** — inverse cosine; converts that cosine back into an angle.
- **Invariant to scale** — unchanged if the whole thing is resized.
- **Invariant to global rotation** — unchanged if the whole scene is rotated.
- **Facing-direction normalization** — a 2D-only heuristic to handle left/right facing; the 3D
  path doesn't need it.
- **Anatomical convention** — expressing angles the way clinicians expect (e.g. 180° = straight).

---

## Slide 17 — Storing the results

**Script:**
"When the user hits Extract Kinematics, the server downloads the clip from MinIO, decides stereo
versus 2D from the metadata plus whether a calibration file exists, runs pose and triangulation,
renders the overlay video and re-uploads it, and stores the analysis. That analysis document
holds the 2D frames that drive the graph and the 3D frames that drive the viewer, plus mode,
units, and fps. It's one document per video, upserted on reprocessing. One honest note: this runs
synchronously inside the HTTP request, which is a scalability limit — production would use a job
queue."

**Keywords:**
- **process-video request** — the API call that runs analysis for one clip.
- **Route** — the branch choosing the stereo-3D or 2D path from metadata + calibration presence.
- **Overlay video** — the output clip with the skeleton drawn on it.
- **processed_object_name** — the MinIO name of that overlay video.
- **Synchronous** — the work runs inside the request and blocks it until done.
- **pose_analysis document** — the MongoDB record holding all results for a video.
- **frames / frames_3d** — per-frame 2D results / per-frame triangulated 3D results.
- **Upsert** — update the record if it exists, otherwise insert it.

---

## Slide 18 — Frontend & time synchronization

**Script:**
"The analysis page has three panels locked to the video clock: the overlay video, the rotatable
3D skeleton, and the joint-angle graph. Synchronization is event-driven — on each animation frame
the video broadcasts a 'sync-time' event with its current time; the graph moves a marker line to
that time, throttled to about 20 fps, and the 3D viewer jumps to the matching frame. When analysis
finishes, an event invalidates the query cache so the panels refetch. It's a lightweight custom
event bus rather than a heavy state library."

**Keywords:**
- **SPA (single-page app)** — a web app that updates in place without full page reloads.
- **Custom DOM event** — a browser event we define (`sync-time`) to pass the current time around.
- **currentTime** — the video's playback position, in seconds.
- **Marker line** — the vertical cursor on the graph showing the current time.
- **requestAnimationFrame** — a browser callback that fires each render frame (~60 fps).
- **Throttling** — capping how often a handler runs (here ~20 fps) to save work.
- **Query cache / invalidation** — TanStack Query's stored server data; invalidation forces a refetch.
- **Presigned playback URL** — the temporary MinIO link the `<video>` element streams from.

---

## Slide 19 — The 3D skeleton viewer

**Script:**
"The 3D viewer is deliberately lightweight: a hand-written 3D-to-2D projection on an HTML canvas,
no Three.js. You drag to rotate — yaw and pitch — and scroll to zoom; it auto-centres and scales
to the reconstructed point cloud, draws the bones colour-coded left, right and centre, the joints,
and a floor grid, plus a HUD of the current frame's 3D angles. It reads the 3D frames for the
selected video and applies R_level so the athlete stands upright."

**Keywords:**
- **HTML Canvas** — a browser 2D drawing surface we render the skeleton onto.
- **3D→2D projection** — the math that maps 3D points to screen positions.
- **Three.js** — a popular 3D library we intentionally did NOT use (fewer dependencies).
- **Yaw / pitch** — rotation left-right / up-down of the view.
- **Point cloud** — the set of reconstructed 3D joint positions.
- **Bones** — line segments connecting joints.
- **HUD (heads-up display)** — the overlay panel showing live angle values.

---

## Slide 20 — End-to-end data flow (recap)

**Script:**
"To recap the whole flow in one line: capture → side-by-side MP4 → store in MinIO and MongoDB →
split into left/right → MediaPipe on each → triangulate to 3D millimetres → angles plus leveling
→ store the analysis → synchronized web UI. Two branches: calibration and floor-leveling are done
once, offline, and reused by every recording; everything else runs per clip, on demand, when the
user clicks Extract Kinematics, all server-side, with results cached for the UI."

**Keywords:**
- **Offline / one-time branch** — calibration + leveling, computed once and reused.
- **Per-clip / on-demand branch** — the analysis run for each individual recording.
- **Server-side** — executed on the backend, not in the browser.
- **Cached** — stored results reused without recomputing.

---

## Slide 21 — Known limitations

**Script:**
"Finally, the limitations — I'd rather name these than have them found. Synchronization is
software-level with no genlock, and recording sync is looser than calibration sync. There's no
epipolar check before triangulation, so a MediaPipe left/right label flip could mis-pair joints.
Triangulation is linear DLT with no outlier rejection or bundle adjustment. The 3D path has no
temporal smoothing yet — no Kalman or One-Euro filter. Calibration is about 4.2 pixels now,
evaluated on the fit set, with a heuristic outlier rule. Frame rate is hardcoded to 30 and is
nominal due to duplication. We use presence rather than visibility and have no cross-view
occlusion fallback. And it's single-person, synchronous, with accuracy not yet quantified. Every
one of these has a concrete fix on our roadmap."

**Keywords:**
- **Genlock** — hardware camera synchronization (absent here).
- **Epipolar check** — geometric test to validate left/right correspondences.
- **Label flip** — MediaPipe swapping left/right limb labels when the subject faces away.
- **Bundle adjustment** — joint global optimization of points + cameras (not implemented).
- **Kalman / One-Euro filter** — temporal filters that smooth jittery keypoints over time.
- **Fit-set evaluation** — testing on the same data used to calibrate (weaker than held-out).
- **Frame duplication** — repeating frames to hit a target fps, making fps nominal.
- **Presence vs visibility** — landmark is in-image vs landmark is un-occluded; we use presence.
- **Cross-view occlusion fallback** — using the other camera when one view loses a joint (planned).

---

## Slide 22 — Thank you / Q&A

**Script:**
"That's the system end to end. Happy to go deeper on any stage — the synchronization, the
calibration math, the triangulation, or the app. Questions welcome."

**If cornered on anything:** "I haven't measured/built that yet — here's why it matters and how
I'd approach it." That answer beats a confident wrong one every time.

---

### The three questions most likely to decide the room
1. **"How are the cameras synchronized?"** → software sequential reads, few–tens of ms, error ≈
   speed × Δt; fix = genlock or timestamp+interpolate. (Slide 6)
2. **"How do you match left-joint-j to right-joint-j?"** → by index, trusting MediaPipe; no
   epipolar check yet; a facing-away flip would mis-pair. (Slides 15, 21)
3. **"What's your accuracy in degrees?"** → not yet quantified; plan = DSLR side-on reference +
   goniometer, report mean absolute error. Never invent a number.
