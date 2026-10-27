import { useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getVideoUrl } from '@/api/videoApi';
import SkeletonOverlay, { type Keypoints2D } from './SkeletonOverlay';

export interface StudioOverlay {
    frames: Keypoints2D[];
    fps: number;
    minConf: number;
    sureConf: number;
    stabilize: boolean;
    marks?: (Record<string, string> | undefined)[];
}

interface StudioVideoProps {
    videoId: string;
    view: 'left' | 'right';
    innerRef: RefObject<HTMLVideoElement | null>;
    /** Keypoints to draw over the clean video. Without it (or without a clean video) the overlay video is shown. */
    overlay?: StudioOverlay | null;
    /** Shown when the skeleton can't be switched for this video (it's drawn into an older overlay video). */
    fixedNote?: string;
    /** Edit mode: joints on this video can be dragged. */
    edit?: {
        selectedJoint: number | null;
        onDragJoint: (phase: 'start' | 'move' | 'end', frame: number, joint: number, uv: [number, number]) => void;
    } | null;
}

const StudioVideo = ({ videoId, view, innerRef, overlay, fixedNote, edit }: StudioVideoProps) => {
    const [plainFailed, setPlainFailed] = useState(false);
    const variant = overlay && !plainFailed ? 'plain' : 'overlay';
    const { data, isLoading, isError } = useQuery({
        queryKey: ['studio-video', videoId, view, variant],
        queryFn: () => getVideoUrl(videoId, view, variant),
        staleTime: 30 * 60 * 1000,
    });
    const drawing = !!overlay && data?.variant === 'plain';

    return (
        <div className="absolute inset-0 bg-black">
            <video
                ref={innerRef}
                src={data?.presigned_url}
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-contain"
                // A clean video the browser can't play (e.g. an HEVC upload): use the overlay video instead.
                onError={() => { if (variant === 'plain') setPlainFailed(true); }}
            />
            {drawing && overlay && (
                <SkeletonOverlay videoRef={innerRef} {...overlay} editable={!!edit} selectedJoint={edit?.selectedJoint} onDragJoint={edit?.onDragJoint} />
            )}
            {edit && data && !drawing && (
                // An older analysis: the skeleton is part of this video, so edits can't be drawn or made on it.
                <div className="absolute inset-x-3 top-3 px-3 py-2 rounded-md bg-amber-500/90 text-xs font-medium text-black">
                    This video has the skeleton drawn into it, so edits won't show here. Re-analyze the recording to edit on the videos.
                </div>
            )}
            <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-medium tracking-[0.2em] text-white/70 uppercase">{view} cam</span>
            {!drawing && data && fixedNote && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/60 text-[11px] text-white/70">{fixedNote}</span>
            )}
            {isLoading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 text-text-muted animate-spin" /></div>}
            {isError && <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">Failed to load video</div>}
        </div>
    );
};

export default StudioVideo;
