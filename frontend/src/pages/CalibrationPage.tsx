import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Calculator, Camera, Layers, Play, StopCircle, Undo2 } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import { api } from '@/api/axiosInstance';
import {
    capturePair,
    endCalibrationSession,
    errorDetail,
    getCalibrationStatus,
    runCalibration,
    runFloorLevel,
    startCalibrationSession,
    undoPair,
} from '@/api/calibrationApi';
import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import CoverageChecks from '@/components/calibration/CoverageChecks';
import CalibrationReport from '@/components/calibration/CalibrationReport';

const SHORTCUT_BLOCKERS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'];

const captureRequest = async () => {
    const result = await capturePair();
    if (!result.ok) toast.warn(result.message);
};

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="rounded-xl bg-background-main border border-border p-5">
        <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">{title}</h2>
        {children}
    </section>
);

const CalibrationPage = () => {
    const queryClient = useQueryClient();
    const backendUrl = api.defaults.baseURL || 'http://localhost:8000';
    const [streamKey, setStreamKey] = useState(0);
    const lastJob = useRef<string | null>(null);

    const { data: status } = useQuery({
        queryKey: ['calibration-status'],
        queryFn: getCalibrationStatus,
        refetchInterval: (query) => (query.state.data?.session || query.state.data?.job ? 1000 : 4000),
    });

    const session = status?.session ?? null;
    const calibration = status?.calibration ?? null;
    const busy = !!status?.job;
    const live = !!status?.live;
    const pairs = session?.pairs ?? 0;
    const minPairs = session?.min_pairs ?? 15;
    const aimPairs = session?.aim_pairs ?? 25;
    const canCapture = !!session && live && !busy;

    const { mutate, isPending } = useMutation({
        mutationFn: (request: () => Promise<unknown>) => request(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calibration-status'] }),
        onError: (error) => toast.error(errorDetail(error, 'Something went wrong.')),
    });

    useEffect(() => {
        const job = status?.job ?? null;
        if (lastJob.current && !job && status?.message) {
            if (status.message.includes('failed')) toast.error(status.message);
            else toast.success(status.message);
        }
        lastJob.current = job;
    }, [status?.job, status?.message]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code !== 'Space' || e.repeat || !canCapture || isPending) return;
            if (SHORTCUT_BLOCKERS.includes((e.target as HTMLElement).tagName)) return;
            e.preventDefault();
            mutate(captureRequest);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canCapture, isPending, mutate]);

    const startSession = () =>
        mutate(async () => {
            await startCalibrationSession();
            setStreamKey((k) => k + 1);
            toast.success('Calibration session started.');
        });

    const endSession = () => mutate(endCalibrationSession);

    const streamSrc = session && live ? `${backendUrl}/api/calibration/preview?t=${streamKey}` : null;
    const report = [...(calibration?.report ?? []), ...(calibration?.floor_report ?? [])];

    return (
        <AppLayout>
            <div className="flex flex-col gap-8 max-w-[1800px] mx-auto">
                <div className="flex items-end justify-between gap-6 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-text">Calibration</h1>
                        <p className="mt-2 text-sm text-text-muted">
                            Calibrate the stereo cameras after they move. Recalibrating replaces the calibration used for all stereo videos.
                        </p>
                    </div>
                    {status?.camera_size && (
                        <span className="px-2.5 py-1 rounded border border-border text-xs font-medium tabular-nums text-text-secondary">
                            {status.camera_size[0]} x {status.camera_size[1]} per camera
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                    <div className="flex flex-col gap-4 min-w-0">
                        <CalibrationPreview
                            src={streamSrc}
                            starting={isPending && !session}
                            onError={() => toast.warn('Preview stopped. Is the session still running?')}
                        />

                        <div className="flex flex-wrap items-center gap-3">
                            {!session ? (
                                <Button onClick={startSession} disabled={isPending} className="gap-2">
                                    <Play className="w-4 h-4" /> Start session
                                </Button>
                            ) : (
                                <>
                                    <Button onClick={() => mutate(captureRequest)} disabled={!canCapture || isPending} className="gap-2">
                                        <Camera className="w-4 h-4" /> Capture
                                        <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono">Space</kbd>
                                    </Button>
                                    <Button variant="secondary" onClick={() => mutate(undoPair)} disabled={!session.saved || busy || isPending} className="gap-2">
                                        <Undo2 className="w-4 h-4" /> Undo
                                    </Button>
                                    <Button variant="secondary" onClick={() => mutate(runCalibration)} disabled={pairs < minPairs || busy || isPending} className="gap-2">
                                        <Calculator className="w-4 h-4" /> Calibrate
                                    </Button>
                                    <Button variant="secondary" onClick={() => mutate(runFloorLevel)} disabled={!calibration || busy || isPending} className="gap-2">
                                        <Layers className="w-4 h-4" /> Set floor
                                    </Button>
                                    <Button variant="ghost" onClick={endSession} disabled={busy || isPending} className="gap-2 ml-auto">
                                        <StopCircle className="w-4 h-4" /> End session
                                    </Button>
                                </>
                            )}
                        </div>
                        {session && (
                            <p className="text-xs text-text-muted">
                                Hold the board fully inside both views and keep it still, then capture. Calibrate needs at least {minPairs} pairs; {aimPairs} or more is best.
                                Set the floor by lying the board flat where the athlete stands.
                            </p>
                        )}
                    </div>

                    <aside className="flex flex-col gap-4">
                        <Panel title="Session">
                            {session ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-2xl font-semibold tabular-nums text-text">
                                            {pairs}
                                            <span className="text-sm font-normal text-text-muted"> / {aimPairs} pairs</span>
                                        </span>
                                        <span className="text-xs text-text-muted">min {minPairs}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, (pairs / aimPairs) * 100)}%` }} />
                                    </div>
                                    <p className="font-mono text-[11px] text-text-muted truncate" title={session.folder}>{session.folder.split(/[\\/]/).pop()}</p>
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">No session running.</p>
                            )}
                        </Panel>

                        {session && (
                            <Panel title="Coverage">
                                <CoverageChecks checks={session.checks} />
                            </Panel>
                        )}

                        <Panel title="Calibration">
                            {calibration ? (
                                <div className="flex flex-col gap-4">
                                    {status?.size_mismatch && (
                                        <p className="text-xs text-amber-500">
                                            Cameras now deliver {status.camera_size?.join(' x ')} but this calibration was made at {calibration.camera_size.join(' x ')}. Recalibrate.
                                        </p>
                                    )}
                                    <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
                                        <dt className="text-text-muted">Stereo RMS</dt>
                                        <dd className="text-text tabular-nums text-right">{calibration.rms.toFixed(3)} px</dd>
                                        <dt className="text-text-muted">Square size</dt>
                                        <dd className="text-text tabular-nums text-right">{calibration.square_mm} mm</dd>
                                        <dt className="text-text-muted">Pairs used</dt>
                                        <dd className="text-text tabular-nums text-right">{calibration.pairs}</dd>
                                        <dt className="text-text-muted">Floor level</dt>
                                        <dd className={`text-right ${calibration.floor_set ? 'text-green-500' : 'text-text-muted'}`}>{calibration.floor_set ? 'Set' : 'Not set'}</dd>
                                        <dt className="text-text-muted">Updated</dt>
                                        <dd className="text-text text-right">{new Date(calibration.updated_at).toLocaleString()}</dd>
                                    </dl>
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">No calibration yet. Capture pairs, then calibrate.</p>
                            )}
                        </Panel>

                        <Panel title="Report">
                            <CalibrationReport lines={report} />
                        </Panel>
                    </aside>
                </div>
            </div>
        </AppLayout>
    );
};

export default CalibrationPage;
