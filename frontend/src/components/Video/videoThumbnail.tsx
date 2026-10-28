import { useState, useEffect } from 'react';
import { FileVideo, Play } from 'lucide-react';
import { getVideoUrl } from '@/api/videoApi';

interface VideoThumbnailProps {
    videoId: string;
    className?: string;
    iconClassName?: string;
}

const VideoThumbnail = ({ videoId, className = 'w-16 h-10 rounded-md', iconClassName = 'w-3 h-3' }: VideoThumbnailProps) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    // The video can't be loaded (missing from storage, or a format the browser can't play): show a placeholder, not a black box.
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const fetchThumbnail = async () => {
            setIsLoading(true);
            try {
                const videoData = await getVideoUrl(videoId);
                setThumbnailUrl(videoData.presigned_url);
            } catch (error) {
                console.error('Failed to fetch video URL:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchThumbnail();
    }, [videoId]);

    return (
        <div className={`overflow-hidden bg-background-main ${className}`}>
            {isLoading ? (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : thumbnailUrl && !failed ? (
                <div className="relative w-full h-full">
                    {/* #t=0.5: a frame half a second in; recordings often start black while the cameras warm up. */}
                    <video className="w-full h-full object-cover" style={{ objectPosition: 'center' }} muted preload="metadata"
                        src={`${thumbnailUrl}#t=0.5`} onError={() => setFailed(true)} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className={`${iconClassName} text-white opacity-80`} />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full bg-primary/10 flex flex-col items-center justify-center gap-1.5" title={failed ? "The video couldn't be loaded (missing from storage, or a format this browser can't play)" : undefined}>
                    <FileVideo className="w-4 h-4 text-primary" />
                    {failed && <span className="text-[10px] text-text-muted">No preview</span>}
                </div>
            )}
        </div>
    );
};

export default VideoThumbnail;
