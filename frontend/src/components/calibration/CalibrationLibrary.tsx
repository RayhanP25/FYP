import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import Button from '@/components/ui/button';
import {
    activateCalibration,
    deleteCalibration,
    errorDetail,
    getCalibrationLibrary,
    renameCalibration,
    type CalibrationEntry,
} from '@/api/calibrationApi';

interface CalibrationLibraryProps {
    disabled: boolean;
}

const formatDate = (entry: CalibrationEntry) =>
    new Date(entry.calibrated_at ?? entry.created_at).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const groupBySetup = (entries: CalibrationEntry[]) => {
    const groups = new Map<string, CalibrationEntry[]>();
    entries.forEach((entry) => groups.set(entry.setup, [...(groups.get(entry.setup) ?? []), entry]));
    // The setup in use first, then by name.
    return [...groups.entries()].sort(([a, ea], [b, eb]) => {
        const activeA = ea.some((e) => e.active);
        const activeB = eb.some((e) => e.active);
        return activeA === activeB ? a.localeCompare(b) : activeA ? -1 : 1;
    });
};

const EntryRow = ({ entry, disabled }: { entry: CalibrationEntry; disabled: boolean }) => {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(entry.setup);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['calibration-library'] });
        queryClient.invalidateQueries({ queryKey: ['calibration-status'] });
    };
    const { mutate, isPending } = useMutation({
        mutationFn: (request: () => Promise<unknown>) => request(),
        onSuccess: refresh,
        onError: (error) => toast.error(errorDetail(error, 'Something went wrong.')),
    });

    const saveName = () => {
        const setup = name.trim();
        setEditing(false);
        if (setup && setup !== entry.setup) mutate(() => renameCalibration(entry.id, setup));
        else setName(entry.setup);
    };

    const stat = (label: string, value: string, tone = 'text-text') => (
        <div className="px-2 py-1.5 text-center">
            <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">{label}</dt>
            <dd className={`mt-0.5 text-xs font-medium tabular-nums ${tone}`}>{value}</dd>
        </div>
    );
    const iconButton = 'inline-flex items-center px-1.5 py-1 rounded text-xs text-text-muted hover:text-text hover:bg-border disabled:opacity-50';

    return (
        <li className={`rounded-lg border p-3 ${entry.active ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
            <div className="flex items-center justify-between">
                {editing ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveName();
                            if (e.key === 'Escape') {
                                setName(entry.setup);
                                setEditing(false);
                            }
                        }}
                        onBlur={saveName}
                        className="min-w-0 flex-1 mr-2 px-2 py-1 rounded bg-background border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                        aria-label="Setup name"
                        placeholder="Setup name"
                    />
                ) : (
                    <span className="text-sm font-medium text-text tabular-nums">{formatDate(entry)}</span>
                )}
                {entry.active ? (
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.12em] bg-primary text-text-inverse">
                        In use
                    </span>
                ) : (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0 !px-3 !py-1 text-xs"
                        disabled={disabled || isPending}
                        onClick={() =>
                            mutate(async () => {
                                const used = await activateCalibration(entry.id);
                                toast.success(`Using the ${used.setup} calibration.`);
                            })
                        }
                    >
                        Use
                    </Button>
                )}
            </div>

            <dl className="mt-2.5 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background/40">
                {stat('RMS', entry.rms !== null ? `${entry.rms.toFixed(2)} px` : '-')}
                {stat('Baseline', `${(entry.baseline_mm / 1000).toFixed(2)} m`)}
                {stat('Floor', entry.floor_set ? 'Set' : 'Not set', entry.floor_set ? 'text-green-500' : 'text-amber-500')}
            </dl>

            <div className="mt-2 flex items-center justify-end">
                {confirmDelete ? (
                    <>
                        <span className="text-xs text-red-500 mr-auto">Delete?</span>
                        <button
                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-500/10"
                            onClick={() => mutate(() => deleteCalibration(entry.id))}
                            disabled={isPending}
                        >
                            <Check className="w-3.5 h-3.5 mr-1" /> Delete
                        </button>
                        <button className={`${iconButton} ml-1`} onClick={() => setConfirmDelete(false)}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <button className={iconButton} onClick={() => setEditing(true)} title="Move to another setup">
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Rename
                        </button>
                        {!entry.active && (
                            <button
                                className={`${iconButton} ml-1 hover:!text-red-500`}
                                onClick={() => setConfirmDelete(true)}
                                disabled={disabled}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </button>
                        )}
                    </>
                )}
            </div>
        </li>
    );
};

const CalibrationLibrary = ({ disabled }: CalibrationLibraryProps) => {
    const { data, isLoading, isError } = useQuery({ queryKey: ['calibration-library'], queryFn: getCalibrationLibrary });

    if (isLoading) return <p className="text-sm text-text-muted">Loading...</p>;
    if (isError) return <p className="text-sm text-text-muted">Could not load the saved calibrations.</p>;
    if (!data?.entries.length) return <p className="text-sm text-text-muted">No calibrations saved yet.</p>;

    return (
        <div className="flex flex-col gap-4 max-h-[520px] overflow-auto pr-1">
            {groupBySetup(data.entries).map(([setup, entries]) => (
                <div key={setup} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-text">{setup}</h3>
                        <span className="text-xs text-text-muted tabular-nums">
                            {entries.length} {entries.length === 1 ? 'calibration' : 'calibrations'}
                        </span>
                    </div>
                    {setup === 'Unassigned' && (
                        <p className="-mt-1 text-xs text-text-muted">Rename these to group them under a setup.</p>
                    )}
                    <ul className="flex flex-col gap-2">
                        {entries.map((entry) => (
                            <EntryRow key={entry.id} entry={entry} disabled={disabled} />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default CalibrationLibrary;
