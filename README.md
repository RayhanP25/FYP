# SportPose

Stereo-camera pose analysis: two USB cameras record an athlete, ViTPose finds 18 keypoints in each view,
and the backend triangulates them into a 3D skeleton. A React web app is used to record, review, edit
and compare.

- `backend/` is the FastAPI server, the pose pipeline (mmpose / mmdet / PyTorch) and camera capture.
- `frontend/` is the React + Vite web app.

Data lives in MongoDB Atlas (users, analyses, calibrations). Videos live in Cloudflare R2, accessed
through the MinIO client.

---

## 1. What the PC needs

| | |
|---|---|
| OS | Windows 10 or 11, 64-bit |
| GPU | NVIDIA, RTX 20-series or newer (tested on RTX 40/50-series). **Driver 570 or newer**: run `nvidia-smi` and check "Driver Version" at the top |
| Node.js | **22 LTS** (Vite 7 needs Node 20.19+ or 22.12+). Download from https://nodejs.org |
| Git | https://git-scm.com/download/win |
| uv | Python and venv manager, installed in step 3. It downloads its own Python 3.10, so whatever Python the PC already has does not matter |
| Internet | Needed for the install, for the first backend start (detector weights download once), and always for MongoDB Atlas and R2 |
| Disk | About 8 GB (the venv is about 6 GB, mostly PyTorch + CUDA) |

You do **not** need conda, the CUDA toolkit, Visual Studio or a system-wide Python install.

## 2. Get the code

```bat
cd /d D:\
git clone https://github.com/RayhanP25/FYP.git
cd FYP
git checkout feature/keypoint-distance-measurement
```

(Use whichever branch is current; `main` may be behind.)

### Files that are not in git (copy them in by hand)

| File | Where it goes | What it is |
|---|---|---|
| `best_coco_AP_epoch_24.pth` (about 360 MB) | `backend\models\` | The trained ViTPose model. Without it the backend cannot analyse |
| `.env` | `backend\` | Database, storage and camera settings, see step 4. **Never commit it or paste it anywhere** |
| `.env` | `frontend\` | One line: `VITE_API_URL=http://localhost:8000` |
| *(optional)* `rtmdet_tiny_8xb32-300e_coco_20220902_112414-78e30dcc.pth` | `%USERPROFILE%\.cache\torch\hub\checkpoints\` | Person-detector weights. Downloaded automatically on the first start; copy it only if the PC will be offline at that point |

## 3. Backend: install with a venv

Open a normal **Command Prompt** (not the Anaconda/Miniconda prompt).

**Install uv** (once per PC), then close the window and open a new one so `uv` is found:

```bat
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

If PowerShell scripts are blocked, download `uv-x86_64-pc-windows-msvc.zip` from
https://github.com/astral-sh/uv/releases instead, unzip it, and put `uv.exe` on the PATH.

**Create the venv and install the packages.** The download is several GB and takes 10–20 minutes:

```bat
cd /d D:\FYP\backend
set UV_LINK_MODE=copy
uv venv --python 3.10 .venv
.venv\Scripts\activate
uv pip install -r requirements-venv.txt --index-strategy unsafe-best-match
uv pip install --no-deps mmpose==1.3.2
```

- `--index-strategy unsafe-best-match` lets uv take PyTorch from the PyTorch index and everything else
  from PyPI.
- mmpose is installed with `--no-deps` because it lists `chumpy`, which no longer builds and is never
  used. Its real dependencies are already in `requirements-venv.txt`.
- `set UV_LINK_MODE=copy` only hides a harmless warning when the venv and uv's cache are on different
  drives.

**Check the GPU is visible:**

```bat
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

It should print `2.7.1+cu128 True NVIDIA GeForce ...`. If it says `False`, update the NVIDIA driver
(step 1).

**Check the models load** (the first time, this downloads the detector weights):

```bat
python -c "import pose_estimator as p; p._load_models(); print('models OK')"
```

It should show `pose: mmcv-lite detected, using torchvision NMS`, `pose: running on GPU ...` and
`models OK`. Warnings about `weights_only`, `data_preprocessor.mean/std`, the "mmdet" registry scope or
`LocalVisBackend` are normal.

#### Why mmcv-lite?

RTX 50-series cards need PyTorch 2.7+ with CUDA 12.8, and there is no prebuilt full `mmcv` for that
version on Windows; building one needs Visual Studio and the CUDA toolkit. The venv therefore uses
`mmcv-lite`, the official pure-Python mmcv build. `backend/mmcv_ext_shim.py` supplies the one compiled op
the pipeline needs (non-maximum suppression in the person detector) through torchvision, which gives the
same result. With a full mmcv installed (an old conda env) the shim does nothing.

## 4. Backend: configure `backend\.env`

Start from `backend\.env.example` (`copy .env.example .env`) and fill in the real values. Get the
secrets from the team **privately**: never put them in git, chats or screenshots.

| Setting | Meaning |
|---|---|
| `DATABASE_URI` | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `DATABASE_NAME` | `sportPoseDB` |
| `JWT_SECRET_KEY` | Long random string used to sign logins. Use the same one as the other installs if users should stay signed in across them |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login lifetime, e.g. `30` |
| `MINIO_API` | Cloudflare R2 endpoint **without** `https://`, e.g. `<account-id>.r2.cloudflarestorage.com` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | R2 API token keys |
| `MINIO_BUCKET` | Video bucket, default `sport-pose-videos` |
| `CAMERA_LEFT_INDEX` / `CAMERA_RIGHT_INDEX` | Which cameras are left and right, usually `1` and `2` (see step 7) |
| `CAMERA_WIDTH` / `CAMERA_HEIGHT` | Capture size: `2560` x `1440` for the 2K cameras |
| `CAMERA_FPS` | `30` |
| `CAMERA_OPEN_TIMEOUT_SEC` | `120`: 2K cameras can take a while to open |
| `POSE_DET_EVERY` | `10`: how often the person detector re-runs (every N frames) |
| `POSE_FP16` | **`1`**: half precision on the GPU. Much faster with practically the same keypoints, but it defaults to off, so set it |

All the other settings (`POSE_*`, `CAMERA_*`, `CALIB_*`, `VIDEO_GPU`, ...) have sensible defaults and can
stay unset. If you change the camera resolution, calibrate again: a calibration only fits the resolution
it was made at.

### MongoDB Atlas: allow this PC

Atlas only accepts connections from listed IP addresses. In the Atlas web console go to
**Network Access → Add IP Address** and add this PC's public IP (the "Add current IP" button does it when
opened on this PC). Without it the backend fails with `TLSV1_ALERT_INTERNAL_ERROR` or a timeout, and
logins say "Invalid email or password".

## 5. Frontend: install

```bat
cd /d D:\FYP\frontend
npm install
```

Make sure `frontend\.env` contains `VITE_API_URL=http://localhost:8000`.

## 6. Run

Use two Command Prompt windows.

**Backend:**

```bat
cd /d D:\FYP\backend
.venv\Scripts\activate
uvicorn app:app --host 0.0.0.0 --port 8000
```

(Add `--reload` while developing so code changes restart it.)

**Frontend:**

```bat
cd /d D:\FYP\frontend
npm run dev
```

Open **http://localhost:5173** in the browser. Use `npm run dev`, not `npm start`: the backend only
accepts the app from port 5173, and `npm start` serves it on 3000, so every request would be blocked.

## 7. First-time setup on a new PC

1. **Log in** with an admin account. Users are in the shared database, so existing accounts work.
2. **Cameras:** plug in both USB cameras, stop the backend, and run this in the activated venv:
   ```bat
   cd /d D:\FYP\backend
   python probe_cams.py
   ```
   It lists the camera indices that work and saves a `probe_*.jpg` snapshot from each, so you can see
   which camera is which. Set `CAMERA_LEFT_INDEX` / `CAMERA_RIGHT_INDEX` in `backend\.env` (with a
   built-in laptop camera the USB ones are often 1 and 2). Start the backend and check the live feed on the
   **Camera** page. If left and right are the wrong way round, swap the two numbers.
3. **Calibration:** the calibration must match *these* cameras in *this* position. On the
   **Calibration** page, enter the setup name (e.g. the room), click **New calibration**, capture at least
   15 pairs of the checkerboard (25+ is better), click **Calibrate**, then lay the board flat where the
   athlete stands and click **Set floor**. Saved calibrations are shared through the database; **Use**
   switches between them. Recalibrate whenever a camera is moved or bumped.
4. **Test:** record a short clip on the Camera page, open it in Analysis, and check the 3D skeleton.

## 8. Updating

```bat
cd /d D:\FYP
git pull
cd backend
.venv\Scripts\activate
uv pip install -r requirements-venv.txt --index-strategy unsafe-best-match
cd ..\frontend
npm install
```

Then restart both windows.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `torch.cuda.is_available()` is `False`, or the log says `running on CPU` | Update the NVIDIA driver to 570+, and make sure the venv is activated (`where python` should point into `backend\.venv`) |
| `ModuleNotFoundError: No module named 'pkg_resources'` | `uv pip install setuptools==75.8.2` |
| `ModuleNotFoundError: mmpose` | `uv pip install --no-deps mmpose==1.3.2` |
| `RuntimeError: mmcv op '...' needs the compiled mmcv` | A feature needs an mmcv op the shim doesn't supply. Note the op name and report it |
| Login says "Invalid email or password" for a known account | Usually Atlas Network Access (step 4) or a wrong `DATABASE_URI` |
| Requests blocked (CORS) in the browser console | The app must be opened at `http://localhost:5173` (`npm run dev`) |
| Videos don't play, or uploads fail | Check the `MINIO_*` values (R2 endpoint without `https://`), and restart the backend after editing `.env` |
| Camera page shows "Cameras offline" | Wrong `CAMERA_*_INDEX`, or another app (Zoom, OBS, Windows Camera) is using the camera |
| 3D looks twisted, or every joint is swapped left/right | The active calibration is for a different setup. Calibrate this setup, or **Use** the right one on the Calibration page, then **Re-analyze** |
| `cd D:\...` doesn't change folder | Use `cd /d D:\...` when switching drives |
