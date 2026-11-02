import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { FolderOpen } from 'lucide-react';
import Button from '@/components/ui/button';
import { errorDetail, getCalibrationSessions, resumeCalibrationSession } from '@/api/calibrationApi';

interface PreviousSessionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Setup names already in the library, offered while typing. */
    setups: string[];
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Opens an earlier calibration session again from its saved photos (after a backend restart, or to recalibrate). */
const PreviousSessionsDialog = ({ open, onOpenChange, setups }: PreviousSessionsDialogProps) => {
    const queryClient = useQueryClient();
    const { data: sessions = [], isLoading, isError } = useQuery({
        queryKey: ['calibration-sessions'],
        queryFn: getCalibrationSessions,
        enabled: open,
        staleTime: 0,
    });
    const [picked, setPicked] = useState<string | null>(null);
    const [setupName, setSetupName] = useState<string | null>(null);
    const chosen = sessions.find((s) => s.name === picked) ?? sessions[0];
    // Default the setup to the one this session was calibrated as (until the user types something).
    const setup = setupName ?? chosen?.calibrated_as.find((s) => s !== 'Unassigned') ?? '';

    const { mutate, isPending } = useMutation({
        mutationFn: () => resumeCalibrationSession(chosen!.name, setup.trim()),
        onSuccess: (res) => {
            toast.info(`Loading ${res.pairs} pairs from the saved photos...`);
            queryClient.invalidateQueries({ queryKey: ['calibration-status'] });
            onOpenChange(false);
            setPicked(null);
            setSetupName(null);
        },
        onError: (error) => toast.error(errorDetail(error, 'Could not open that session.')),
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[75vh] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                    <div className="border-b border-border px-5 py-4">
                        <Dialog.Title className="font-semibold text-text">Previous sessions</Dialog.Title>
                        <Dialog.Description className="mt-1 text-xs text-text-muted">
                            Open a session again from the photos saved on this PC. Then calibrate from them, capture more pairs, or set the floor.
                        </Dialog.Description>
                    </div>
                    <div className="min-h-0 overflow-y-auto p-3">
                        {isLoading && <p className="px-2 py-6 text-center text-sm text-text-muted">Loading sessions...</p>}
                        {isError && <p className="px-2 py-6 text-center text-sm text-text-muted">Could not load the sessions.</p>}
                        {!isLoading && !isError && !sessions.length && (
                            <p className="px-2 py-6 text-center text-sm text-text-muted">No saved sessions with photos on this PC.</p>
                        )}
                        <ul className="flex flex-col gap-1.5">
                            {sessions.map((s) => (
                                <li key={s.name}>
                                    <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${chosen?.name === s.name ? 'border-primary/70 bg-primary/5' : 'border-border hover:bg-background-main'}`}>
                                        <input type="radio" name="calibration-session" className="accent-primary" checked={chosen?.name === s.name}
                                            onChange={() => { setPicked(s.name); setSetupName(null); }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-text tabular-nums">{formatDate(s.date)}</span>
                                                {s.calibrated_as.map((name) => (
                                                    <span key={name} className="shrink-0 px-1.5 py-0.5 rounded bg-border text-[10px] font-medium text-text-secondary">{name}</span>
                                                ))}
                                            </span>
                                            <span className="block text-xs text-text-muted tabular-nums">
                                                {s.pairs} pairs{s.camera_size ? ` · ${s.camera_size[0]} x ${s.camera_size[1]}` : ''}{s.floor_photos ? ' · floor photos' : ''}
                                                {s.pairs < 15 ? ' · too few to calibrate (15 needed)' : ''}
                                            </span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>
                    {!!sessions.length && (
                        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
                            <input
                                list="previous-session-setups"
                                value={setup}
                                onChange={(e) => setSetupName(e.target.value)}
                                placeholder="Setup name, e.g. NeuonAI"
                                aria-label="Setup name for this calibration"
                                className="min-w-0 flex-1 h-9 px-3 rounded-lg bg-background-main border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            />
                            <datalist id="previous-session-setups">
                                {setups.filter((s) => s !== 'Unassigned').map((s) => <option key={s} value={s} />)}
                            </datalist>
                            <Dialog.Close asChild>
                                <button className="h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text">Cancel</button>
                            </Dialog.Close>
                            <Button size="sm" className="h-9 gap-2" disabled={!chosen || isPending} onClick={() => mutate()}>
                                <FolderOpen className="w-4 h-4" /> Open session
                            </Button>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default PreviousSessionsDialog;
