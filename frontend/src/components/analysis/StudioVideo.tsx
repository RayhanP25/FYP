import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getVideoUrl } from '@/api/videoApi';

interface StudioVideoProps {
    videoId: string;
    view: 'left' | 'right';
    innerRef: RefObject<HTMLVideoElement | null>;
}

const StudioVideo = ({ videoId, view, innerRef }: StudioVideoProps) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['studio-video', videoId, view],
        queryFn: () => getVideoUrl(videoId, view),
        staleTime: 30 * 60 * 1000,
    });

    return (
        <div className="absolute inset-0 bg-black">
            <video ref={innerRef} src={data?.presigned_url} muted playsInline preload="auto" className="w-full h-full object-contain" />
            <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-medium tracking-[0.2em] text-white/70 uppercase">{view} cam</span>
            {isLoading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 text-text-muted animate-spin" /></div>}
            {isError && <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">Failed to load video</div>}
        </div>
    );
};

export default StudioVideo;
