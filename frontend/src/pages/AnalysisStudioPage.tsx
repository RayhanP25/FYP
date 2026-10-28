import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'react-toastify';
import { Activity, ArrowLeft, Box, Gauge, Loader2, Move3d, Pencil, Redo2, RefreshCw, RotateCcw, Ruler, TriangleAlert, Undo2, Users, Video, Wand2, type LucideIcon } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import { api } from '@/api/axiosInstance';
import { getVideoUrl, moveVideo, renameVideo } from '@/api/videoApi';
import { athletesInGroups, getGroups } from '@/api/groupApi';
import { useAuth } from '@/hooks/useAuth';
import { getEdits, revertEdits, saveEdits } from '@/api/editsApi';
import { getCalibrationOptions } from '@/api/calibrationApi';
import { useShortcut } from '@/shortcuts/useShortcut';
import { JOINT_NAMES, LIMB_BONES, pointFrom2D, projectToCamera } from '@/utils/skeleton';
import Skeleton3DViewer from '@/components/Skeleton3DViewer';
import KinematicChart, { type ChartMode } from '@/components/Video/kinematicChart';
import PanelCard from '@/components/analysis/PanelCard';
import ViewMenu from '@/components/analysis/ViewMenu';
import StudioVideo, { type StudioOverlay } from '@/components/analysis/StudioVideo';
import type { Keypoints2D } from '@/components/analysis/SkeletonOverlay';
import TransportBar from '@/components/analysis/TransportBar';
import ResizableRow from '@/components/analysis/ResizableRow';
import { useStudioLayout, ROWS, type PanelId } from '@/components/analysis/useStudioLayout';

// While editing, the 3D view sits beside the two videos so a dragged joint can be checked in all three at once.
const EDIT_ROWS = [
    { id: 'stage' as const, panels: ['left', 'right', 'skeleton'] as PanelId[] },
    ...ROWS.filter((r) => r.id !== 'stage' && r.id !== 'recon'),
];
// A single drag that moves a joint further than this (mm) is held until confirmed: likely an accidental grab.
const BIG_MOVE_MM = 400;

const PANELS: { id: PanelId; label: string; icon: LucideIcon; needs: 'always' | 'right' | '3d' }[] = [
    { id: 'left', label: 'Left camera', icon: Video, needs: 'always' },
    { id: 'right', label: 'Right camera', icon: Video, needs: 'right' },
    { id: 'skeleton', label: '3D reconstruction', icon: Box, needs: '3d' },
    { id: 'angles', label: 'Joint angles', icon: Activity, needs: 'always' },
    { id: 'position', label: 'Position', icon: Move3d, needs: '3d' },
    { id: 'velocity', label: 'Velocity', icon: Gauge, needs: '3d' },
    { id: 'distance', label: 'Distance travelled', icon: Ruler, needs: '3d' },
];

const CHART_MODES: Partial<Record<PanelId, ChartMode>> = { angles: 'angles', position: 'position', velocity: 'velocity', distance: 'distance' };

type KeypointMode = 'processed' | 'raw';

/** An unsaved keypoint edit: dragged in the 3D view (value = X, mm floor-levelled like keypoints_3d) or on one
 *  camera video (value = [x, y] from 0 to 1). X is where it puts the joint in 3D, for drawing it everywhere. */
type EditTarget = '3d' | 'left' | 'right';
type PendingEdit = { frame: number; joint: number; target: EditTarget; value: number[]; X: number[] | null };
const editKey = (frame: number, joint: number) => `${frame}:${joint}`;
const errorText = (e: unknown, fallback: string) =>
    ((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string) || fallback;

// The analysis JSON is untyped here, as in the charts.
type AnalysisJson = any;

/** The analysis as the model detected it: raw 2D / 3D keypoints and angles in place of the processed ones,
 *  so the charts and the 3D view need no changes. */
const rawView = (analysis: AnalysisJson) => ({
    ...analysis,
    frames: (analysis.frames || []).map((f: AnalysisJson) => ({ ...f, keypoints: f.keypoints_raw ?? f.keypoints, angles: f.angles_raw ?? f.angles })),
    frames_3d: (analysis.frames_3d || []).map((f: AnalysisJson) => ({ ...f, keypoints_3d: f.keypoints_3d_raw ?? f.keypoints_3d, angles_3d: f.angles_3d_raw ?? f.angles_3d })),
});

const AnalysisStudioPage = () => {
    const { videoId = '' } = useParams<{ videoId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { layout, toggleVisible, setWeights, setHeight, reset, resetSizes } = useStudioLayout();
    const leftRef = useRef<HTMLVideoElement>(null);
    const rightRef = useRef<HTMLVideoElement>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [mode, setMode] = useState<KeypointMode>('processed');
    // Keypoint editing (admins and coaches, stereo analyses): unsaved edits, undo history, selected joint.
    const [editing, setEditing] = useState(false);
    const [pending, setPending] = useState<Record<string, PendingEdit>>({});
    const [history, setHistory] = useState<Record<string, PendingEdit>[]>([]);
    const [future, setFuture] = useState<Record<string, PendingEdit>[]>([]);
    // A drag that moved a joint a long way, waiting for Keep / Undo (shown while that edit is still the pending one).
    const [bigMove, setBigMove] = useState<{ key: string; edit: PendingEdit; dist: number } | null>(null);
    const dragStart = useRef<{ key: string; X: number[] | null } | null>(null);
    const pendingRef = useRef<Record<string, PendingEdit>>({});
    // Where the videos are when the 3D panel moves (entering / leaving edit mode), so it opens on that frame.
    const [viewerTime, setViewerTime] = useState(0);
    const [selected, setSelected] = useState<{ frame: number; joint: number } | null>(null);
    const [lockBones, setLockBones] = useState(false);
    const [saving, setSaving] = useState(false);
    const beforeDrag = useRef<Record<string, PendingEdit> | null>(null);

    const { data: meta } = useQuery({ queryKey: ['studio-video', videoId, 'left'], queryFn: () => getVideoUrl(videoId, 'left'), staleTime: 30 * 60 * 1000 });
    const { data: analysis, isLoading, isError } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => {
            const doc = (await api.get(`/api/get-analysis/${videoId}`)).data;
            // Which saved calibration the analysis used, for the Re-analyze picker.
            return { ...doc.result, calibration_id: doc.calibration_id ?? null, calibration_setup: doc.calibration_setup ?? null };
        },
        retry: false,
    });
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const rename = useMutation({
        mutationFn: (name: string) => renameVideo(videoId, name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-videos'] });
            queryClient.invalidateQueries({ queryKey: ['studio-video', videoId] });
        },
    });
    const saveName = (value: string) => {
        setRenaming(false);
        const name = value.trim();
        if (name && name !== meta?.original_filename) rename.mutate(name);
    };

    const is3D = !!analysis?.frames_3d?.length;
    const { data: editInfo } = useQuery({ queryKey: ['edits', videoId], queryFn: () => getEdits(videoId), enabled: is3D, retry: false });
    const canEdit = is3D && !!editInfo?.can_edit;
    const { user } = useAuth();
    const canAssign = user?.role === 'admin' || user?.role === 'coach';
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignSearch, setAssignSearch] = useState('');
    const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups, enabled: canAssign && assignOpen });
    const assign = useMutation({
        mutationFn: (ownerId: string) => moveVideo(videoId, ownerId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-videos'] });
            queryClient.invalidateQueries({ queryKey: ['studio-video', videoId] });
            setAssignOpen(false);
            toast.success('Video assigned');
        },
        onError: (e: Error) => toast.error(e.message),
    });
    const query = assignSearch.trim().toLowerCase();
    const assignees = (user?.role === 'admin'
        ? [...(groups?.coaches ?? []), ...athletesInGroups(groups), ...(groups?.unassigned ?? [])]
        : athletesInGroups(groups)
    ).filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(query));
    const pendingCount = Object.keys(pending).length;
    const hasRight = !!meta?.has_right_view;
    const isAvailable = (needs: 'always' | 'right' | '3d') => needs === 'always' || (needs === 'right' ? hasRight : is3D);
    const visiblePanels = PANELS.filter((p) => isAvailable(p.needs) && layout.visible[p.id]);
    const showing = (id: PanelId) => visiblePanels.some((p) => p.id === id);

    const fps = analysis?.fps || 30;

    // Raw keypoints are stored by analyses made after this feature; older ones can only show processed.
    const hasRaw = !!analysis && (is3D
        ? analysis.frames_3d.some((f: { keypoints_3d_raw?: unknown }) => f.keypoints_3d_raw)
        : analysis.frames?.some((f: { keypoints_raw?: unknown }) => f.keypoints_raw));
    const showRaw = mode === 'raw' && hasRaw && !editing;
    const base = useMemo(() => (analysis && showRaw ? rawView(analysis) : analysis), [analysis, showRaw]);
    // Unsaved edits on top (marked "pending"); saved ones already come applied from the server.
    const shown = useMemo(() => {
        if (!base || !pendingCount || showRaw || !base.frames_3d) return base;
        const f3 = [...base.frames_3d];
        Object.values(pending).forEach(({ frame, joint, X }) => {
            const f = f3[frame];
            if (!f || !X) return;
            const kp = [...f.keypoints_3d];
            kp[joint] = X;
            f3[frame] = { ...f, keypoints_3d: kp, edited: { ...(f.edited || {}), [joint]: 'pending' } };
        });
        return { ...base, frames_3d: f3 };
    }, [base, pending, pendingCount, showRaw]);
    // This person's bone lengths (from the analysis), by "parent-child" joint key.
    const boneLengths = useMemo(() => {
        const b = analysis?.stereo_report?.bones?.bones || {};
        return Object.fromEntries(LIMB_BONES.filter(([, , n]) => b[n]?.length_mm).map(([a, c, n]) => [`${a}-${c}`, b[n].length_mm as number]));
    }, [analysis]);
    const overlays = useMemo(() => {
        if (!analysis) return { left: null, right: null };
        const conf = analysis.overlay_conf ?? { min: 0.3, sure: 0.7 };
        const cal = editInfo?.calibration;
        const marks = !showRaw && shown?.frames_3d ? shown.frames_3d.map((f: { edited?: Record<string, string> }) => f.edited) : undefined;
        const make = (frames: { keypoints?: Keypoints2D; keypoints_raw?: Keypoints2D }[] | undefined, view: 'left' | 'right'): StudioOverlay | null => {
            if (!frames?.length) return null;
            const kps = frames.map((f) => (showRaw ? f.keypoints_raw : f.keypoints) ?? null);
            if (!showRaw && cal) {
                // Unsaved 3D edits shown where they land in this camera, so you can check them against the video.
                Object.values(pending).forEach(({ frame, joint, target, value, X }) => {
                    const kp = kps[frame];
                    // Dragged on this video: exactly there. Otherwise where its 3D position lands in this camera.
                    const uv = target === view ? value : X ? projectToCamera(X, cal, view) : null;
                    if (!kp || !uv) return;
                    const next = [...kp];
                    next[joint] = [uv[0], uv[1], 1];
                    kps[frame] = next;
                });
            }
            return { frames: kps, fps, minConf: conf.min, sureConf: conf.sure, stabilize: !showRaw, marks };
        };
        return { left: make(analysis.frames, 'left'), right: make(analysis.frames_right, 'right') };
    }, [analysis, shown, showRaw, fps, pending, editInfo]);
    const totalFrames = analysis?.total_frames ?? analysis?.frames?.length;
    const stats = analysis ? [`${Math.round(fps)} fps`, `${totalFrames} frames`, `${(totalFrames / fps).toFixed(1)} s`] : [];

    // Stereo recordings: choose the calibration first (the one it was analysed with is preselected).
    const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
    const [pickedCalibration, setPickedCalibration] = useState<string | null>(null);
    const { data: calibrationOptions, isLoading: loadingCalibrations } = useQuery({
        queryKey: ['calibration-options'], queryFn: getCalibrationOptions, enabled: reanalyzeOpen,
    });
    // The calibration it was analysed with, if it's still saved (else the one in use is preselected).
    const usedCalibration = calibrationOptions?.some((c) => c.id === analysis?.calibration_id) ? analysis.calibration_id as string : null;
    const defaultCalibration = usedCalibration ?? calibrationOptions?.find((c) => c.active)?.id ?? null;
    const chosenCalibration = pickedCalibration ?? defaultCalibration;
    const sortedCalibrations = [...(calibrationOptions ?? [])].sort((a, b) =>
        Number(b.id === usedCalibration) - Number(a.id === usedCalibration) || Number(b.active) - Number(a.active));
    const formatCalibrationDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
    const requestAnalyze = () => {
        if (!hasRight) { analyze(); return; }
        setPickedCalibration(null);
        setReanalyzeOpen(true);
    };
    const analyze = async (calibrationId?: string | null) => {
        setReanalyzeOpen(false);
        setIsAnalyzing(true);
        try {
            await api.post(`/api/process-video/${videoId}`, null, {
                params: { ...(analysis ? { force: true } : {}), ...(calibrationId ? { calibration_id: calibrationId } : {}) },
            });
            toast.success('Pose analysis completed!');
            await Promise.all(['analysis', 'studio-video', 'my-videos'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
        } catch {
            toast.error('Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => { pendingRef.current = pending; }, [pending]);
    const startEditing = () => {
        [leftRef.current, rightRef.current].forEach((v) => v?.pause());
        setMode('processed');
        if (!layout.visible.skeleton) toggleVisible('skeleton');
        setViewerTime(leftRef.current?.currentTime ?? rightRef.current?.currentTime ?? 0);
        setEditing(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    // One undo step per drag: the edits as they were before the joint first moved. A new step clears redo.
    const pushHistory = () => {
        const snapshot = beforeDrag.current;
        if (!snapshot) return;
        setHistory((h) => [...h.slice(-49), snapshot]);
        setFuture([]);
        beforeDrag.current = null;
    };
    const jointAt = (frame: number, joint: number): number[] | null =>
        pending[editKey(frame, joint)]?.X ?? analysis?.frames_3d?.[frame]?.keypoints_3d?.[joint] ?? null;
    const onDragEnd = (frame: number, joint: number) => {
        const start = dragStart.current;
        dragStart.current = null;
        const key = editKey(frame, joint);
        const edit = pendingRef.current[key];
        if (!start || start.key !== key || !start.X || !edit?.X) return;
        const dist = Math.hypot(edit.X[0] - start.X[0], edit.X[1] - start.X[1], edit.X[2] - start.X[2]);
        if (dist > BIG_MOVE_MM) setBigMove({ key, edit, dist });
    };
    const stopEditing = () => {
        setViewerTime(leftRef.current?.currentTime ?? rightRef.current?.currentTime ?? 0);
        setEditing(false);
        setSelected(null);
    };
    const onSelectJoint = (frame: number, joint: number | null) => {
        setSelected(joint == null ? null : { frame, joint });
        beforeDrag.current = joint == null ? null : pending;      // becomes an undo step once the joint moves
        dragStart.current = joint == null ? null : { key: editKey(frame, joint), X: jointAt(frame, joint) };
    };
    const onEditJoint = (frame: number, joint: number, value: [number, number, number]) => {
        pushHistory();
        setPending((p) => ({ ...p, [editKey(frame, joint)]: { frame, joint, target: '3d', value, X: value } }));
    };
    // Dragging a joint on one of the videos: the other camera's point for it gives its depth.
    const pointIn = (view: 'left' | 'right', frame: number, joint: number): number[] | null => {
        const p = pending[editKey(frame, joint)];
        const cal = editInfo?.calibration;
        if (p && cal) return p.target === view ? p.value : p.X ? projectToCamera(p.X, cal, view) : null;
        const kp = (view === 'left' ? analysis?.frames : analysis?.frames_right)?.[frame]?.keypoints?.[joint];
        return kp && kp[2] >= 0.3 ? kp : null;
    };
    const onDragJoint2D = (view: 'left' | 'right') => (phase: 'start' | 'move' | 'end', frame: number, joint: number, uv: [number, number]) => {
        if (phase === 'start') { onSelectJoint(frame, joint); return; }
        if (phase === 'end') { onDragEnd(frame, joint); return; }
        const cal = editInfo?.calibration;
        if (!cal) return;
        const other = pointIn(view === 'left' ? 'right' : 'left', frame, joint);
        const current = pending[editKey(frame, joint)]?.X ?? analysis?.frames_3d?.[frame]?.keypoints_3d?.[joint] ?? null;
        const X = pointFrom2D(uv, view, other, current, cal);
        pushHistory();
        setPending((p) => ({ ...p, [editKey(frame, joint)]: { frame, joint, target: view, value: uv, X } }));
    };
    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        setFuture((f) => [...f, pending]);
        setPending(prev);
        setHistory(history.slice(0, -1));
    };
    const redo = () => {
        const next = future[future.length - 1];
        if (!next) return;
        setHistory((h) => [...h, pending]);
        setPending(next);
        setFuture(future.slice(0, -1));
    };
    const discard = () => { setPending({}); setHistory([]); setFuture([]); };
    // The big move still waiting for an answer (gone once that joint is undone, redragged or saved).
    const bigMoveShown = bigMove && pending[bigMove.key] === bigMove.edit ? bigMove : null;
    const undoBigMove = () => {
        if (!bigMoveShown) return;
        setHistory((h) => [...h.slice(-49), pending]);
        setFuture([]);
        setPending((p) => {
            const rest = { ...p };
            delete rest[bigMoveShown.key];
            return rest;
        });
        setBigMove(null);
    };
    useShortcut('edit.undo', undo, editing);
    const refreshEdits = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', videoId] }),
        queryClient.invalidateQueries({ queryKey: ['edits', videoId] }),
    ]);
    const save = async () => {
        setSaving(true);
        try {
            const n = pendingCount;
            await saveEdits(videoId, Object.values(pending).map(({ frame, joint, target, value }) => ({ frame, joint, target, value })));
            await refreshEdits();
            setPending({});
            setHistory([]);
            setFuture([]);
            toast.success(`Saved ${n} edit${n === 1 ? '' : 's'}. Nearby frames ease into ${n === 1 ? 'it' : 'them'}.`);
        } catch (e) {
            toast.error(errorText(e, 'Could not save the edits.'));
        } finally {
            setSaving(false);
        }
    };
    const selectedSaved = selected && analysis?.frames_3d?.[selected.frame]?.edited?.[selected.joint] === 'edit'
        && !pending[editKey(selected.frame, selected.joint)];
    const revertSelected = async () => {
        if (!selected) return;
        try {
            await revertEdits(videoId, selected.frame, selected.joint);
            await refreshEdits();
            toast.success('Edit reverted.');
        } catch (e) {
            toast.error(errorText(e, 'Could not revert the edit.'));
        }
    };
    const savedCount = editInfo?.edits.length ?? 0;
    const revertAll = async () => {
        if (!window.confirm(`Revert all ${savedCount} keypoint edits of this video?`)) return;
        try {
            await revertEdits(videoId);
            await refreshEdits();
            toast.success('All edits reverted.');
        } catch (e) {
            toast.error(errorText(e, 'Could not revert the edits.'));
        }
    };
    const tryStopEditing = () => {
        if (pendingCount) { toast.info('Save or discard your changes first.'); return; }
        stopEditing();
    };
    const togglePanel = (index: number) => {
        const panel = PANELS[index];
        if (isAvailable(panel.needs)) toggleVisible(panel.id);
    };
    useShortcut('edit.toggle', () => (editing ? tryStopEditing() : canEdit && startEditing()));
    useShortcut('edit.done', tryStopEditing, editing);
    useShortcut('edit.save', () => { if (pendingCount && !saving && !bigMoveShown) save(); }, editing);
    useShortcut('panel.1', () => togglePanel(0));
    useShortcut('panel.2', () => togglePanel(1));
    useShortcut('panel.3', () => togglePanel(2));
    useShortcut('panel.4', () => togglePanel(3));
    useShortcut('panel.5', () => togglePanel(4));
    useShortcut('panel.6', () => togglePanel(5));
    useShortcut('panel.7', () => togglePanel(6));
    useShortcut('layout.reset', reset);
    useShortcut('sizes.reset', resetSizes);

    // Don't lose unsaved edits by closing or reloading the tab.
    useEffect(() => {
        if (!pendingCount) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [pendingCount]);

    const renderPanel = (id: PanelId) => {
        if (id === 'left' || id === 'right') {
            return (
                <StudioVideo
                    videoId={videoId}
                    view={id}
                    innerRef={id === 'left' ? leftRef : rightRef}
                    overlay={overlays[id]}
                    fixedNote={showRaw ? 'Processed skeleton (re-analyze to show raw on video)'
                        : savedCount > 0 ? 'Older video: edits not shown here (re-analyze)' : undefined}
                    edit={editing ? { selectedJoint: selected?.joint ?? null, onDragJoint: onDragJoint2D(id) } : null}
                />
            );
        }
        if (id === 'skeleton') {
            return (
                <Skeleton3DViewer
                    analysis={shown}
                    framing={analysis?.frames_3d}
                    editing={editing}
                    onEditJoint={onEditJoint}
                    onSelectJoint={onSelectJoint}
                    onDragEnd={onDragEnd}
                    initialTime={viewerTime}
                    selectedJoint={selected?.joint ?? null}
                    boneLengths={boneLengths}
                    lockBones={lockBones}
                />
            );
        }
        return <KinematicChart analysisData={shown} mode={CHART_MODES[id]!} padded={false} />;
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-6 max-w-[1800px] mx-auto">
                <div className="flex items-end justify-between gap-6 flex-wrap">
                    <div className="min-w-0">
                        <button onClick={() => navigate('/analysis')} className="inline-flex items-center gap-1.5 mb-3 text-xs uppercase tracking-[0.16em] text-text-muted hover:text-text transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5" /> Library
                        </button>
                        <div className="flex items-center gap-3 min-w-0">
                            {renaming ? (
                                <input
                                    autoFocus type="text" value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    onBlur={(e) => saveName(e.currentTarget.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                        if (e.key === 'Escape') { e.currentTarget.value = meta?.original_filename || ''; e.currentTarget.blur(); }
                                    }}
                                    className="text-3xl font-semibold tracking-tight text-text bg-background border border-primary rounded px-2 py-0.5 min-w-0 w-full focus:outline-none"
                                />
                            ) : (
                                <>
                                    <h1 className="text-3xl font-semibold tracking-tight text-text truncate">{meta?.original_filename || 'Analysis'}</h1>
                                    {meta && (
                                        <button
                                            onClick={() => { setNameDraft(meta.original_filename); setRenaming(true); }}
                                            className="shrink-0 p-1.5 rounded text-text-muted hover:text-primary transition-colors"
                                            aria-label="Edit video name"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                        {analysis && (
                            <div className="mt-2 flex items-center gap-4 text-sm text-text-muted tabular-nums">
                                <span className="px-2 py-0.5 rounded border border-border text-text-secondary text-xs font-medium">{is3D ? 'Stereo 3D' : '2D'}</span>
                                {showRaw && <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 text-xs font-medium">Raw detections</span>}
                                {!showRaw && savedCount > 0 && (
                                    <span className="px-2 py-0.5 rounded border border-border text-text-secondary text-xs font-medium" title="Joints corrected by hand (rings in the views)">
                                        {savedCount} edited {savedCount === 1 ? 'joint' : 'joints'}
                                    </span>
                                )}
                                {stats.map((s) => <span key={s}>{s}</span>)}
                            </div>
                        )}
                    </div>
                    {analysis && (
                        <div className="flex items-center gap-2">
                            <div
                                className="inline-flex h-9 p-1 rounded-lg border border-border"
                                title={hasRaw ? 'Raw: the keypoints exactly as the model detected them. Processed: after left/right fixes, filling hidden joints, bone lengths and smoothing.' : 'Re-analyze this video to compare with the raw detections.'}
                            >
                                {(['processed', 'raw'] as KeypointMode[]).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        disabled={(m === 'raw' && !hasRaw) || editing}
                                        className={`px-3 text-sm rounded-md capitalize transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${(m === 'raw' ? showRaw : !showRaw) ? 'bg-primary text-white' : 'text-text-secondary hover:text-text'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            {canEdit && !editing && (
                                <button onClick={startEditing} className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors" title="Correct keypoints by dragging them on the videos or in the 3D view">
                                    <Pencil className="w-4 h-4" /> Edit keypoints
                                </button>
                            )}
                            {canAssign && (
                                <Dialog.Root open={assignOpen} onOpenChange={setAssignOpen}>
                                    <Dialog.Trigger asChild>
                                        <button className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors">
                                            <Users className="w-4 h-4" />
                                            {meta?.owner_name && meta.owner_id !== user?._id ? `Assigned to ${meta.owner_name}` : 'Assign'}
                                        </button>
                                    </Dialog.Trigger>
                                    <Dialog.Portal>
                                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                                        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[70vh] w-[90vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                                            <div className="border-b border-border px-5 py-4">
                                                <Dialog.Title className="font-semibold text-text">Assign video</Dialog.Title>
                                                <Dialog.Description className="text-xs text-text-muted">Choose who this video belongs to.</Dialog.Description>
                                            </div>
                                            <div className="border-b border-border p-3">
                                                <input
                                                    value={assignSearch}
                                                    onChange={(e) => setAssignSearch(e.target.value)}
                                                    placeholder="Search by name or email"
                                                    className="h-9 w-full px-3 rounded-lg bg-background-main border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            </div>
                                            <ul className="min-h-0 overflow-y-auto divide-y divide-border">
                                                {assignees.map((p) => (
                                                    <li key={p.id}>
                                                        <button
                                                            disabled={assign.isPending}
                                                            onClick={() => assign.mutate(p.id)}
                                                            className="w-full px-5 py-2.5 text-left hover:bg-background-main transition-colors disabled:opacity-50"
                                                        >
                                                            <p className="truncate text-sm font-medium text-text">{p.full_name}</p>
                                                            <p className="truncate text-xs text-text-muted">{p.email}</p>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </Dialog.Content>
                                    </Dialog.Portal>
                                </Dialog.Root>
                            )}
                            <ViewMenu
                                panels={PANELS.map((p) => ({ id: p.id, label: p.label, icon: p.icon, available: isAvailable(p.needs) }))}
                                visible={layout.visible}
                                onToggle={toggleVisible}
                                onReset={reset}
                            />
                            <button onClick={resetSizes} className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors" title="Put all panel sizes back to default (keeps hidden panels hidden)">
                                <RotateCcw className="w-4 h-4" /> Reset sizes
                            </button>
                            <button onClick={requestAnalyze} disabled={isAnalyzing} className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors disabled:opacity-50">
                                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Re-analyze
                            </button>
                        </div>
                    )}
                </div>

                {editing && (
                    <div className="sticky top-2 z-20 -mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary/50 bg-background-main/95 backdrop-blur px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-text"><Pencil className="w-4 h-4 text-primary" /> Editing keypoints</span>
                        <span className="text-xs text-text-muted">
                            Drag a joint on either video or in the 3D view; the other views follow. Ctrl+Z undoes the last change. Saved edits ease into the {editInfo?.fade_frames ?? 5} frames on each side,
                            and edits of a joint up to {editInfo?.keyframe_gap ?? 30} frames apart are joined.
                        </span>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none" title="Keep the dragged joint's bone to its parent (e.g. the forearm for a wrist) at this person's usual length">
                                <input type="checkbox" checked={lockBones} onChange={(e) => setLockBones(e.target.checked)} className="accent-primary" />
                                Keep bone length
                            </label>
                            <button onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)" className="inline-flex items-center gap-1.5 h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text disabled:opacity-40">
                                <Undo2 className="w-4 h-4" /> Undo
                            </button>
                            <button onClick={redo} disabled={!future.length} title="Redo" className="inline-flex items-center gap-1.5 h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text disabled:opacity-40">
                                <Redo2 className="w-4 h-4" /> Redo
                            </button>
                            {selectedSaved && (
                                <button onClick={revertSelected} className="h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text">Revert this joint</button>
                            )}
                            {savedCount > 0 && !pendingCount && (
                                <button onClick={revertAll} className="h-8 px-2.5 text-sm rounded-md text-text-muted hover:text-red-500">Revert all</button>
                            )}
                            <button onClick={discard} disabled={!pendingCount} className="h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text disabled:opacity-40">Discard</button>
                            <Button size="sm" onClick={save} disabled={!pendingCount || saving || !!bigMoveShown} title={bigMoveShown ? 'Keep or undo the big move first' : undefined} className="h-8 gap-1.5">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save{pendingCount ? ` ${pendingCount} ${pendingCount === 1 ? 'edit' : 'edits'}` : ''}
                            </Button>
                            <button
                                onClick={stopEditing}
                                disabled={pendingCount > 0}
                                title={pendingCount ? 'Save or discard your changes first' : undefined}
                                className="h-8 px-2.5 text-sm rounded-md text-text-secondary hover:text-text disabled:opacity-40"
                            >
                                Done
                            </button>
                        </div>
                        {bigMoveShown && (
                            <div className="basis-full flex flex-wrap items-center gap-3 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-sm text-amber-500">
                                <TriangleAlert className="w-4 h-4 shrink-0" />
                                <span className="text-text">
                                    {JOINT_NAMES[bigMoveShown.edit.joint]} moved {(bigMoveShown.dist / 10).toFixed(0)} cm in one drag (frame {bigMoveShown.edit.frame}). Keep it?
                                </span>
                                <span className="ml-auto flex gap-2">
                                    <button onClick={undoBigMove} className="h-7 px-2.5 rounded-md border border-border text-text-secondary hover:text-text">Undo it</button>
                                    <button onClick={() => setBigMove(null)} className="h-7 px-2.5 rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400">Keep</button>
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {isLoading && <div className="py-32 text-center text-sm text-text-muted">Loading analysis...</div>}

                {isError && !isLoading && (
                    <div className="flex flex-col items-center gap-4 py-24 border border-dashed border-border rounded-xl">
                        <Wand2 className="w-8 h-8 text-primary" strokeWidth={1.5} />
                        <h3 className="text-lg font-medium text-text">This video has not been analyzed yet</h3>
                        <p className="text-sm text-text-muted -mt-2">Extract kinematics to unlock both camera views, the 3D skeleton and the graphs.</p>
                        <Button onClick={requestAnalyze} disabled={isAnalyzing} className="px-6 gap-2">
                            {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing AI...</> : <><Wand2 className="w-4 h-4" /> Extract Kinematics</>}
                        </Button>
                    </div>
                )}

                {analysis && (
                    visiblePanels.length ? (
                        <div className="-mt-2">
                            {(editing ? EDIT_ROWS : ROWS).map((row) => {
                                const items = visiblePanels.filter((p) => row.panels.includes(p.id)).map((p) => ({
                                    id: p.id,
                                    weight: layout.weights[p.id],
                                    node: <PanelCard title={p.label} onHide={() => toggleVisible(p.id)}>{renderPanel(p.id)}</PanelCard>,
                                }));
                                return items.length ? (
                                    <ResizableRow key={row.id} items={items} height={layout.heights[row.id]} onHeight={(h) => setHeight(row.id, h)} onWeights={setWeights} />
                                ) : null;
                            })}
                        </div>
                    ) : (
                        <div className="py-24 text-center text-sm text-text-muted border border-dashed border-border rounded-xl">Everything is hidden. Bring panels back from the View menu.</div>
                    )
                )}

                {analysis && (showing('left') || showing('right')) && (
                    <>
                        <div className="h-16" />
                        <TransportBar leftRef={leftRef} rightRef={rightRef} layoutKey={`${showing('left')}-${showing('right')}`} fps={fps} />
                    </>
                )}
            </div>
            <Dialog.Root open={reanalyzeOpen} onOpenChange={setReanalyzeOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[75vh] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                        <div className="border-b border-border px-5 py-4">
                            <Dialog.Title className="font-semibold text-text">{analysis ? 'Re-analyze recording' : 'Analyze recording'}</Dialog.Title>
                            <Dialog.Description className="mt-1 text-xs text-text-muted">
                                Pick the calibration of the camera setup this was filmed with. A wrong one swaps joints and puts the 3D in the wrong place.
                            </Dialog.Description>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-3">
                            {loadingCalibrations && <p className="px-2 py-6 text-center text-sm text-text-muted">Loading calibrations...</p>}
                            {!loadingCalibrations && !sortedCalibrations.length && <p className="px-2 py-6 text-center text-sm text-text-muted">No saved calibrations.</p>}
                            <ul className="flex flex-col gap-1.5">
                                {sortedCalibrations.map((c) => (
                                    <li key={c.id}>
                                        <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${chosenCalibration === c.id ? 'border-primary/70 bg-primary/5' : 'border-border hover:bg-background-main'}`}>
                                            <input type="radio" name="calibration" className="accent-primary" checked={chosenCalibration === c.id} onChange={() => setPickedCalibration(c.id)} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-text truncate">{c.setup}</span>
                                                    {c.id === usedCalibration && <span className="shrink-0 px-1.5 py-0.5 rounded bg-border text-[10px] font-medium text-text-secondary">Used last time</span>}
                                                    {c.active && <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/15 text-[10px] font-medium text-primary">In use</span>}
                                                </span>
                                                <span className="block text-xs text-text-muted tabular-nums">
                                                    {formatCalibrationDate(c.calibrated_at ?? c.created_at)} · RMS {c.rms != null ? `${c.rms.toFixed(2)} px` : '-'} · baseline {(c.baseline_mm / 1000).toFixed(2)} m{c.floor_set ? '' : ' · floor not set'}
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                            <Dialog.Close asChild>
                                <button className="h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text">Cancel</button>
                            </Dialog.Close>
                            <Button size="sm" className="h-9 gap-2" disabled={!chosenCalibration} onClick={() => analyze(chosenCalibration)}>
                                <RefreshCw className="w-4 h-4" /> {analysis ? 'Re-analyze' : 'Analyze'}
                            </Button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </AppLayout>
    );
};

export default AnalysisStudioPage;
