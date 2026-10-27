import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'react-toastify';
import { Activity, ArrowLeft, Box, Gauge, Loader2, Move3d, Pencil, RefreshCw, RotateCcw, Ruler, Undo2, Users, Video, Wand2, type LucideIcon } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import { api } from '@/api/axiosInstance';
import { getVideoUrl, moveVideo } from '@/api/videoApi';
import { athletesInGroups, getGroups } from '@/api/groupApi';
import { useAuth } from '@/hooks/useAuth';
import { getEdits, revertEdits, saveEdits } from '@/api/editsApi';
import { LIMB_BONES, pointFrom2D, projectToCamera } from '@/utils/skeleton';
import Skeleton3DViewer from '@/components/Skeleton3DViewer';
import KinematicChart, { type ChartMode } from '@/components/Video/kinematicChart';
import PanelCard from '@/components/analysis/PanelCard';
import ViewMenu from '@/components/analysis/ViewMenu';
import StudioVideo, { type StudioOverlay } from '@/components/analysis/StudioVideo';
import type { Keypoints2D } from '@/components/analysis/SkeletonOverlay';
import TransportBar from '@/components/analysis/TransportBar';
import ResizableRow from '@/components/analysis/ResizableRow';
import { useStudioLayout, ROWS, type PanelId } from '@/components/analysis/useStudioLayout';

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
    // Keypoint editing (admins, coaches and athletes, stereo analyses): unsaved edits, undo history, selected joint.
    const [editing, setEditing] = useState(false);
    const [pending, setPending] = useState<Record<string, PendingEdit>>({});
    const [history, setHistory] = useState<Record<string, PendingEdit>[]>([]);
    const [selected, setSelected] = useState<{ frame: number; joint: number } | null>(null);
    const [lockBones, setLockBones] = useState(false);
    const [saving, setSaving] = useState(false);
    const beforeDrag = useRef<Record<string, PendingEdit> | null>(null);

    const { data: meta } = useQuery({ queryKey: ['studio-video', videoId, 'left'], queryFn: () => getVideoUrl(videoId, 'left'), staleTime: 30 * 60 * 1000 });
    const { data: analysis, isLoading, isError } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => (await api.get(`/api/get-analysis/${videoId}`)).data.result,
        retry: false,
    });

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

    const analyze = async () => {
        setIsAnalyzing(true);
        try {
            await api.post(`/api/process-video/${videoId}${analysis ? '?force=true' : ''}`);
            toast.success('Pose analysis completed!');
            await Promise.all(['analysis', 'studio-video', 'my-videos'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
        } catch {
            toast.error('Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const startEditing = () => {
        [leftRef.current, rightRef.current].forEach((v) => v?.pause());
        setMode('processed');
        if (!layout.visible.skeleton) toggleVisible('skeleton');
        setEditing(true);
    };
    const stopEditing = () => { setEditing(false); setSelected(null); };
    const onSelectJoint = (frame: number, joint: number | null) => {
        setSelected(joint == null ? null : { frame, joint });
        beforeDrag.current = joint == null ? null : pending;      // becomes an undo step once the joint moves
    };
    const onEditJoint = (frame: number, joint: number, value: [number, number, number]) => {
        if (beforeDrag.current) {
            const snapshot = beforeDrag.current;
            setHistory((h) => [...h.slice(-49), snapshot]);
            beforeDrag.current = null;
        }
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
        const cal = editInfo?.calibration;
        if (!cal) return;
        const other = pointIn(view === 'left' ? 'right' : 'left', frame, joint);
        const current = pending[editKey(frame, joint)]?.X ?? analysis?.frames_3d?.[frame]?.keypoints_3d?.[joint] ?? null;
        const X = pointFrom2D(uv, view, other, current, cal);
        if (beforeDrag.current) {
            const snapshot = beforeDrag.current;
            setHistory((h) => [...h.slice(-49), snapshot]);
            beforeDrag.current = null;
        }
        setPending((p) => ({ ...p, [editKey(frame, joint)]: { frame, joint, target: view, value: uv, X } }));
    };
    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        setPending(prev);
        setHistory(history.slice(0, -1));
    };
    const discard = () => { setPending({}); setHistory([]); };
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
                        <h1 className="text-3xl font-semibold tracking-tight text-text truncate">{meta?.original_filename || 'Analysis'}</h1>
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
                                        <Dialog.Overlay className="fixed inset-0 bg-black/70" />
                                        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[70vh] w-[90vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
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
                            <button onClick={analyze} disabled={isAnalyzing} className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors disabled:opacity-50">
                                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Re-analyze
                            </button>
                        </div>
                    )}
                </div>

                {editing && (
                    <div className="sticky top-2 z-20 -mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary/50 bg-background-main/95 backdrop-blur px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-text"><Pencil className="w-4 h-4 text-primary" /> Editing keypoints</span>
                        <span className="text-xs text-text-muted">
                            Drag a joint on either video or in the 3D view; the other views follow. Saved edits ease into the {editInfo?.fade_frames ?? 5} frames on each side,
                            and edits of a joint up to {editInfo?.keyframe_gap ?? 30} frames apart are joined.
                        </span>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none" title="Keep the dragged joint's bone to its parent (e.g. the forearm for a wrist) at this person's usual length">
                                <input type="checkbox" checked={lockBones} onChange={(e) => setLockBones(e.target.checked)} className="accent-primary" />
                                Keep bone length
                            </label>
                            <button onClick={undo} disabled={!history.length} className="inline-flex items-center gap-1.5 h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text disabled:opacity-40">
                                <Undo2 className="w-4 h-4" /> Undo
                            </button>
                            {selectedSaved && (
                                <button onClick={revertSelected} className="h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text">Revert this joint</button>
                            )}
                            {savedCount > 0 && !pendingCount && (
                                <button onClick={revertAll} className="h-8 px-2.5 text-sm rounded-md text-text-muted hover:text-red-500">Revert all</button>
                            )}
                            <button onClick={discard} disabled={!pendingCount} className="h-8 px-2.5 text-sm rounded-md border border-border text-text-secondary hover:text-text disabled:opacity-40">Discard</button>
                            <Button size="sm" onClick={save} disabled={!pendingCount || saving} className="h-8 gap-1.5">
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
                    </div>
                )}

                {isLoading && <div className="py-32 text-center text-sm text-text-muted">Loading analysis...</div>}

                {isError && !isLoading && (
                    <div className="flex flex-col items-center gap-4 py-24 border border-dashed border-border rounded-xl">
                        <Wand2 className="w-8 h-8 text-primary" strokeWidth={1.5} />
                        <h3 className="text-lg font-medium text-text">This video has not been analyzed yet</h3>
                        <p className="text-sm text-text-muted -mt-2">Extract kinematics to unlock both camera views, the 3D skeleton and the graphs.</p>
                        <Button onClick={analyze} disabled={isAnalyzing} className="px-6 gap-2">
                            {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing AI...</> : <><Wand2 className="w-4 h-4" /> Extract Kinematics</>}
                        </Button>
                    </div>
                )}

                {analysis && (
                    visiblePanels.length ? (
                        <div className="-mt-2">
                            {ROWS.map((row) => {
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
        </AppLayout>
    );
};

export default AnalysisStudioPage;
