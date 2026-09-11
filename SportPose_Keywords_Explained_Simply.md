# SportPose — Every Keyword Explained Simply

A beginner-friendly companion to the deck. No IT background needed. Each term is explained in
plain English, with an everyday comparison, and tied to what its slide is about.

**The big picture first (read this once):** We point **two cameras** at an athlete, like a pair
of eyes. Special software finds the person's **joints** (shoulders, knees, elbows) in each
camera's picture. Because we have two views, we can work out the joints' real positions in **3D
space** — just like your two eyes let you judge how far away things are. From those 3D positions
we measure **joint angles** (e.g. how bent a knee is) and show them on a website.

---

## Slide 1 — Title slide

*What it's about: the name and one-line description of the project.*

- **AI (Artificial Intelligence)** — computer software that has "learned" to do a task by looking
  at millions of examples, the way your phone learned to recognise faces. Here, AI is used to spot
  body joints in the video.
- **AI-Driven** — just means "part of this system uses that smart, learned software."
- **Spatial** — anything to do with *space* and *position*: where the body is in 3D.
- **Temporal** — anything to do with *time*: how the body changes from one video frame to the next.
- **Spatial–Temporal** — tracking the body through space, over time.
- **Occlusion** — when one body part hides another, like an arm passing in front of the chest so a
  camera can't see the chest.
- **Occlusion-robust** — trying to keep working even when parts are briefly hidden.
- **Pose** — the body's posture: the arrangement of all its joints at one moment.
- **Pose estimation** — the computer's best guess of that posture from a picture.
- **Markerless motion capture** — recording how a body moves *without* sticking special dots or
  wearing a sensor suit (older systems needed those).
- **Stereo** — using *two* cameras, like two eyes, so we can judge depth/distance.
- **Metric 3D** — 3D positions given in real-world units (millimetres), like measuring with a ruler.
- **Monocular depth** — depth guessed from a *single* camera; like closing one eye and guessing how
  far away something is — possible, but unreliable. We avoid relying on this.
- **Kinematics** — the study of movement itself (positions, angles, speeds), without worrying about
  muscles or forces.
- **Calibration** — a one-time setup where the system learns exactly how the two cameras are
  arranged, so its measurements are accurate (like tuning an instrument before a concert).
- **Triangulation** — working out a point's real 3D position by combining what *both* cameras see
  (explained more later).

---

## Slide 2 — "System & Setup" (section divider)

*What it's about: a chapter heading for the physical setup.*

- **Camera rig** — the fixed arrangement of the two cameras (where they're mounted and aimed).
- **Capture** — the act of recording the video from the cameras.
- **Synchronization** — making sure the two cameras' pictures are taken at the *same moment*, so
  they truly match. (Imagine two photographers told to shoot "now" — sync is how close their "now"s
  really are.)

---

## Slide 3 — End-to-end pipeline

*What it's about: the 8 steps the system goes through, start to finish.*

- **Pipeline** — a series of steps done in order, like an assembly line in a factory.
- **Intrinsics** — a camera's own internal settings, mainly its zoom/focal length and the exact
  centre of its lens. (Every camera is slightly different, like every pair of glasses.)
- **Distortion** — the way a lens slightly bends straight lines (edges of a photo can look curved).
  We measure it so we can undo it.
- **R and T (rotation and translation)** — the two numbers that describe how the *right* camera is
  turned and how far it sits from the *left* camera. Together they capture "where one camera is
  relative to the other."
- **Checkerboard** — a printed chessboard pattern used as a measuring reference during calibration,
  because its squares are a known, exact size.
- **Keypoints** — the specific body-joint dots the software finds (we use 18 of them).
- **Metric 3D (mm)** — again: real 3D positions in millimetres.
- **Left-cam frame** — we treat the left camera as the "origin" (the zero point), and describe all
  3D positions relative to it, like measuring a room starting from one corner.
- **Metadata** — extra labels saved *about* a video (e.g. "this is a two-camera recording"), not the
  video itself. Like the label on a folder telling you what's inside.
- **MP4** — a common video file type (the kind your phone records).
- **MinIO** — the storage system where we keep the video files (think: a big digital filing cabinet).
- **MongoDB** — the database where we keep the labels and results (think: an organised index/logbook).

---

## Slide 4 — Physical camera rig (top-down)

*What it's about: a map of the room showing where the two cameras are.*

- **Baseline** — the distance between the two cameras (about 3.6 m here). Like the gap between your
  two eyes — a bigger gap helps judge distance, but also makes the setup trickier.
- **Capture volume** — the area of the room where the athlete stands and *both* cameras can see them
  (the red box on the map).
- **Convergent / verged rig** — the two cameras are angled *inward* to look at the same spot, rather
  than pointing straight ahead in parallel.
- **Optical axis** — the imaginary straight line pointing out of the middle of a lens; basically
  "which way the camera is aiming."
- **Overlapping field of view** — the region both cameras can see at the same time. Only here can we
  do 3D, because 3D needs both views.
- **Depth precision** — how accurately we can tell how far away something is.
- **Correspondence** — matching the *same* real point (say, the left knee) in both camera pictures.
- **Coordinate frame** — the set of reference directions (up/down, left/right, forward/back) we use
  to give 3D positions. Like agreeing on "north" before giving directions.
- **Floor-leveling** — a correction so the person appears standing upright on screen, even though the
  cameras are tilted downward.

---

## Slide 5 — Capture modes & signal path

*What it's about: what kind of cameras we use and the journey the video takes.*

- **USB webcam** — an ordinary computer camera that plugs in with a USB cable.
- **OpenCV** — a free, widely-used software toolkit for working with images and video. We use it to
  grab and process the camera pictures.
- **DirectShow** — the built-in Windows plumbing that lets software talk to cameras.
- **MJPG / MJPEG** — a simple video format where every frame is just a JPEG photo (the everyday image
  format). Handy for live streams.
- **720p / 1280×720** — the picture size (resolution): 1280 dots wide by 720 tall.
- **Buffer** — a small waiting area for data. "Buffer size 1" means we keep only the newest picture
  and throw away old ones, so the live view isn't delayed.
- **Config** — short for "configuration": adjustable settings (here, which camera is left vs right).
- **Signal path** — the route the video takes from camera to storage, step by step.
- **Grab thread** — a background worker in the program that continuously pulls pictures from the
  cameras. (A "thread" is just a task running in the background while other things happen.)
- **Compose side-by-side** — glue the left and right pictures together into one wide picture.
- **Live preview** — the real-time video you watch on screen while recording.
- **VideoWriter** — the part of the software that saves the pictures into a video file.
- **Upload** — send a file from this computer to the storage system.

---

## Slide 6 — Capture & synchronization

*What it's about: how we pair up the two cameras' frames in time — and the main weakness.*

- **Thread** — a task the program runs in the background (mentioned above).
- **Sequential reads** — reading the two cameras *one after the other* (left, then right), not at the
  exact same instant. This is why there's a tiny time gap.
- **Last-good frame** — the most recent clear picture from each camera, kept so we always have a pair
  to use.
- **Timestamp** — a time-stamp label saying when a picture was taken.
- **MJPEG multipart stream** — the technical way the live preview is sent to the screen (a continuous
  series of JPEG photos).
- **Genlock** — a hardware trick that forces two cameras to shoot at the *exact* same instant. We
  don't have it; that's the limitation.
- **Software sync** — doing the timing in the program instead of with special hardware — good, but
  not perfectly precise (off by a few thousandths of a second).
- **Δt (delta-t) / time offset** — the tiny time gap between the left and right pictures in a pair.
- **grab() / retrieve()** — a two-part way OpenCV takes a picture: "grab" quickly marks the moment,
  "retrieve" fetches the image. Doing "grab" on both cameras first gives tighter timing.
- **Interpolation** — estimating an in-between value; here, calculating what a frame *would* look like
  at a matching time to line the two cameras up (a planned improvement).

---

## Slide 7 — Recording & storage

*What it's about: how the recording is saved and where.*

- **Composite frame** — the single wide picture that holds both the left and right views together.
- **cv2.hconcat** — the specific OpenCV command that joins two pictures side by side ("horizontal
  concatenate" = stick together left-to-right).
- **Wall-clock pacing** — timing the recording against a real clock on the wall, so the saved video
  ends up the correct length.
- **Frame duplication** — repeating the last picture a few times if needed to keep the timing right.
- **Nominal fps** — "fps" = frames per second (how many pictures per second). "Nominal" means the
  *intended* rate, which might not exactly match reality.
- **Zero-velocity artifact** — a repeated frame looks like a moment where the person didn't move at
  all — a small side effect to be aware of.
- **Object store** — storage designed for big files like videos (our MinIO filing cabinet).
- **UUID** — a long random code used as a unique filename, so no two files clash. (Like giving every
  video its own barcode.)
- **Presigned URL** — a temporary web link that lets the browser open a stored video for a limited
  time (ours last one hour) without needing any password. Like a guest pass that expires.
- **Database** — an organised store for information you can search and update (our MongoDB logbook).
- **Metadata tagging** — attaching descriptive labels to each video so we can find and route it later.

---

## Slide 8 — "Calibration" (section divider)

*What it's about: a chapter heading for teaching the system the camera geometry.*

- **Calibration** — the one-time measuring step that learns exactly how the two cameras see the world
  and how they're positioned relative to each other. Without it, 3D measurements would be wrong.
- **Geometry** — here, the shapes, angles and distances involved — where the cameras are and how their
  views relate.

---

## Slide 9 — Calibration procedure

*What it's about: the 7 steps to calibrate the cameras.*

- **Checkerboard (9×6 inner corners)** — the printed chessboard target; "inner corners" are the points
  where four squares meet inside the board (a board of 10×7 squares has 9×6 of those inner crossings).
- **40 mm squares** — each square is 40 mm wide; telling the software this real size is what lets it
  measure in real millimetres.
- **Metric scale** — real-world sizing, set by that known square size.
- **findChessboardCorners** — the software command that automatically locates the board's corners in a
  picture.
- **Sub-pixel / cornerSubPix** — pinning down a corner's location even more precisely than a single
  dot (pixel) on the screen — for extra accuracy.
- **Pixel** — one tiny dot of a digital image; pictures are grids of millions of pixels.
- **calibrateCamera** — the command that works out one camera's internal settings (K and D below).
- **K (intrinsics matrix)** — a small table of numbers holding the camera's zoom and lens-centre.
- **D (distortion coefficients)** — the numbers describing that lens-bending we undo.
- **RMS** — a single score summarising how accurate the calibration is; **lower is better** (we aim
  below 1). Think of it as an error grade.
- **stereoCalibrateExtended** — the command that works out how the two cameras relate (R and T) *and*
  reports how good each snapshot was.
- **FIX_INTRINSIC** — a setting that says "keep each camera's own settings fixed while working out how
  they relate."
- **R, T** — again: rotation and translation between the cameras.
- **Per-pair errors** — an accuracy score for *each* snapshot pair, so we can spot bad ones.
- **calibration.npz** — the saved file that stores all the calibration results for later use.
- **R_level** — the extra "make it stand upright" rotation, also saved in that file.

---

## Slide 10 — How bad image pairs are removed

*What it's about: quality control — throwing out bad calibration snapshots.*

- **Gate** — a checkpoint that lets good data through and blocks bad data.
- **Reprojection error** — the key accuracy check: take the 3D result, "project" it back onto the
  photo, and measure how many pixels it misses the real corner by. Small miss = good.
- **Median** — the middle value in a list (half are above, half below). It's a fair "typical" value
  that isn't thrown off by one weird extreme.
- **Threshold** — a cut-off line. Here: drop any snapshot whose error is worse than 1.5× the median
  (with a floor of 1 pixel).
- **Outlier** — an odd one out; a snapshot with unusually large error compared to the rest.
- **Robust estimator (MAD / z-score)** — a more statistically rigorous way to spot outliers. We use a
  simpler rule of thumb and honestly say a stronger one would be better.
- **Held-out set** — data you deliberately *don't* use while setting up, kept aside to fairly test the
  result. We don't have one yet (an honest limitation).

---

## Slide 11 — Quality metrics & the wide-baseline challenge

*What it's about: our real accuracy numbers and why they're not perfect yet.*

- **Stereo RMS** — the overall accuracy grade for the two-camera calibration (we're at ~4.2; aiming
  under ~1–1.5).
- **|T| (baseline)** — the measured distance between the cameras; should match the real 3.6 m.
- **Sanity-check band (±15%)** — an automatic warning if the calculated distance is more than 15% off
  the real one — a safety net that flags a bad calibration.
- **Convergence angle** — how sharply the two cameras are angled toward each other.
- **Foreshortening** — when something viewed at a steep angle looks squashed (like a door seen edge-on).
- **Per-camera vs stereo RMS** — each camera scored well alone but the pair scored poorly, which tells
  us the problem is *timing/matching between* the cameras, not the lenses.

---

## Slide 12 — Floor leveling

*What it's about: making the 3D skeleton stand upright.*

- **Plane** — a flat surface (here, the floor).
- **Plane normal** — the "straight up" direction sticking out of a flat surface. For the floor, it
  points to the ceiling — i.e. "up."
- **Plane fit** — finding the best flat surface through a set of measured points.
- **Vertical axis** — the up-and-down direction we want "up" to line up with on screen.
- **Rotation-invariant** — a value that doesn't change if you rotate the whole scene. Joint *angles*
  are like this — that's why leveling changes how the skeleton *looks* but not the *numbers* we report.
- **R_level** — the leveling rotation, applied to every 3D result.

---

## Slide 13 — "The 3D Pipeline" (section divider)

*What it's about: a chapter heading for turning pictures into 3D angles.*

*(No new terms — "3D" = three-dimensional, having depth as well as width and height.)*

---

## Slide 14 — 2D pose estimation (per view)

*What it's about: finding the body joints in each camera picture.*

- **2D** — two-dimensional: a flat picture, with only width and height (no depth yet).
- **MediaPipe Pose Landmarker** — Google's ready-made smart software that finds body joints in a
  picture. We use it as-is (we didn't build or train it).
- **Model** — the "trained brain" file the software uses to recognise joints.
- **Tasks API** — the standard way to run MediaPipe's tools. ("API" = a defined way for programs to
  talk to a piece of software — like a menu of commands you can order from.)
- **VIDEO running mode** — telling MediaPipe it's processing a video (a sequence of frames in order),
  not a single photo.
- **Frame** — one still picture out of the many that make up a video.
- **BGR → RGB** — swapping the colour ordering of a picture (Blue-Green-Red to Red-Green-Blue),
  because different tools expect different orders. A small technical housekeeping step.
- **Landmark** — one joint point the model outputs (MediaPipe gives 33; we condense to 18).
- **Remap** — relabel/pick from MediaPipe's 33 points to get our 18-point set.
- **Synthesized neck** — a neck point we *calculate* (the midpoint between the two shoulders), because
  MediaPipe doesn't provide one.
- **Normalized coordinates (0–1)** — positions given as fractions of the picture's size instead of
  pixels (0 = far left/top, 1 = far right/bottom). This keeps the maths tidy regardless of picture size.
- **Presence** — MediaPipe's confidence (0 to 1) that a joint is actually there. We ignore joints it's
  unsure about.
- **Temporal healing** — an optional smoothing step over time to fix jitter and gaps. It's currently
  turned off on the 3D path (an honest limitation).
- **MediaPipe's z (monocular, relative)** — MediaPipe also guesses depth from one camera, but it's a
  rough, relative guess. We ignore it and get real depth from our two cameras instead.

---

## Slide 15 — Paired 2D → metric 3D (triangulation)

*What it's about: combining the two flat views into real 3D positions.*

- **Triangulation** — the core trick: each camera gives a *direction* to a joint (a line of sight);
  where the two lines cross in space is the joint's real 3D position. Just like your two eyes crossing
  on an object to sense its distance.
- **undistortPoints** — a step that first cleans the lens-bending and camera-settings out of the
  points, leaving clean directions.
- **Camera ray** — the straight line from a camera through a point in its picture out into the world.
- **Projection matrix (P1, P2)** — a compact table of numbers describing how each camera maps the 3D
  world onto its flat picture. P1 is the left camera, P2 the right (built from R and T).
- **Identity [I|0]** — a "do-nothing" reference; since the left camera is our zero point, its
  projection is the plain reference.
- **triangulatePoints** — the OpenCV command that actually crosses the two lines to get the 3D point.
- **DLT (Direct Linear Transform)** — the specific mathematical method used to solve that crossing. A
  standard, fast approach.
- **Homogeneous coordinates** — a maths convenience that adds an extra number to make the calculation
  a simple straight-line (linear) problem; you divide it out at the end to get the normal 3D point.
- **Left-camera frame, in mm** — the answer is given relative to the left camera, in millimetres.
- **Confidence 0.5** — if either camera is less than 50% sure about a joint, we don't guess.
- **NaN ("not a number")** — a placeholder meaning "no reliable value here" — a deliberate blank rather
  than a wrong number.
- **Algebraic error / outlier rejection / bundle adjustment / epipolar check** — names of *more
  advanced* accuracy techniques we don't currently use; we list them honestly as possible improvements.
  (Epipolar check = a geometric test to make sure the left and right cameras are looking at the *same*
  joint, not two different ones.)

---

## Slide 16 — 3D joint angles

*What it's about: turning 3D joint positions into angles like "knee bent 120°."*

- **Vector** — an arrow with a direction and length; here, from one joint to a neighbouring joint.
- **Dot product** — a simple calculation that combines two arrows; from it you can get the angle
  between them. (You don't need the maths — just know it gives the angle.)
- **arccos (inverse cosine)** — the final maths step that turns that combination into an actual angle
  in degrees.
- **Joint angle** — how bent a joint is (e.g. a straight knee ≈ 180°, a deep squat is much less).
- **Invariant to scale** — the angle stays the same even if the whole body model is sized wrong. So a
  size mistake doesn't corrupt our main output.
- **Invariant to global rotation** — the angle stays the same even if the whole scene is tilted. So
  camera tilt / leveling doesn't corrupt the angles either. (This is a big strength.)
- **Facing-direction normalization / anatomical convention** — small adjustments the *2D* version needs
  to handle left-vs-right facing and to present angles the way clinicians expect; the 3D version
  doesn't need them.

---

## Slide 17 — Storing the results

*What it's about: what happens on the server when you click "Extract Kinematics."*

- **Server** — a powerful computer (not your own) that does the heavy work and stores data centrally.
- **process-video request** — the instruction sent to the server to analyse one clip. (A "request" is
  simply a message asking the server to do something.)
- **Temp file** — a temporary file used briefly during processing, then deleted.
- **Route** — the decision of *which* path a clip takes (the two-camera 3D path, or the simpler flat 2D
  path), based on its labels.
- **Overlay video** — the output clip with the skeleton drawn on top of the athlete.
- **Synchronous** — the work happens *while you wait*, holding up that request until it's finished. Fine
  for one user; a bottleneck for many (an honest limitation).
- **pose_analysis document** — the record in the database holding all the results for one video.
- **frames / frames_3d** — the per-frame flat (2D) results that drive the graph / the per-frame 3D
  results that drive the 3D viewer.
- **Upsert** — "update or insert": update the record if it exists, otherwise create it.

---

## Slide 18 — Frontend & time synchronization

*What it's about: the website screen the user sees, and keeping its parts in step with the video.*

- **Frontend** — the part of the software you actually see and click (the website in your browser). The
  opposite is the "backend" (the behind-the-scenes server).
- **SPA (single-page application)** — a website that updates smoothly in place without reloading the
  whole page each time (like a modern app).
- **Panel** — one section of the screen (here: the video, the 3D skeleton, and the graph).
- **Event** — a little "something happened" signal inside the software. Here the video sends a
  "sync-time" signal saying "we're now at 4.2 seconds."
- **currentTime** — the video's current playback position, in seconds.
- **Marker line** — the vertical line on the graph showing where you are in the video.
- **requestAnimationFrame** — a browser feature that runs a small update every time the screen redraws
  (about 60 times a second) — used to keep everything smooth.
- **Throttling** — deliberately limiting how often something runs (here ~20 times a second) so it
  doesn't overload the browser.
- **Cache** — a temporary held copy of data so you don't have to fetch it again. "Invalidating" the
  cache means "this copy is stale, go get fresh data."
- **Refetch** — go and get the data again from the server.
- **Presigned playback URL** — the temporary link the video player uses to stream the clip (same guest-
  pass idea as before).

---

## Slide 19 — The 3D skeleton viewer

*What it's about: the interactive 3D stick-figure on screen.*

- **HTML Canvas** — a blank drawing area on a web page that programs can draw shapes onto. We draw the
  skeleton here.
- **3D → 2D projection** — the maths that flattens a 3D scene onto your flat screen (the same reason a
  photo of a room looks 3D even though it's flat).
- **Three.js** — a popular ready-made 3D graphics library. We deliberately did *not* use it, to keep
  things simple and lightweight — we drew the 3D ourselves.
- **Yaw / pitch** — turning the view left-right (yaw) and tilting it up-down (pitch); you do this by
  dragging with the mouse.
- **Zoom** — moving closer/further; you do this by scrolling.
- **Point cloud** — the collection of 3D joint dots that make up the reconstructed body.
- **Bones** — the lines drawn between joints to make it look like a skeleton.
- **HUD (heads-up display)** — the little info panel showing the live angle numbers, like the stats
  overlaid in a video game.

---

## Slide 20 — End-to-end data flow (recap)

*What it's about: a one-line recap of the whole journey, split into two branches.*

- **Data flow** — the path information takes through the system, step by step.
- **Offline, once** — done a single time in advance (the calibration and leveling), then reused.
- **Per clip, on demand** — done fresh for each recording, only when you ask for it.
- **Extract Kinematics** — the button that starts the analysis of a clip.
- **Server-side** — done on the central server, not in your browser.
- **Cached** — saved so it doesn't have to be recalculated next time.

---

## Slide 21 — Known limitations

*What it's about: the honest list of current weaknesses (naming them shows you understand your system).*

- **Genlock** — hardware camera sync we don't have (so timing is slightly imperfect).
- **Epipolar check** — the geometric "are both cameras looking at the same joint?" test we don't do yet.
- **Label flip** — the risk that the joint-finder swaps "left" and "right" when the person faces away,
  which could mismatch joints.
- **Bundle adjustment** — an advanced accuracy-boosting calculation we don't do.
- **Kalman / One-Euro filter** — well-known techniques to smooth out jittery tracking over time; not
  added yet.
- **Fit-set evaluation** — we currently test the calibration on the same data we set it up with, rather
  than fresh data (less rigorous).
- **Frame duplication** — repeating frames to hit a target frame rate, which makes the rate only
  approximate.
- **Presence vs visibility** — MediaPipe offers two confidence signals: "is the joint in the picture"
  (presence, which we use) vs "is the joint un-hidden" (visibility). For hidden joints, visibility
  might be the better choice — an honest point.
- **Cross-view occlusion fallback** — using the *other* camera when one camera loses sight of a joint.
  A natural strength of two cameras that we haven't fully used yet.
- **Single person** — the system handles one athlete at a time, not crowds.
- **Accuracy not yet quantified** — we haven't yet measured our error in degrees against a trusted
  reference (a planned test).

---

## Slide 22 — Thank you / Q&A

*What it's about: closing and inviting questions.*

- **Q&A** — "questions and answers": the discussion after the talk.

---

### If someone throws a term at you that isn't here
It's fine to say: *"I want to make sure I explain that accurately — could you clarify what you mean?"*
Asking for clarity is a sign of understanding, not weakness. And for anything you genuinely don't
know: *"I haven't measured/built that yet — here's how I'd approach it."*
