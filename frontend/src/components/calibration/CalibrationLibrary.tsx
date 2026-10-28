import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Check, Filter, Pencil, Search, Trash2, X } from 'lucide-react';
import {
    activateCalibration,
    deleteCalibration,
    errorDetail,
    getCalibrationLibrary,
    renameCalibration,
    type CalibrationEntry,
} from '@/api/calibrationApi';

interface CalibrationLibraryProps {
    /** Switching or deleting is blocked (a calibration job or a camera recording is running). */
    disabled: boolean;
    /** Shown on the left of the toolbar, like "Add user" on the Users page. */
    action?: ReactNode;
}

const formatDate = (entry: CalibrationEntry) =>
    new Date(entry.calibrated_at ?? entry.created_at).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

const cell = 'py-2.5 px-3';
const iconButton = 'p-1.5 rounded-md text-text-muted hover:text-text hover:bg-background-main transition-colors disabled:opacity-40 disabled:pointer-events-none';

const Row = ({ entry, disabled }: { entry: CalibrationEntry; disabled: boolean }) => {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(entry.setup);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { mutate, isPending } = useMutation({
        mutationFn: (request: () => Promise<unknown>) => request(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calibration-library'] });
            queryClient.invalidateQueries({ queryKey: ['calibration-status'] });
            queryClient.invalidateQueries({ queryKey: ['calibration-options'] });
        },
        onError: (error) => toast.error(errorDetail(error, 'Something went wrong.')),
    });

    const saveName = () => {
        const setup = name.trim();
        setEditing(false);
        if (setup && setup !== entry.setup) mutate(() => renameCalibration(entry.id, setup));
        else setName(entry.setup);
    };
    const use = () => mutate(async () => {
        const used = await activateCalibration(entry.id);
        toast.success(`Using the ${used.setup} calibration.`);
    });

    return (
        <tr className={`border-b border-border transition-colors ${entry.active ? 'bg-primary/5' : 'hover:bg-background-main/50'}`}>
            <td className={cell}>
                {editing ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveName();
                            if (e.key === 'Escape') { setName(entry.setup); setEditing(false); }
                        }}
                        onBlur={saveName}
                        aria-label="Setup name"
                        className="w-40 px-2 py-1 rounded bg-background-main border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                ) : (
                    <span className={`font-medium ${entry.setup === 'Unassigned' ? 'text-text-muted italic' : 'text-text'}`}>{entry.setup}</span>
                )}
            </td>
            <td className={`${cell} text-text-muted tabular-nums whitespace-nowrap`}>{formatDate(entry)}</td>
            <td className={`${cell} text-right tabular-nums`}>{entry.rms !== null ? `${entry.rms.toFixed(2)} px` : '-'}</td>
            <td className={`${cell} text-right tabular-nums`}>{(entry.baseline_mm / 1000).toFixed(2)} m</td>
            <td className={`${cell} text-right tabular-nums text-text-muted`}>{entry.pairs ?? '-'}</td>
            <td className={cell}>
                <span className={`px-2 py-0.5 text-xs rounded-full ${entry.floor_set ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {entry.floor_set ? 'Set' : 'Not set'}
                </span>
            </td>
            <td className={cell}>
                {entry.active ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.12em] bg-primary text-text-inverse">In use</span>
                ) : (
                    <button
                        onClick={use}
                        disabled={disabled || isPending}
                        className="px-3 py-1 rounded-md border border-border text-xs font-medium text-text hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Use
                    </button>
                )}
            </td>
            <td className={`${cell} text-right whitespace-nowrap`}>
                {confirmDelete ? (
                    <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-red-500 mr-1">Delete?</span>
                        <button className={`${iconButton} !text-red-500 hover:!bg-red-500/15`} onClick={() => mutate(() => deleteCalibration(entry.id))} disabled={isPending} title="Delete">
                            <Check className="w-4 h-4" />
                        </button>
                        <button className={iconButton} onClick={() => setConfirmDelete(false)} title="Cancel">
                            <X className="w-4 h-4" />
                        </button>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1">
                        <button className={iconButton} onClick={() => setEditing(true)} title="Rename / move to another setup">
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button
                            className={`${iconButton} hover:!text-red-500 hover:!bg-red-500/15`}
                            onClick={() => setConfirmDelete(true)}
                            disabled={disabled || entry.active}
                            title={entry.active ? "The calibration in use can't be deleted" : 'Delete'}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </span>
                )}
            </td>
        </tr>
    );
};

/** Saved calibrations as a table (like the Users page): search, filter by setup, switch with one click. */
const CalibrationLibrary = ({ disabled, action }: CalibrationLibraryProps) => {
    const { data, isLoading, isError } = useQuery({ queryKey: ['calibration-library'], queryFn: getCalibrationLibrary });
    const [search, setSearch] = useState('');
    const [setupFilter, setSetupFilter] = useState('all');

    const entries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (data?.entries ?? [])
            .filter((e) => setupFilter === 'all' || e.setup === setupFilter)
            .filter((e) => !q || e.setup.toLowerCase().includes(q) || formatDate(e).toLowerCase().includes(q))
            // The one in use first, then newest first (as the backend sends them).
            .sort((a, b) => Number(b.active) - Number(a.active));
    }, [data, search, setupFilter]);

    return (
        <section className="h-full min-h-0 flex flex-col rounded-xl border border-border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>{action}</div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Search calibrations..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-56 pl-10 pr-4 py-2 border border-border rounded-lg bg-background-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <select
                            value={setupFilter}
                            onChange={(e) => setSetupFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 border border-border rounded-lg bg-background-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                        >
                            <option value="all">All setups</option>
                            {data?.setups.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* The table scrolls inside its card, so the page itself never scrolls. */}
            <div className="min-h-0 flex-1 overflow-auto">
                {isLoading && <p className="py-8 text-center text-sm text-text-muted">Loading calibrations...</p>}
                {isError && <p className="py-8 text-center text-sm text-text-muted">Could not load the saved calibrations.</p>}
                {data && !entries.length && (
                    <p className="py-8 text-center text-sm text-text-muted">{data.entries.length ? 'No calibrations match.' : 'No calibrations saved yet.'}</p>
                )}
                {!!entries.length && (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background">
                            <tr className="border-b border-border text-left text-text-secondary">
                                <th className={`${cell} font-medium`}>Setup</th>
                                <th className={`${cell} font-medium`}>Calibrated</th>
                                <th className={`${cell} font-medium text-right`}>RMS</th>
                                <th className={`${cell} font-medium text-right`}>Baseline</th>
                                <th className={`${cell} font-medium text-right`}>Pairs</th>
                                <th className={`${cell} font-medium`}>Floor</th>
                                <th className={`${cell} font-medium`}>Status</th>
                                <th className={cell} />
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => <Row key={entry.id} entry={entry} disabled={disabled} />)}
                        </tbody>
                    </table>
                )}
            </div>
            {data?.entries.some((e) => e.setup === 'Unassigned') && (
                <p className="mt-3 text-xs text-text-muted">Rename "Unassigned" calibrations (pencil) to group them under their setup.</p>
            )}
        </section>
    );
};

export default CalibrationLibrary;
