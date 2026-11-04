import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';

type Role = 'admin' | 'coach' | 'athlete';
type Block = { title: string; text: string; gif: string; steps?: string[]; link?: { label: string; to: string }; roles?: Role[] };
type Page = { id: string; title: string; intro: string; introByRole?: Partial<Record<Role, string>>; blocks: Block[]; roles?: Role[] };

const ADMIN: Role[] = ['admin'];
const STAFF: Role[] = ['admin', 'coach'];
const ATHLETE: Role[] = ['athlete'];

const PAGES: Page[] = [
    {
        id: 'start-here',
        title: 'Start here',
        intro: 'Read this first. Follow the steps in order the first time you use SportPose. Once the cameras are calibrated, you only repeat the steps for recording and analysing. You only calibrate again when a camera has been moved or you use a new setup.',
        introByRole: { coach: 'Read this first. Follow the steps in order to record a movement and get results from it. Your admin sets up and calibrates the cameras, so you only need to plug them in and check them.', athlete: 'Read this first. Follow the steps in order to record a movement and get results from it. Your coach or admin sets up and calibrates the cameras, so you only need to plug them in and check them.' },
        blocks: [
            {
                title: 'Plug in and check both cameras',
                text: 'Recording in 3D needs both USB cameras. Check that both are working before you record.',
                gif: 'Opening Camera, clicking Start Live Feed, and both pictures appearing.',
                steps: ['Plug both USB cameras into the computer.', 'Open Camera in the menu.', 'Admins only: click Cameras and choose which camera is the left one and which is the right one. You only need to do this once.', 'Click Start Live Feed. A picture from both cameras should appear.', 'If a picture is missing, close any other program that is using the cameras, then click Start Live Feed again.'],
            },
            {
                title: 'Get the checkerboard ready',
                roles: ADMIN,
                text: 'Calibration needs a printed checkerboard. SportPose uses a board with 9 by 6 inside corners, which is 10 by 7 squares, and each square is 80 mm (8 cm) wide. If your board is different, change the board settings in the backend .env file (CALIB_COLS, CALIB_ROWS and CALIB_SQUARE_MM) before calibrating.',
                gif: 'Measuring one square of the printed board with a ruler.',
                steps: ['Print the checkerboard, or use the printed one you have, with 10 squares across and 7 squares down.', 'Measure one square with a ruler. Each square must be 80 mm (8 cm) wide.', 'Keep the board flat and stiff. A bent or wobbly board gives a poor calibration.', 'Check the whole board is visible in both cameras before you start.'],
            },
            {
                title: 'Calibrate the cameras',
                roles: ADMIN,
                text: 'Calibration tells SportPose how the two cameras are placed. Do this once per camera setup, in a clear, well-lit space where the athlete will stand.',
                gif: 'Holding the board in both views, pressing Capture, and the pair count going up.',
                steps: [
                    'Open Calibration in the menu.',
                    'Type a setup name in the box, for example the room or the rig name, then click New calibration. The camera preview opens.',
                    'Hold the board so it is fully inside both camera pictures. The preview says board in both: YES when both cameras can see it.',
                    'Keep the board still and click Capture, or press Space. A pair is only saved when the board is in both pictures and still. Repeat this many times.',
                    'Take at least 15 pairs, and aim for 25 or more. Calibrate stays greyed out until 15 pairs are saved.',
                    'Cover the whole picture. Move the board to all parts of the view, so the grid on each camera turns green. Aim for at least 75% covered on each camera.',
                    'Turn the board to the left and right, and tilt it up and down, by more than 15 degrees. Aim for at least 6 photos of each.',
                    'Take some photos close to the cameras and some far away. The nearest board should look at least 1.6 times bigger than the farthest.',
                    'Click Calibrate. Read the report. Lines marked OK are good. If a line says WARNING, capture more pairs from different positions and calibrate again.',
                    'Lay the board flat on the floor where the athlete will stand, in view of both cameras. Keep it still and click Set floor.',
                    'Click End session. The calibration is saved and marked In use.',
                ],
            },
            {
                title: 'Record a movement',
                text: 'Only record once the cameras have been calibrated.',
                gif: 'Clicking Record Video, the athlete moving, then clicking Stop & Save.',
                steps: ['Open Camera and click Start Live Feed.', 'Ask the athlete to stand where both cameras can see them.', 'Click Record Video. The athlete starts the movement.', 'Click Stop & Save when the movement is finished. Wait for Saving the recording to finish. The recording then opens in Analysis.'],
            },
            {
                title: 'Analyse the recording',
                text: 'Analysis finds the body in every frame and builds the results: the skeleton on the video, the 3D view and the graphs.',
                gif: 'Opening the recording, clicking Analyse video, and the results appearing.',
                steps: ['Open Analysis in the menu and click your recording.', 'Click Analyse video and wait for the progress bar to finish.', 'Read the results. The Analysis section of this guide explains each part.'],
            },
            {
                title: 'Good to know',
                text: 'Every recording uses the calibration that is in use when it is saved. Videos you upload from a phone or another camera do not need calibration. They show the camera view and the graphs, but not the 3D view.',
                gif: 'Uploading a phone video and its camera view opening in Analysis.',
            },
        ],
    },
    {
        id: 'getting-around',
        title: 'Getting around',
        intro: 'SportPose is made of pages. The menu on the left opens each one, and the top bar shows where you are. Some pages are only shown to coaches and admins, so you may not see every item in the menu.',
        blocks: [
            { title: 'Keyboard shortcuts', text: 'Most things can also be done with the keyboard. The full list of shortcuts, and how to change them, is on the Keyboard shortcuts page in Settings. Some shortcuts are two steps, such as Tab then V.', gif: 'The Keyboard shortcuts page in Settings, with its list of shortcut groups.', link: { label: 'Open keyboard shortcuts', to: '/settings?section=shortcuts' } },
        ],
    },
    {
        id: 'videos',
        title: 'Videos',
        intro: 'The Videos page has two parts. On the left is the upload panel. On the right is the list of past videos. Uploading a video starts the process that gives you results from it.',
        blocks: [
            { title: 'Uploading a video', text: 'Click Choose file, or drag a video onto the box. Select a file from your computer (MP4, MOV or AVI, up to 100 MB). Then click Upload Video. The progress bar shows the upload. When it finishes, the video opens in Analysis straight away.', gif: 'Dragging a video onto the upload box, then clicking Upload Video and the progress bar filling.' },
            { title: 'Recording instead of uploading', text: 'Click Camera Capture to go to the Camera page and record with the two cameras. Recordings appear in the same list as uploaded videos.', gif: 'Clicking Camera Capture and the Camera page opening.' },
            { title: 'Finding a video', text: 'Type part of the name in Search videos... to narrow the list. Use the All videos / My videos menu to show only the videos that belong to you. Pages are at the bottom of the list.', gif: 'Typing a name in the search box, then switching to My videos.' },
            { title: 'Opening a video', text: 'Click any row to open that video in Analysis. Analysis shows the results, if the video has been analysed.', gif: 'Clicking a row and the video opening in Analysis.' },
            { title: 'Deleting a video', text: 'Click the bin icon (tooltip: Delete video) at the end of the row. A dialog asks you to confirm. Deleting removes the video and its results, and this cannot be undone.', gif: 'Clicking the bin icon, then confirming in the dialog.' },
        ],
    },
    {
        id: 'analysis',
        title: 'Analysis',
        intro: 'The Analysis page has two views. The library lists the videos. Clicking one opens the studio, where you see its results: the skeleton drawn on the video, the 3D view, and the graphs.',
        blocks: [
            { title: 'The library', text: 'Each row shows the video name, whether it is a Camera recording or an Upload, who recorded it, and the date it was added. Search by video name, or pick a person on the left to see only their videos. Show not analysed adds the videos that do not have results yet. 25 videos are shown per page.', gif: 'Searching for a name, picking a person on the left, and turning on Show not analysed.' },
            { title: 'Starting an analysis', text: 'Open a video and click Analyse video. A progress bar shows how far the analysis has got. Longer videos take longer. You can leave the page while it runs; it keeps going, and the results appear when you come back.', gif: 'Clicking Analyse video, then the progress bar filling up.' },
            { title: 'The top of the studio', text: 'The title is the video name. Click the pencil to rename it; the extension stays the same. Under the title are the frame rate, the number of frames and the length in seconds. A label shows 3D, two cameras or One camera, depending on the recording.', gif: 'Clicking the pencil, typing a new name, and pressing Enter.' },
            { title: 'Processed and raw', text: 'Processed is the cleaned-up result: gaps are filled and the movement is smoothed. Raw is what the model detected before any cleaning. Switch between them with the two buttons at the top. A Raw detections label shows while you are looking at raw results.', gif: 'Switching between processed and raw, and the skeleton changing.' },
            { title: 'Camera views', text: 'Each camera panel shows the video with the skeleton drawn on it. The small label in the bottom-left corner says left cam or right cam. Two-camera recordings show both cameras side by side.', gif: 'Showing the left and right camera panels side by side.' },
            { title: '3D view', text: 'The body in 3D. Drag with the mouse to turn it. Scroll to zoom. Click Reset at the bottom of the 3D view to go back to the start position. Only two-camera recordings have this view.', gif: 'Dragging the 3D view to turn the body, scrolling to zoom, then pressing Reset.' },
            { title: 'Frame number in the 3D view', text: 'The top-right corner of the 3D view shows the current frame, written as FR and a number, for example FR 42. The first frame is FR 0. The number changes as the video plays, so you can use it to find the same moment in different views. The same corner shows the colour key: orange is the left side of the body, pink is the right side.', gif: 'Playing the video and the FR number counting up in the top right of the 3D view.' },
            { title: 'Playback bar', text: 'At the bottom of the studio. Play and Pause start and stop the videos. Previous frame and Next frame step one frame at a time. The time shows where you are, for example 0:01.2 / 0:08.4, and the bar underneath can be dragged to jump anywhere. The speed box changes the playback speed between 0.25x and 2x.', gif: 'Pressing Play, pausing, stepping one frame with the arrows, then changing the speed.' },
            { title: 'Graphs and panels', text: 'Joint angles, position, velocity and distance travelled are shown as graphs. Click View at the top to tick or untick each panel. Reset sizes puts the panels back to their usual size, and Reset layout puts them back in their usual places.', gif: 'Opening View, unticking a graph, then pressing Reset sizes.' },
            { title: 'Downloading the video', text: 'Click Download at the top. The first options in the menu save the video with the skeleton drawn on it. The options marked (no skeleton) save the plain video. On a single-camera video these are called Without skeleton. Two-camera downloads are prepared at full size first, so they can take a little longer.', gif: 'Opening Download and choosing a video.' },
            { title: 'Re-analyzing', text: 'Re-analyze runs the analysis again and replaces the old results. Use it if the results look wrong after a change to the settings or the calibration.', gif: 'Clicking Re-analyze and the results updating.' },
            { title: 'Assigning a video', roles: STAFF, text: 'Coaches and admins can click Assign to choose which person the video belongs to. The name is shown on the button, for example Assigned to Sam.', gif: 'Clicking Assign, choosing a person, and the button changing.' },
            { title: 'Correcting a joint', roles: STAFF, text: 'Coaches and admins can fix a joint that was found in the wrong place on a two-camera analysis. Click Edit keypoints. Drag the joint on either camera video or in the 3D view, and the other views follow. Click Save to keep the change, or Discard to drop it. Undo and Redo step back and forward. Done closes edit mode.', gif: 'Dragging a joint on a video, then clicking Save.' },
        ],
    },
    {
        id: 'camera',
        title: 'Camera',
        intro: 'The Camera page records from the two USB cameras at the same time, so the recording can be analysed in 3D. Both cameras must be plugged in.',
        blocks: [
            { title: 'Choosing the cameras', roles: ADMIN, text: 'Click Cameras. Choose which camera is the left one and which is the right one. Do this once, and only again if you change the cameras.', gif: 'Opening Cameras and choosing the left and right cameras.' },
            { title: 'Starting the live feed', text: 'Click Start Live Feed. A live picture from both cameras appears. Check the picture before you record. Click Stop Live Feed to switch the cameras off.', gif: 'Clicking Start Live Feed and the two camera pictures appearing.' },
            { title: 'Recording', text: 'Click Record Video. The button changes to Stop & Save while recording. Click it again to finish. A Saving the recording message shows while the file is being saved, and then the recording opens in Analysis. Space also starts and stops the recording.', gif: 'Clicking Record Video, waiting a few seconds, then clicking Stop & Save.' },
        ],
    },
    {
        id: 'groups',
        title: 'Groups',
        intro: 'Coaches and admins put athletes into groups. Athletes can see their own groups on the My group page.',
        blocks: [
            { title: 'Creating a group', roles: STAFF, text: 'Click New group, type a name such as Sprinters, and click Create. Each group belongs to one coach. Admins choose the coach from the list on the left.', gif: 'Clicking New group, typing a name, and clicking Create.' },
            { title: 'Adding athletes', roles: STAFF, text: 'Click Add athletes inside a group, tick the athletes you want, then click Add. The list shows athletes who are not in this group yet. An athlete can be in more than one group. Athletes with no group are listed under Unassigned athletes.', gif: 'Opening a group, ticking two athletes, and clicking Add.' },
            { title: 'Removing an athlete', roles: STAFF, text: 'Click the cross next to an athlete’s name in the group. This removes them from that group only. They stay in their other groups.', gif: 'Clicking the cross next to an athlete’s name.' },
            { title: 'Members visible', roles: STAFF, text: 'Turn on Members visible to let athletes in the group see who else is in it. Turn it off to keep the list private from athletes.', gif: 'Turning Members visible on, then the athlete seeing the list.' },
            { title: 'Renaming, moving and deleting', roles: STAFF, text: 'The pencil renames a group. Admins can use the move icon to give the group to another coach. The bin icon deletes the group. Deleting does not delete the videos, and the athletes stay in SportPose.', gif: 'Renaming a group, then clicking the bin icon and confirming.' },
            { title: 'My group (athletes)', roles: ATHLETE, text: 'Athletes open Groups to see each of their groups, the coach, and the other members if the coach has turned on Members visible.', gif: 'An athlete opening Groups and reading the coach name.' },
        ],
    },
    {
        id: 'calibration',
        title: 'Calibration',
        roles: ADMIN,
        intro: 'Admins only. Calibration tells SportPose how the two cameras are placed, so the 3D view is accurate. Do it again whenever a camera is moved. Every calibration is saved in a list.',
        blocks: [
            { title: 'Starting a new calibration', text: 'Type a setup name, such as NeuonAI, in the box. Setup names group the calibrations, so use the name of the place or rig. Click New calibration to open the camera preview.', gif: 'Typing a setup name, then clicking New calibration.' },
            { title: 'Capturing pairs', text: 'Hold the checkerboard fully inside both camera views and keep it still. Click Capture, or press Space. Each capture saves one pair of photos. Move the board to different positions and angles between captures. At least 15 pairs are needed before you can calibrate, and 25 or more give a better result. Undo removes the last pair.', gif: 'Holding the checkerboard, pressing Capture, and the pair count going up.' },
            { title: 'Calibrating', text: 'When you have enough pairs, click Calibrate. The app works out the camera positions. A calibration report shows the accuracy numbers. Click Set floor with the checkerboard lying flat on the floor, so the 3D view has a flat floor to stand on.', gif: 'Clicking Calibrate, then Set floor with the board lying on the floor.' },
            { title: 'Ending a session', text: 'Click End session when you are done. The session is saved. You can open it again later with Previous sessions.', gif: 'Clicking End session.' },
            { title: 'Previous sessions', text: 'Click Previous sessions to open an earlier session from its saved photos, and continue it or calibrate again.', gif: 'Opening Previous sessions and choosing a saved session.' },
            { title: 'The saved list', text: 'The table shows each calibration with its setup, the date, the baseline (the distance between the cameras), the number of pairs, whether a floor has been set, and its status. The one marked In use is the one new recordings use. Click the pencil to rename it or move it to another setup. Click the bin icon to delete it, then confirm with Delete?. The one in use cannot be deleted.', gif: 'Clicking the In use calibration, then the pencil to rename it.' },
        ],
    },
];

const GifPlaceholder = ({ show }: { show: string }) => (
    <div className="flex aspect-video w-full max-w-xl flex-col justify-between rounded-lg border border-dashed border-border bg-background-main p-4">
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Placeholder</span>
        <p className="text-sm leading-relaxed text-text-secondary">Shows: {show}</p>
    </div>
);

const UserManualPage = () => {
    const [open, setOpen] = useState<string | null>(null);
    const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const { user } = useAuth();
    const can = (roles?: Role[]) => !roles || (!!user?.role && roles.includes(user.role as Role));
    const pages = PAGES.filter((p) => can(p.roles))
        .map((p) => ({ ...p, intro: p.introByRole?.[user?.role as Role] ?? p.intro, blocks: p.blocks.filter((b) => can(b.roles)) }))
        .filter((p) => p.blocks.length > 0);

    return (
        <AppLayout>
            <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-8">
                <nav className="sticky top-0 flex flex-col gap-1">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">On this page</p>
                    {pages.map((p) => {
                        const expanded = open === p.id;
                        const subs = [
                            ...p.blocks.map((b, i) => ({ label: b.title, target: `${p.id}-${i}` })),
                        ];
                        return (
                            <div key={p.id}>
                                <div className={`flex items-center rounded-md transition-colors ${expanded ? 'font-medium text-text' : 'text-text-secondary hover:bg-background-main hover:text-text'}`}>
                                    <button onClick={() => jump(p.id)} className="flex-1 px-3 py-2 text-left text-sm">
                                        {p.title}
                                    </button>
                                    <button onClick={() => setOpen(expanded ? null : p.id)} className="px-3 py-2" aria-label={expanded ? 'Collapse' : 'Expand'}>
                                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                                {expanded && (
                                    <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                                        {subs.map((s) => (
                                            <button key={s.target} onClick={() => jump(s.target)} className="py-1.5 text-left text-sm text-text-secondary transition-colors hover:text-text">
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="flex min-w-0 flex-col gap-6">
                    {pages.map((p) => (
                        <section key={p.id} id={p.id} className="scroll-mt-6 rounded-xl border border-border bg-background p-6">
                            <h2 className="text-xl font-semibold text-text">{p.title}</h2>
                            <p className="mb-6 mt-1 text-[15px] leading-relaxed text-text-secondary">{p.intro}</p>

                            <div className="flex flex-col gap-10">
                                {p.blocks.map((b, i) => (
                                    <article key={b.title} id={`${p.id}-${i}`} className="scroll-mt-6 flex min-w-0 flex-col gap-3">
                                        <GifPlaceholder show={b.gif} />
                                        <div>
                                            <h3 className="text-base font-semibold text-text">{b.title}</h3>
                                            <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{b.text}</p>
                                            {b.steps && (
                                                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-text-secondary">
                                                    {b.steps.map((s) => <li key={s}>{s}</li>)}
                                                </ol>
                                            )}
                                            {b.link && (
                                                <Link to={b.link.to} className="mt-3 inline-flex h-9 items-center rounded-lg border border-border bg-background-main px-3 text-sm text-text transition-colors hover:bg-background">
                                                    {b.link.label}
                                                </Link>
                                            )}
                                        </div>
                                    </article>
                                ))}
                            </div>

                        </section>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
};

export default UserManualPage;
