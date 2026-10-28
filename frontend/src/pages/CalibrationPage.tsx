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
    getCalibrationLibrary,
    getCalibrationStatus,
    runCalibration,
    runFloorLevel,
    startCalibrationSession,
    undoPair,
} from '@/api/calibrationApi';
import CalibrationPreview from '@/components/calibration/CalibrationPreview';
import CoverageChecks from '@/components/calibration/CoverageChecks';
import CalibrationReport from '@/components/calibration/CalibrationReport';
import CalibrationLibrary from '@/components/calibration/CalibrationLibrary';

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
    const [setupName, setSetupName] = useState<string | null>(null);
    const lastJob = useRef<string | null>(null);

    const { data: status } = useQuery({
        queryKey: ['calibration-status'],
        queryFn: getCalibrationStatus,
        refetchInterval: (query) => (query.state.data?.session || query.state.data?.job ? 1000 : 4000),
    });

    const { data: library } = useQuery({ queryKey: ['calibration-library'], queryFn: getCalibrationLibrary });

    const session = status?.session ?? null;
    const calibration = status?.calibration ?? null;
    const busy = !!status?.job;
    const live = !!status?.live;
    const pairs = session?.pairs ?? 0;
    const minPairs = session?.min_pairs ?? 15;
    const aimPairs = session?.aim_pairs ?? 25;
    const canCapture = !!session && live && !busy;
    // Default the setup box to the setup in use (until the user types something).
    const activeSetup = calibration?.setup && calibration.setup !== 'Unassigned' ? calibration.setup : '';
    const setup = setupName ?? activeSetup;

    const { mutate, isPending } = useMutation({
        mutationFn: (request: () => Promise<unknown>) => request(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calibration-status'] });
            queryClient.invalidateQueries({ queryKey: ['calibration-library'] });
        },
        onError: (error) => toast.error(errorDetail(error, 'Something went wrong.')),
    });

    useEffect(() => {
        const job = status?.job ?? null;
        if (lastJob.current && !job && status?.message) {
            if (status.message.includes('failed')) toast.error(status.message);
            else toast.success(status.message);
        }
        if (lastJob.current && !job) queryClient.invalidateQueries({ queryKey: ['calibration-library'] });
        lastJob.current = job;
    }, [status?.job, status?.message, queryClient]);

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
            await startCalibrationSession(setup.trim());
            setStreamKey((k) => k + 1);
            toast.success('Calibration session started.');
        });

    const endSession = () => mutate(endCalibrationSession);

    const streamSrc = session && live ? `${backendUrl}/api/calibration/preview?t=${streamKey}` : null;
    const report = [...(calibration?.report ?? []), ...(calibration?.floor_report ?? [])];

    const inUse = calibration && (
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-text-muted">Setup</dt>
            <dd className="text-text text-right truncate font-medium">{calibration.setup ?? '-'}</dd>
            <dt className="text-text-muted">Calibrated</dt>
            <dd className="text-text text-right">{new Date(calibration.calibrated_at ?? calibration.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
            <dt className="text-text-muted">Stereo RMS</dt>
            <dd className="text-text tabular-nums text-right">{calibration.rms.toFixed(3)} px</dd>
            <dt className="text-text-muted">Baseline</dt>
            <dd className="text-text tabular-nums text-right">{(calibration.baseline_mm / 1000).toFixed(2)} m</dd>
            <dt className="text-text-muted">Square / pairs</dt>
            <dd className="text-text tabular-nums text-right">{calibration.square_mm} mm · {calibration.pairs}</dd>
            <dt className="text-text-muted">Floor level</dt>
            <dd className={`text-right ${calibration.floor_set ? 'text-green-500' : 'text-amber-500'}`}>{calibration.floor_set ? 'Set' : 'Not set'}</dd>
        </dl>
    );

    return (
        <AppLayout>
            {/* Fits the window (header and padding taken off): the table or the preview scrolls/shrinks inside. */}
            <div className="h-[calc(100dvh-6.5rem)] min-h-[560px] flex flex-col gap-5 max-w-[1800px] mx-auto overflow-hidden">
                <div className="flex items-end justify-between gap-6">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-semibold tracking-tight text-text">Calibration</h1>
                        <p className="mt-1.5 text-sm text-text-muted truncate">
                            Calibrate after the cameras move. Pick which saved calibration is in use; recordings keep the one they were filmed with
                            (choose another when you re-analyze).
                        </p>
                    </div>
                    {status?.camera_size && (
                        <span className="shrink-0 px-2.5 py-1 rounded border border-border text-xs font-medium tabular-nums text-text-secondary">
                            {status.camera_size[0]} x {status.camera_size[1]} per camera
                        </span>
                    )}
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_320px] gap-5">
                    <div className="min-h-0 flex flex-col gap-3">
                        {!session ? (
                            <CalibrationLibrary
                                disabled={busy || !!status?.recording}
                                action={
                                    <div className="flex items-center gap-2">
                                        <input
                                            list="calibration-setups"
                                            value={setup}
                                            onChange={(e) => setSetupName(e.target.value)}
                                            placeholder="Setup name, e.g. NeuonAI"
                                            aria-label="Setup name for a new calibration"
                                            className="w-56 px-3 py-2 rounded-lg bg-background-main border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                        />
                                        <datalist id="calibration-setups">
                                            {library?.setups.filter((s) => s !== 'Unassigned').map((s) => <option key={s} value={s} />)}
                                        </datalist>
                                        <Button onClick={startSession} disabled={isPending || !setup.trim()} className="gap-2 !py-2 text-sm">
                                            <Play className="w-4 h-4" /> New calibration
                                        </Button>
                                    </div>
                                }
                            />
                        ) : (
                            <>
                                <div className="flex-1 min-h-0">
                                    <CalibrationPreview
                                        src={streamSrc}
                                        starting={isPending && !session}
                                        onError={() => toast.warn('Preview stopped. Is the session still running?')}
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
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
                                </div>
                                <p className="text-xs text-text-muted">
                                    Hold the board fully inside both views and keep it still, then capture. Calibrate needs at least {minPairs} pairs; {aimPairs} or more is best.
                                    Set the floor by lying the board flat where the athlete stands.
                                </p>
                            </>
                        )}
                    </div>

                    <aside className="min-h-0 flex flex-col gap-4 overflow-y-auto no-scrollbar">
                        {session && (
                            <Panel title="Session">
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
                                    <p className="text-xs text-text-muted">Saves to setup <span className="text-text">{session.setup ?? 'Unassigned'}</span></p>
                                    <CoverageChecks checks={session.checks} />
                                </div>
                            </Panel>
                        )}

                        <Panel title="In use">
                            {calibration ? (
                                <div className="flex flex-col gap-3">
                                    {status?.size_mismatch && (
                                        <p className="text-xs text-amber-500">
                                            Cameras now deliver {status.camera_size?.join(' x ')} but this calibration was made at {calibration.camera_size.join(' x ')}. Recalibrate.
                                        </p>
                                    )}
                                    {inUse}
                                    {!!report.length && (
                                        <details className="group">
                                            <summary className="cursor-pointer select-none text-xs text-text-muted hover:text-text">Calibration report</summary>
                                            <div className="mt-2 max-h-48 overflow-y-auto"><CalibrationReport lines={report} /></div>
                                        </details>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">No calibration yet. Start a new calibration, capture pairs, then calibrate.</p>
                            )}
                        </Panel>
                    </aside>
                </div>
            </div>
        </AppLayout>
    );
};

export default CalibrationPage;
