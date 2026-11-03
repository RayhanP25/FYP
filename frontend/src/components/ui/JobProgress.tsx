import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/axiosInstance';

/** What a long server job is doing (backend/progress.py, GET /api/progress/<key>). */
export interface JobState {
    stage: string;
    stages: string[];
    done: number;
    total: number;
    finished: boolean;
    error: string | null;
}

/** A new key for one job; the page sends it with the request and polls it while it waits. */
export const newJobKey = (kind: string) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Polls the job every half second while `key` is set. */
export const useJobProgress = (key: string | null) => {
    const [state, setState] = useState<{ key: string; job: JobState } | null>(null);
    useEffect(() => {
        if (!key) return;
        let stop = false;
        let timer = 0;
        const tick = async () => {
            try {
                const { data } = await api.get(`/api/progress/${encodeURIComponent(key)}`);
                if (!stop) setState({ key, job: data });
            } catch { /* not started yet */ }
            if (!stop) timer = window.setTimeout(tick, 500);
        };
        timer = window.setTimeout(tick, 300);
        return () => { stop = true; clearTimeout(timer); };
    }, [key]);
    return key && state?.key === key ? state.job : null;      // an earlier job's progress is never shown
};

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const BYTE_STAGES = ['Getting the video', 'Saving the results', 'Uploading'];

/** A progress bar: `fraction` 0-1, or null for "working, can't tell how long". */
export const ProgressBar = ({ fraction }: { fraction: number | null }) => (
    <div className="h-2 w-full rounded-full bg-border overflow-hidden" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction == null ? undefined : Math.round(fraction * 100)}>
        {fraction == null
            ? <div className="h-full w-1/3 rounded-full bg-primary animate-[jobslide_1.2s_ease-in-out_infinite]" />
            : <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }} />}
        <style>{'@keyframes jobslide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
);

interface JobProgressProps {
    title: string;
    job: JobState | null;
    /** Shown before the server reports anything (e.g. while the file is still being sent). */
    fallbackStage?: string;
    /** Overrides the job, e.g. the browser's own upload progress (0-1). */
    fraction?: number | null;
    note?: string;
}

/** The title, the current step ("Step 2 of 5: Finding body points"), a bar and how far it is. */
export const JobProgress = ({ title, job, fallbackStage = 'Starting', fraction, note }: JobProgressProps) => {
    const stage = job?.stage && job.stage !== 'Starting' ? job.stage : fallbackStage;
    const steps = job?.stages ?? [];
    const stepNo = steps.findIndex((s) => stage.startsWith(s)) + 1;
    const f = fraction !== undefined ? fraction : job && job.total > 0 ? job.done / job.total : null;
    const isBytes = BYTE_STAGES.some((s) => stage.startsWith(s));
    const amount = fraction == null && job && job.total > 0
        ? (isBytes ? `${mb(job.done)} of ${mb(job.total)}` : `${job.done} of ${job.total}`)
        : f != null ? `${Math.round(f * 100)}%` : '';
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                <span className="font-semibold text-text">{title}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text-secondary">
                    {stepNo > 0 && steps.length > 1 && <span className="text-text-muted">Step {stepNo} of {steps.length}: </span>}
                    {stage}
                </span>
                <span className="text-text-muted tabular-nums shrink-0">{amount}</span>
            </div>
            <ProgressBar fraction={f} />
            {note && <p className="text-xs text-text-muted">{note}</p>}
        </div>
    );
};

/** JobProgress in a box over the page, for jobs the user has to wait for. */
export const JobProgressOverlay = (props: JobProgressProps & { open: boolean }) => {
    if (!props.open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-[92vw] max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
                <JobProgress {...props} />
            </div>
        </div>
    );
};
