import { Loader2, VideoOff } from 'lucide-react';

interface CalibrationPreviewProps {
    src: string | null;
    starting: boolean;
    onError: () => void;
}

const CalibrationPreview = ({ src, starting, onError }: CalibrationPreviewProps) => (
    <div className="relative rounded-xl overflow-hidden bg-black border border-border">
        {src ? (
            <>
                <img src={src} alt="Stereo calibration preview" className="w-full h-auto object-contain" onError={onError} />
                <span className="absolute top-3 left-3 px-2 py-1 rounded border border-border bg-background/90 text-[10px] font-medium uppercase tracking-[0.14em] text-text">
                    Left | Right
                </span>
            </>
        ) : (
            <div className="flex flex-col items-center justify-center gap-3 min-h-[320px] px-8 text-center">
                {starting ? (
                    <>
                        <Loader2 className="w-8 h-8 text-text-muted animate-spin" strokeWidth={1.5} />
                        <p className="text-sm text-text-secondary">Starting cameras...</p>
                    </>
                ) : (
                    <>
                        <VideoOff className="w-9 h-9 text-text-muted" strokeWidth={1.25} />
                        <p className="text-text">No active session</p>
                        <p className="text-sm text-text-muted max-w-sm">
                            Start a session to see both cameras with board detection and the coverage grid.
                        </p>
                    </>
                )}
            </div>
        )}
    </div>
);

export default CalibrationPreview;
