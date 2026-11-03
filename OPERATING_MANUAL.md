# SportPose Operating Manual

Last updated: 3 November 2026

## About this manual

This manual tells an admin, step by step, how to start SportPose, set up the cameras, record or upload a video, and read the results. No technical knowledge is needed. Follow the steps in order the first time.

**What SportPose does.** Two cameras film an athlete from two angles at the same time. The AI finds 18 body points (nose, neck, shoulders, elbows, wrists, fingers, hips, knees, ankles, toes) in each camera. It then combines the two views into a 3D skeleton, and shows joint angles, positions, speeds and distances in millimetres.

**Who can do what.**

| Role | Can do |
| --- | --- |
| Admin | Everything: users, groups, cameras, calibration, recording, uploads, analysis |
| Coach | Record and upload videos, view and analyse their athletes' videos, manage their groups |
| Athlete | View their own videos and analyses |

**How to read the steps.**

- **Bold words** are buttons, menu items or labels exactly as they appear on screen.
- A key in a box like `Space` is a key on the keyboard.
- "Click" means a single left click with the mouse.
- Steps marked **Check:** tell you what you should see. If you don't see it, go to the Troubleshooting section.

## Before you start

Check these once before the first session. Everything is already installed on the SportPose PC.

**Equipment**

| Item | What to check |
| --- | --- |
| SportPose PC | Windows, NVIDIA graphics card, connected to the internet (the app stores users and videos online) |
| Two USB cameras | Both plugged into the PC, lens caps off. Use the same USB ports every time |
| Calibration board | The printed checkerboard on a rigid board, flat, not bent or creased |
| Admin account | An email and password with the Admin role. Ask the SportPose team if you don't have one |

**Room set-up**

1. Fix both cameras on stands or the wall, pointing at the area where the athlete will move. Each camera must see the whole athlete from head to toe.
2. Do not move, turn or bump the cameras after calibrating. If a camera moves, you must calibrate again (see Calibration).
3. Keep the area well lit and avoid strong light shining straight into a camera.
4. Clear the recording area of other people and moving objects. The AI follows the most visible person.

**Close other camera apps.** Zoom, Teams, OBS and the Windows Camera app can hold the cameras and stop SportPose from using them. Close them before you start.

## Starting and stopping the system

SportPose runs as two programs in two black Command Prompt windows: the **server** (the AI and cameras) and the **app** (the web page). Both windows must stay open the whole time you use SportPose. Starting takes about 1 minute.

**Quick start (recommended).** Double-click **start_sportpose.bat** in the FYP folder, or its shortcut on the desktop. Two windows open (**SportPose server** and **SportPose app**), and the browser opens at the login page when the server is ready, after up to 2 minutes. Leave both windows open. If you use the quick start, skip the two "Start" parts below and go to **Open SportPose** only if the browser did not open by itself.

To start by hand instead, follow the steps below.

**Start the server (window 1)**

1. Press the `Windows` key, type `cmd` and press `Enter`. A black window opens.
2. Type this line exactly and press `Enter`:
   - `cd /d C:\Users\neumo\Desktop\Project\FYP\FYP\backend`
3. Type this line and press `Enter`:
   - `.venv\Scripts\activate`
   - **Check:** the line now starts with `(.venv)`.
4. Type this line and press `Enter`:
   - `uvicorn app:app --host 0.0.0.0 --port 8000`
5. Wait until the window shows `Application startup complete`. This takes 20–60 seconds.
6. Leave this window open. Do not close it or type in it.

**Start the app (window 2)**

1. Open a second Command Prompt the same way (`Windows` key, `cmd`, `Enter`).
2. Type this line and press `Enter`:
   - `cd /d C:\Users\neumo\Desktop\Project\FYP\FYP\frontend`
3. Type this line and press `Enter`:
   - `npm run dev`
4. Wait until the window shows `Local: http://localhost:5173`.
5. Leave this window open too.

**Open SportPose**

1. Open Google Chrome or Microsoft Edge.
2. Type `localhost:5173` in the address bar and press `Enter`.
3. **Check:** the **Welcome Back** login page appears.

**Stop SportPose (end of the day)**

1. Stop any live camera feed or recording in the app first.
2. Close the browser tab.
3. Click on each black window and press `Ctrl` + `C`. If it asks `Terminate batch job (Y/N)?`, type `Y` and press `Enter`.
4. Close both windows.

**Restarting.** If the app stops responding, stop both windows as above and start them again. Your videos, users and calibrations are saved online and are not lost.

## Logging in and finding your way around

**Log in**

1. On the **Welcome Back** page, type your email in **Email** and your password in **Password**.
2. Click **Sign in**.
3. **Check:** the **Dashboard** opens. If you see "Invalid email or password", check the spelling and try again; if it keeps failing, see Troubleshooting.

**The menu on the left**

| Menu item | What it is for | Who sees it |
| --- | --- | --- |
| **Dashboard** | Totals, recent videos and what is new since your last login | Everyone |
| **Videos** | Upload a video file, and see, rename or delete past videos | Everyone |
| **Camera** | Live view of both cameras and recording | Everyone |
| **Analysis** | List of all videos; open one to see the AI results | Everyone |
| **Groups** (athletes see **My group**) | Coaches' groups of athletes | Everyone |
| **Calibration** | Measure the cameras' positions so 3D is accurate | Admin only |
| **Users** | Add and remove accounts | Admin only |

**Your account.** Click your name at the bottom left. Choose **Account** to change your picture, name, email or password, or **Logout** to sign out. Always log out before someone else uses the PC.

**Settings.** The gear icon at the top right opens **Account settings** and **Keyboard shortcuts**.

## Users

Only an admin can add or remove accounts. Each person who records, coaches or is filmed should have their own account.

**Add a user**

1. Click **Users** in the left menu.
2. Click **Add User**. The **Add New User** form opens.
3. Optional: click **Click to upload** and choose a photo for the profile picture.
4. Fill in **Full Name**, **Email**, **Password** and **Confirm** (type the same password again).
5. Choose the **Role**: **Athlete**, **Coach** or **Admin** (see the role table at the top of this manual).
6. Click **Add User** at the bottom of the form.
7. **Check:** the message "User created successfully!" appears and the person is in the list.
8. Tell the person their email and password privately.

To stop without saving, click **Cancel**. Nothing is saved, and the form is empty next time you open it.

**Find a user**

- Type part of a name or email in **Search users...**.
- Use the **All Roles** box to show only Admins, Coaches or Athletes.
- Use **Prev**, **Next** or a page number to move through long lists.

**Remove a user**

1. Find the user in the list.
2. Click the bin icon (**Delete user**) on their row.
3. Confirm in the box that opens.

Deleting cannot be undone. Deleting a coach also deletes the groups they run (their athletes then show as unassigned on the Groups page).

**Changing your own details.** Each person changes their own name, email, picture and password under **Account** (click your name at the bottom left).

## Groups

A group is a coach's set of athletes, for example "Sprinters". A coach sees the videos of the athletes in their groups. An athlete can be in more than one group.

Add the coach and the athletes as users first (see Users).

**Create a group**

1. Click **Groups** in the left menu.
2. Admin: in the list of coaches on the left, click the coach the group belongs to. (A coach sees only their own groups and skips this step.)
3. Click **New group**.
4. Type a name in **Group name, e.g. Sprinters**.
5. Click **Create**.

**Add athletes to a group**

1. In the group's box, click **Add athletes**.
2. Tick each athlete to add. Use **Search by name or email** to find them.
3. Click **Add** (the button shows how many you ticked).
4. **Check:** the athletes' names appear in the group's box.

**Other group actions** (icons on the group's box)

| Action | How |
| --- | --- |
| Remove an athlete from the group | Click the small **x** next to their name |
| Rename the group | Click the pencil icon (**Rename**), type the new name, click **Save** |
| Give the group to another coach | Click **Move to another coach** and pick the coach |
| Let athletes see each other | Turn on **Members visible** |
| Delete the group | Click the bin icon (**Delete group**). The athletes are not deleted |

**Unassigned athletes.** The **Unassigned athletes** button at the top right lists athletes who are not in any group yet.

## Cameras

Tell SportPose which camera is on the left and which is on the right. Do this once on a new PC, and again if the USB cables are swapped. Admin only.

Use the camera on your left, as you stand behind the cameras facing the recording area, as **Left**. Once you have calibrated, do not change the choice; if you do, calibrate again.

1. Make sure no live feed, recording or calibration session is running.
2. Click **Camera** (or **Calibration**) in the left menu, then click the **Cameras** button.
3. Click **Scan cameras**. Each camera is opened once; this can take up to 1 minute.
4. **Check:** a snapshot appears for each camera, with its size underneath. Both should be **2560 x 1440**. A size in orange means that camera is the wrong one (for example the PC's own webcam) or its cable is in a slow USB port.
5. Look at the snapshots. Under the left camera's picture, click **Left**. Under the right camera's picture, click **Right**.
6. If they are the wrong way round, click **Swap left / right**.
7. Click **Save**.
8. **Check:** the message "Saved: left = camera ..., right = camera ..." appears.

To confirm, go to **Camera**, click **Start Live Feed**, and check the left picture really is the left camera. Click **Stop Live Feed** when done.

If **Scan cameras** says "No cameras found", check both USB cables and close Zoom, Teams, OBS and the Windows Camera app.

## Calibration

Calibration measures exactly where the two cameras are, so the 3D skeleton comes out in real millimetres. Admin only. It takes about 10–15 minutes and needs two people: one at the PC, one holding the board.

**Calibrate when:** the cameras are set up for the first time, or a camera has been moved, turned or bumped, or the camera size was changed. Otherwise, keep using the saved calibration.

**1. Start a session**

1. Click **Calibration** in the left menu.
2. In **Setup name, e.g. NeuonAI**, type the name of this room or rig (use the same name each time for the same room).
3. Click **New calibration**.
4. **Check:** "Calibration session started." appears, and the live picture shows both cameras side by side with a grid over each.

**2. Capture pairs of the board**

A "pair" is one photo from each camera taken at the same moment.

1. The helper holds the board still, fully inside **both** pictures. Coloured dots appear on the board's corners when it is found.
2. Click **Capture** or press `Space`.
3. Move the board to a new position and angle, hold it still, and capture again.
4. Repeat until all four checks in the **Session** panel turn green (see the table).
5. A blurred or bad photo can be removed with **Undo** (removes the last pair).

You need at least **15 pairs**; **25 or more** is better, and there is no upper limit.

| Check in the Session panel | What it means | How to make it green |
| --- | --- | --- |
| **pairs** | Number of pairs taken | Keep capturing until 25 or more |
| **image covered** (aim 75%+) | How much of each picture the board has been in. Grid boxes turn green once covered | Move the board to the corners, edges and centre of the picture, high and low |
| **tilted left/right** (aim 6+) | Photos with the board turned like a door, 15° or more | Hold the board upright and turn one side edge 25–40° towards the cameras. Do this to both sides |
| **up/down** (aim 6+) | Photos with the board tipped, 15° or more | Tip the top edge 25–40° towards or away from the cameras |
| **near/far size ratio** (aim 1.6+) | Photos close to and far from the cameras | Take some photos near the cameras and some at the far end of the area |

Tips:

- Hold the board completely still for each capture. The cameras are not perfectly in step, so a moving board gives a bad pair.
- Rotating the board flat in the picture, like a steering wheel, does **not** count as a tilt.
- Change the position between captures. Two photos of the same pose add nothing.
- Keep fingers off the black and white squares.

**3. Calibrate**

1. When the checks are green, click **Calibrate**.
2. Wait. It shows **Calibrating** with progress; 100 pairs take about 10–30 seconds on the SportPose PC.
3. **Check:** the **Calibration report** appears. Look for **stereo RMS** below **1.0 px**, and the baseline marked **OK**.
4. The new calibration is saved and becomes the one **In use**.

If the report shows a **WARNING**, capture more tilted, near and far pairs and click **Calibrate** again.

**4. Set the floor**

This tells SportPose which way is up and where the floor is.

1. Lay the board flat on the floor, in the middle of the area where the athlete will stand.
2. Make sure both cameras can see the whole board.
3. Click **Set floor** and wait.
4. **Check:** the floor result shows **OK**. A warning about depth means the calibration should be redone with more tilted photos.

**5. End the session**

Click **End session**. The calibration stays saved and in use.

**Saved calibrations**

The table on the Calibration page lists every saved calibration by setup.

- **Use**: makes that calibration the one in use. Use it when you move the system between rooms that were each calibrated before.
- Pencil icon: renames it or moves it to another setup name.
- **Delete**: removes it.
- **Previous sessions**: reopens an earlier session from its saved photos (for example after the server was restarted mid-session). You can then capture more pairs, calibrate again or set the floor.

## Recording an athlete

Record with both cameras to get the full 3D analysis. Make sure the room has been calibrated (see Calibration).

**Record**

1. Click **Camera** in the left menu.
2. Click **Start Live Feed**. The 2K cameras can take up to 1 minute to open.
3. **Check:** both pictures appear, labelled **Left** and **Right**. If you see **Cameras Offline**, see Troubleshooting.
4. Ask the athlete to stand in the recording area. Check they are fully visible, head to toe, in **both** pictures, and that nobody else is in view.
5. Click **Record Video** or press `Space`. The message "Recording started" appears.
6. The athlete performs the movement. Keep clips short: 5–20 seconds is ideal.
7. Click **Stop & Save** or press `Space` again.
8. Wait while the recording is saved. A box shows **Saving the recording** with a progress bar; this takes a few seconds for a short clip. **Check:** "Recording saved" appears and the Analysis page for this recording opens. The video is copied to cloud storage in the background afterwards; you can carry on straight away.
9. To record again, go back to **Camera**. When finished, click **Stop Live Feed**.

**Analyse the recording**

The recording is saved but not analysed yet.

1. On the Analysis page that opened, click **Analyse video**.
2. A box asks you to pick the calibration. Choose the one for the room it was filmed in (normally marked **In use** or **Used last time**).
3. Wait while the progress bar shows **Analysing the video** and each step (for example "Step 3 of 6: Finding body points"). A 10-second clip takes about 1 minute. You can leave the page; it keeps going.
4. **Check:** "Analysis finished." appears and the results are shown (see Analysis studio).

Picking the wrong calibration gives a twisted or swapped 3D skeleton. If that happens, click **Re-analyze** and pick the right one.

**Good recordings**

- One athlete only in view. Coaches and spectators stay outside both pictures.
- Tight, contrasting clothing works better than loose, baggy clothing.
- Start and end the clip with the athlete standing still for a moment.
- Do not touch or move the cameras between calibration and recording.

## Uploading a video

You can also analyse a video filmed with one camera or a phone. It gives the 2D skeleton and joint angles from that one view, but no 3D.

1. Click **Videos** in the left menu.
2. In the upload area, drag the video file onto it, or click **Choose file** and pick the file.
3. Click **Upload Video**. A progress bar shows the file being sent, then converted.
4. **Check:** "Video uploaded." appears and the video is in **Past Videos**.
5. To analyse it, click **Analysis** in the left menu, click the video, then click **Analyse video** and wait.

Limits:

- **MP4**, **MOV** and **AVI** files can be uploaded. MOV and AVI files (and phone videos) are converted to MP4 automatically while uploading, so a large file takes a little longer.
- Maximum file size: 100 MB (shown under the upload area). A larger file is refused with a message before it is sent.
- One person in view, filmed from head to toe, as for recordings.

## Analysis studio

The Analysis studio shows a video with the AI's skeleton on it, the 3D skeleton and the graphs, all moving together.

**Open a video**

1. Click **Analysis** in the left menu. The list shows every video you are allowed to see.
2. To find one, type in **Search by video name**, choose a person under **Everyone** (who recorded or uploaded it), or tick **Show not analysed**. The **Recorded by** column shows who recorded or uploaded each video and their role (Admin, Coach or Athlete).
3. Click the video's row.
4. If it says "This video has not been analyzed yet", click **Analyse video** and wait about 1 minute per 10 seconds of video.

Under the video's name, the page shows who recorded or uploaded it and their role (for example "Recorded by Ali (Coach)"), and who it belongs to if it was assigned to someone else.

**The panels**

| Panel | What it shows |
| --- | --- |
| **Left camera** / **Right camera** | Each camera's video with the skeleton drawn on it. Solid lines = the AI is sure; thin yellow = less sure |
| **3D reconstruction** | The 3D skeleton. Drag to turn it, scroll to zoom, click **Reset** to go back to the start view, or Full screen to fill the whole screen (press Esc to go back) |
| **Joint angles** | Knee, hip, elbow, shoulder and ankle angles in degrees over time |
| **Position** | Where chosen body points are, in millimetres |
| **Velocity** | How fast chosen body points move, in metres per second |
| **Distance travelled** | How far a body point moves between two moments |

Recordings made with both cameras show all panels. Single-camera uploads show the video and joint angles only.

**Play and move through the video**

- Use the play bar under the panels: play/pause, previous frame, next frame, and drag along the timeline.
- Click a point on any graph to jump the video to that moment. The white line on the graphs marks the frame on screen.
- Above a graph, click the joint names to choose which lines are shown. The switch between **Time (s)** and **Frame** changes the bottom axis.

**Arrange the screen**

- **View** menu (top): tick or untick panels to show or hide them; **Reset layout** puts everything back.
- The **x** on a panel (**Hide panel**) hides it.
- Drag the edge between two panels to make one bigger (**Drag to resize**). **Reset sizes** puts the sizes back.

**Measure a distance (Distance travelled)**

1. Move the video to the start of the movement and click **Set A**.
2. Move to the end and click **Set B**.
3. The panel shows the straight-line distance from A to B and the length of the path travelled. **Whole clip** sets A and B to the first and last frame.

**Processed or raw skeleton.** **Raw** shows the points exactly as the AI found them (with a **Raw detections** label). **Processed** (the default) has left/right mix-ups fixed, hidden joints filled in and the movement smoothed.

**Correct the skeleton by hand**

If a joint is clearly in the wrong place:

1. Click **Edit keypoints**.
2. Pause on the frame, then drag the joint to the right spot in a camera view or in the 3D view. Tick **Keep bone length** to keep the limbs the same length.
3. **Undo** / **Redo** step through your changes. **Revert this joint** or **Revert all** removes corrections.
4. Click **Done** to save, or **Discard** to throw the changes away.

Corrected joints show a ring in the views. Re-analysing a video removes the hand corrections.

**Other actions**

- **Download**: save a camera's video with the skeleton, or without it (no skeleton). Camera recordings download at the full size they were recorded (2560 x 1440); a box shows the progress while the video is prepared.
- **Assign video**: choose which athlete the video belongs to.
- Pencil next to the title (**Edit video name**): rename the video.
- **Re-analyze**: run the AI again, for example with a different calibration.

## Managing videos

All videos are listed under **Videos** (Past Videos) and **Analysis**.

| To | Do this |
| --- | --- |
| See who recorded a video | On **Videos** the name and role appear under the video's name when someone else recorded it; on **Analysis** see the **Recorded by** column |
| See only your own videos | On **Videos**, click **My videos** (or **All videos** for everything you may see) |
| Find a video | Type part of its name in **Search videos...** |
| Rename a video | Open it in Analysis and click the pencil next to its name. Only the name changes; the file type (.mp4) stays |
| Give a video to another athlete | Open it in Analysis and click **Assign video**, then pick the person |
| Download a video | Open it in Analysis, click **Download** and choose the camera, with or without the skeleton. Recordings come at full size |
| Delete a video | On **Videos**, click the bin icon (**Delete video**) on its row, then confirm. This cannot be undone |

Coaches can only assign videos to themselves or to their own athletes. Athletes see only their own videos.

## Settings and keyboard shortcuts

Click the gear icon at the top right.

- **Account settings**: change your picture (5 MB or smaller), name and email with **Edit** then **Save**; change your password under **Password** with **Update password**.
- **Keyboard shortcuts**: see every shortcut, change the key for one, or turn shortcuts off. Use **Search shortcuts** to find one.

Shortcuts do not work while you are typing in a box or while a pop-up window is open. Click on an empty part of the page first.

| Where | Key | Does |
| --- | --- | --- |
| Anywhere | `Tab` then `D` / `V` / `A` / `C` / `G` / `L` / `U` / `S` | Go to Dashboard / Videos / Analysis / Camera / Groups / Calibration / Users / Settings |
| Lists | `↑` `↓`, `Enter` | Move through the rows, open the highlighted row |
| Lists | `Page Up` / `Page Down` | Previous / next page |
| Videos | `U` | Choose a video to upload |
| Videos | `Delete` | Delete the highlighted video |
| Camera | `Space` | Start / stop recording |
| Calibration | `Space` | Capture a pair |
| Analysis | `Space` | Play / pause |
| Analysis | `←` / `→` | Previous / next frame |
| Analysis | `Shift` + `←` / `→` | Back / forward 1 second |
| Analysis | `R` / `End` | Back to the start / last frame |
| Analysis | `1` to `7` | Show or hide each panel |
| Analysis | `E` | Start / stop editing keypoints |
| Analysis | `Ctrl` + `Z` / `Ctrl` + `Enter` | Undo a correction / save corrections |

## Troubleshooting

Try the fix in the right-hand column. If it still fails, take a screenshot of the screen **and** of both black windows, note the time, and send them to the SportPose team.

| Problem | Fix |
| --- | --- |
| `localhost:5173` does not open ("This site can't be reached") | The app window is not running. Start it (Starting the system, window 2) |
| Login says "Invalid email or password" for a correct account | The PC has no internet, or the online database does not accept this network yet. Check the internet; if it is fine, contact the SportPose team (the PC's network address must be allowed) |
| Pages show errors or nothing loads | The server window is not running or has an error. Restart both windows |
| **Cameras Offline**, or the live feed does not start | Check both USB cables. Close Zoom, Teams, OBS and the Windows Camera app. Wait up to 1 minute, then try **Start Live Feed** again. Still failing: restart the server window |
| Left and right pictures are the wrong way round | Use **Cameras** → **Swap left / right** → **Save**, then calibrate again |
| One camera's size shows in orange in **Cameras** | Wrong camera picked (for example the PC's own webcam), or the cable is in a slow USB port. Pick the other camera or move the cable to another USB port on the back of the PC |
| Calibration: the board has no coloured dots | Board not fully in both pictures, too far away, too much glare, or moving. Move it closer, avoid reflections, hold it still |
| Calibration: **Calibrate** stays grey | Fewer than 15 pairs. Capture more |
| Calibration: the tilt counts do not go up | The board is not tilted enough (15° or more). Turn or tip it 25–40°; rotating it flat in the picture does not count |
| The 3D skeleton is twisted, upside down, or arms and legs are crossed | Wrong calibration for this room, or a camera was moved. Pick the right one with **Re-analyze**; if the camera moved, calibrate again and re-analyse |
| Analysis says "The analysis did not finish" | Restart both windows and try again. If it fails again, send the screenshots to the team |
| A joint jumps around or is in the wrong place | The joint was hidden in a camera. Correct it by hand (Analysis studio → Edit keypoints), or record again with a clearer view |
| An uploaded MOV or AVI video does not play | Upload it again: uploads are now converted to MP4 automatically. Videos uploaded before this change must be uploaded again |

## Acceptance test checklist

Work down the list in order and tick each test that passes. For a test that fails, write down what happened and take a screenshot. You need an admin account and one coach account.

**A. Start-up and accounts**

- [ ] Start both windows and open `localhost:5173`; the login page appears
- [ ] Log in as admin; the Dashboard opens
- [ ] Users: add a test coach and a test athlete, each with a photo
- [ ] Users: open **Add User**, pick a photo, click **Cancel**, open **Add User** again: the form and photo are empty
- [ ] Groups: create two groups for the test coach and add the test athlete to **both**; the athlete shows in both

**B. Cameras and calibration**

- [ ] Cameras: **Scan cameras** shows two snapshots, both 2560 x 1440; set Left and Right and **Save**
- [ ] Calibration: start a session and capture more than 25 pairs; the count keeps going past 25
- [ ] Turn the board like a door (25–40°) and capture: **tilted left/right** goes up by 1
- [ ] Tip the board's top edge (25–40°) and capture: **up/down** goes up by 1
- [ ] **Calibrate**: the report shows stereo RMS below 1.0 px
- [ ] **Set floor** with the board flat on the floor: the result shows OK

**C. Recording and analysis**

- [ ] Camera: **Start Live Feed**, **Record Video** for about 10 seconds of movement, **Stop & Save**; the Analysis page opens
- [ ] Saving the recording shows a progress bar and takes seconds, not minutes
- [ ] Analyse the recording: a progress bar shows each step, then "Analysis finished." and all panels show results
- [ ] The video shows "Recorded by" with your name and role
- [ ] Play, pause and step with `←` `→`: the white line on the graphs stays on the frame shown in the videos
- [ ] Make a graph panel bigger and repeat: the white line is still on the right frame
- [ ] 3D: drag to turn, scroll to zoom, **Reset**
- [ ] Right-click a video: no browser menu (no "Enhance video") appears
- [ ] **Download** the video with and without the skeleton: both are 2560 x 1440
- [ ] Rename a video: only the name can be changed, not ".mp4"

**D. Uploads**

- [ ] Upload an MP4 on **Videos**: a progress bar shows the upload; it plays and can be analysed
- [ ] Try a file over 100 MB: it is refused with a message straight away

**E. Permissions**

- [ ] Log out, log in as the test coach: only the coach's own and their athletes' videos show, and **Calibration** and **Users** are not in the menu
- [ ] Log out, log in as admin again: everything is visible again

**F. Shortcuts**

- [ ] Try each shortcut in the Settings and keyboard shortcuts table. Write down any that do nothing

**G. Recently fixed**

- [ ] Upload a MOV and an AVI video: both upload, play, and can be analysed; the name ends in .mp4
- [ ] 3D view: click Full screen; the 3D fills the screen, Esc goes back
- [ ] Graphs: scroll to zoom right in; the lines stay drawn to the edges of the graph
- [ ] The left menu no longer has a search box
