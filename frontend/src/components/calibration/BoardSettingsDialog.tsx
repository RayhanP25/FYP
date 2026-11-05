import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Button from '@/components/ui/button';
import { errorDetail, getBoardSettings, RECOMMENDED_BOARD, saveBoardSettings, type BoardSettings } from '@/api/calibrationApi';

interface BoardSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Draft = { cols: string; rows: string; square_mm: string; expected_baseline_mm: string };

const toDraft = (b: Omit<BoardSettings, 'locked' | 'recommended'>): Draft => ({
    cols: String(b.cols),
    rows: String(b.rows),
    square_mm: String(b.square_mm),
    expected_baseline_mm: String(b.expected_baseline_mm || 0),
});

/** The printed checkerboard (inner corners, square size) and the tape-measured distance between the cameras. */
const BoardSettingsDialog = ({ open, onOpenChange }: BoardSettingsDialogProps) => {
    const queryClient = useQueryClient();
    const { data: board, isError } = useQuery({ queryKey: ['calibration-board'], queryFn: getBoardSettings, enabled: open, retry: 1 });
    const rec = board?.recommended ?? RECOMMENDED_BOARD;
    const [draft, setDraft] = useState<Draft | null>(null);
    useEffect(() => {
        // the saved settings; if they can't be loaded, start from the recommended ones
        if (open && board) setDraft(toDraft(board));
        else if (open && isError) setDraft(toDraft(RECOMMENDED_BOARD));
        if (!open) setDraft(null);
    }, [open, board, isError]);

    const save = useMutation({
        mutationFn: () => saveBoardSettings({
            cols: Number(draft!.cols),
            rows: Number(draft!.rows),
            square_mm: Number(draft!.square_mm),
            expected_baseline_mm: Number(draft!.expected_baseline_mm || 0),
        }),
        onSuccess: (res) => {
            queryClient.setQueryData(['calibration-board'], res);
            toast.success(`Saved: ${res.cols} x ${res.rows} inner corners, ${res.square_mm} mm squares.`);
            onOpenChange(false);
        },
        onError: (error) => toast.error(errorDetail(error, 'Could not save the board settings.')),
    });

    const locked = !!board?.locked;
    const changed = !!draft && (!board || JSON.stringify(toDraft(board)) !== JSON.stringify(draft));
    const isRecommended = !!draft && JSON.stringify(toDraft(rec)) === JSON.stringify(draft);
    const cols = Number(draft?.cols), rows = Number(draft?.rows);
    const squares = draft && cols > 0 && rows > 0 ? `${cols + 1} x ${rows + 1} squares` : '';

    const field = (key: keyof Draft, label: string, help: string, unit?: string, step = '1') => (
        <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">{label}</span>
            <span className="flex items-center gap-2">
                <input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    min={0}
                    value={draft?.[key] ?? ''}
                    disabled={locked || !draft}
                    onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
                    className="w-32 px-3 py-2 rounded-lg bg-background-main border border-border text-sm text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
                />
                {unit && <span className="text-sm text-text-muted">{unit}</span>}
            </span>
            <span className="text-xs text-text-muted">
                {help}{' '}
                <span className="text-text-secondary">Recommended: {rec[key] || 0}{unit ? ` ${unit}` : ''}.</span>
            </span>
        </label>
    );

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[94vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                    <div className="border-b border-border px-5 py-4">
                        <Dialog.Title className="font-semibold text-text">Checkerboard</Dialog.Title>
                        <Dialog.Description className="mt-1 text-xs text-text-muted">
                            The printed board used for calibration. A new calibration uses these settings; earlier sessions keep the board they were captured with.
                        </Dialog.Description>
                    </div>

                    <div className="min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
                        {isError && (
                            <p className="text-xs text-amber-500">Could not load the saved settings, so the recommended ones are shown. If this keeps happening, restart the backend.</p>
                        )}
                        {locked && (
                            <p className="text-xs text-amber-500">A calibration session is open. End it to change the board (its photos were taken with this one).</p>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            {field('cols', 'Inner corners across', 'Where four squares meet. A board 10 squares wide has 9.')}
                            {field('rows', 'Inner corners down', 'The same, top to bottom. Must differ from across.')}
                        </div>
                        {squares && <p className="text-xs text-text-secondary -mt-1">That is a board of <span className="font-medium text-text">{squares}</span>.</p>}
                        {field('square_mm', 'Square size', 'Measure one printed square with a ruler. The 3D measurements are only as right as this number.', 'mm', '0.1')}
                        {field('expected_baseline_mm', 'Expected distance between the cameras', 'Optional: tape-measured from lens to lens. The calibration report checks against it. 0 = no check.', 'mm', '1')}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                        <button
                            type="button"
                            disabled={locked || !draft || isRecommended}
                            onClick={() => setDraft(toDraft(rec))}
                            className="mr-auto h-9 px-3 text-sm rounded-lg text-text-secondary hover:text-text disabled:opacity-40 disabled:hover:text-text-secondary"
                        >
                            {isRecommended ? 'Using recommended' : 'Use recommended'}
                        </button>
                        <Dialog.Close asChild>
                            <button className="h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text">Close</button>
                        </Dialog.Close>
                        <Button size="sm" className="h-9" disabled={locked || !changed || save.isPending} onClick={() => save.mutate()}>
                            Save
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default BoardSettingsDialog;
