import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { ArrowLeftRight, RefreshCw, VideoOff } from 'lucide-react';
import Button from '@/components/ui/button';
import { errorDetail } from '@/api/calibrationApi';
import { getCameraSettings, saveCameraSettings, scanCameras, type CameraScan } from '@/api/cameraApi';

interface CameraSetupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The cameras are in use (live feed, recording or calibration session): picking is disabled. */
    busy?: boolean;
}

/** Pick which USB camera is the left and which is the right one, from snapshots of each camera. */
const CameraSetupDialog = ({ open, onOpenChange, busy = false }: CameraSetupDialogProps) => {
    const queryClient = useQueryClient();
    const { data: settings } = useQuery({ queryKey: ['camera-settings'], queryFn: getCameraSettings, enabled: open });
    const [scan, setScan] = useState<CameraScan | null>(null);
    const [picked, setPicked] = useState<{ left: number; right: number } | null>(null);
    const left = picked?.left ?? settings?.left;
    const right = picked?.right ?? settings?.right;
    const wanted = settings ? `${settings.width} x ${settings.height}` : '';

    const scanMutation = useMutation({
        mutationFn: scanCameras,
        onSuccess: (res) => {
            setScan(res);
            if (!res.devices.length) toast.warn('No cameras found. Check the USB cables, and close OBS / Zoom / Teams.');
        },
        onError: (error) => toast.error(errorDetail(error, 'Could not scan the cameras.')),
    });
    const saveMutation = useMutation({
        mutationFn: () => saveCameraSettings(left!, right!),
        onSuccess: (res) => {
            toast.success(`Saved: left = camera ${res.left}, right = camera ${res.right}.`);
            queryClient.setQueryData(['camera-settings'], res);
            setPicked(null);
            onOpenChange(false);
        },
        onError: (error) => toast.error(errorDetail(error, 'Could not save the camera choice.')),
    });

    const choose = (side: 'left' | 'right', index: number) => {
        if (left == null || right == null) return;
        // Picking the camera that is on the other side swaps the two.
        const next = side === 'left'
            ? { left: index, right: index === right ? left : right }
            : { right: index, left: index === left ? right : left };
        setPicked(next);
    };
    const changed = settings != null && (left !== settings.left || right !== settings.right);

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPicked(null); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[94vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                    <div className="border-b border-border px-5 py-4">
                        <Dialog.Title className="font-semibold text-text">Cameras</Dialog.Title>
                        <Dialog.Description className="mt-1 text-xs text-text-muted">
                            Choose which camera is on the left and which on the right. Scan to see a snapshot of each camera and the size it delivers
                            {wanted ? ` (both should be ${wanted})` : ''}.
                        </Dialog.Description>
                    </div>

                    <div className="min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-text-muted">Now:</span>
                            <span className="px-2 py-0.5 rounded bg-background-main border border-border text-text tabular-nums">left = camera {left ?? '-'}</span>
                            <span className="px-2 py-0.5 rounded bg-background-main border border-border text-text tabular-nums">right = camera {right ?? '-'}</span>
                            <button
                                onClick={() => left != null && right != null && setPicked({ left: right, right: left })}
                                disabled={busy || left == null}
                                className="ml-1 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-text-secondary hover:text-text disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <ArrowLeftRight className="w-3.5 h-3.5" /> Swap left / right
                            </button>
                            <Button size="sm" variant="secondary" className="ml-auto h-8 gap-2"
                                disabled={busy || scanMutation.isPending} onClick={() => scanMutation.mutate()}>
                                <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                                {scanMutation.isPending ? 'Scanning...' : scan ? 'Scan again' : 'Scan cameras'}
                            </Button>
                        </div>

                        {busy && (
                            <p className="text-xs text-amber-500">The cameras are in use. Stop the live feed, recording or calibration session to change them.</p>
                        )}
                        {scanMutation.isPending && (
                            <p className="text-xs text-text-muted">Opening each camera once. 2K cameras can take up to a minute to open.</p>
                        )}

                        {scan && (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {scan.devices.map((d) => {
                                    const role = d.index === left ? 'left' : d.index === right ? 'right' : null;
                                    const sizeOk = d.width === scan.width && d.height === scan.height;
                                    return (
                                        <li key={d.index} className={`rounded-lg border p-2.5 flex flex-col gap-2 ${role ? 'border-primary/70 bg-primary/5' : 'border-border'}`}>
                                            <div className="relative aspect-video rounded bg-black overflow-hidden flex items-center justify-center">
                                                {d.preview
                                                    ? <img src={d.preview} alt={`Camera ${d.index}`} className="w-full h-full object-contain" />
                                                    : <VideoOff className="w-6 h-6 text-text-muted" />}
                                                {role && (
                                                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary text-[10px] font-semibold uppercase tracking-[0.12em] text-text-inverse">{role}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-text">Camera {d.index}</span>
                                                <span className={`text-xs tabular-nums ${sizeOk ? 'text-text-muted' : 'text-amber-500'}`}>
                                                    {d.width} x {d.height}{sizeOk ? '' : ` (not ${scan.width} x ${scan.height})`}
                                                </span>
                                                <span className="ml-auto flex gap-1.5">
                                                    {(['left', 'right'] as const).map((side) => (
                                                        <button
                                                            key={side}
                                                            onClick={() => choose(side, d.index)}
                                                            disabled={busy}
                                                            className={`h-7 px-2.5 rounded-md border text-xs font-medium capitalize transition-colors disabled:opacity-40 disabled:pointer-events-none ${role === side ? 'border-primary bg-primary text-text-inverse' : 'border-border text-text-secondary hover:text-text hover:border-primary'}`}
                                                        >
                                                            {side}
                                                        </button>
                                                    ))}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {scan && scan.devices.length > 0 && (() => {
                            const missing = (['left', 'right'] as const).filter((side) => !scan.devices.some((d) => d.index === (side === 'left' ? left : right)));
                            return missing.length > 0 && (
                                <p className="text-xs text-amber-500">No camera found for {missing.join(' and ')}: pick one above.</p>
                            );
                        })()}
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                        <Dialog.Close asChild>
                            <button className="h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text">Close</button>
                        </Dialog.Close>
                        <Button size="sm" className="h-9" disabled={busy || !changed || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                            Save
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default CameraSetupDialog;
