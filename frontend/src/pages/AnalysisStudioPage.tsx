import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Activity, ArrowLeft, Box, Gauge, Loader2, Move3d, RefreshCw, RotateCcw, Ruler, Video, Wand2, type LucideIcon } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import { api } from '@/api/axiosInstance';
import { getVideoUrl } from '@/api/videoApi';
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

    const { data: meta } = useQuery({ queryKey: ['studio-video', videoId, 'left'], queryFn: () => getVideoUrl(videoId, 'left'), staleTime: 30 * 60 * 1000 });
    const { data: analysis, isLoading, isError } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => (await api.get(`/api/get-analysis/${videoId}`)).data.result,
        retry: false,
    });

    const is3D = !!analysis?.frames_3d?.length;
    const hasRight = !!meta?.has_right_view;
    const isAvailable = (needs: 'always' | 'right' | '3d') => needs === 'always' || (needs === 'right' ? hasRight : is3D);
    const visiblePanels = PANELS.filter((p) => isAvailable(p.needs) && layout.visible[p.id]);
    const showing = (id: PanelId) => visiblePanels.some((p) => p.id === id);

    const fps = analysis?.fps || 30;

    // Raw keypoints are stored by analyses made after this feature; older ones can only show processed.
    const hasRaw = !!analysis && (is3D
        ? analysis.frames_3d.some((f: { keypoints_3d_raw?: unknown }) => f.keypoints_3d_raw)
        : analysis.frames?.some((f: { keypoints_raw?: unknown }) => f.keypoints_raw));
    const showRaw = mode === 'raw' && hasRaw;
    const shown = useMemo(() => (analysis && showRaw ? rawView(analysis) : analysis), [analysis, showRaw]);
    const overlays = useMemo(() => {
        if (!analysis) return { left: null, right: null };
        const conf = analysis.overlay_conf ?? { min: 0.3, sure: 0.7 };
        const make = (frames: { keypoints?: Keypoints2D; keypoints_raw?: Keypoints2D }[] | undefined): StudioOverlay | null =>
            frames?.length
                ? { frames: frames.map((f) => (showRaw ? f.keypoints_raw : f.keypoints) ?? null), fps, minConf: conf.min, sureConf: conf.sure, stabilize: !showRaw }
                : null;
        return { left: make(analysis.frames), right: make(analysis.frames_right) };
    }, [analysis, showRaw, fps]);
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

    const renderPanel = (id: PanelId) => {
        if (id === 'left' || id === 'right') {
            return (
                <StudioVideo
                    videoId={videoId}
                    view={id}
                    innerRef={id === 'left' ? leftRef : rightRef}
                    overlay={overlays[id]}
                    fixedNote={showRaw ? 'Processed skeleton (re-analyze to show raw on video)' : undefined}
                />
            );
        }
        if (id === 'skeleton') return <Skeleton3DViewer analysis={shown} framing={analysis?.frames_3d} />;
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
                                        disabled={m === 'raw' && !hasRaw}
                                        className={`px-3 text-sm rounded-md capitalize transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${(m === 'raw' ? showRaw : !showRaw) ? 'bg-primary text-white' : 'text-text-secondary hover:text-text'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
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
