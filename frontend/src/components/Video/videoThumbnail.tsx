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
            ) : thumbnailUrl ? (
                <div className="relative w-full h-full">
                    <video className="w-full h-full object-cover" style={{ objectPosition: 'center' }} muted preload="metadata">
                        <source src={thumbnailUrl} />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className={`${iconClassName} text-white opacity-80`} />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <FileVideo className="w-4 h-4 text-primary" />
                </div>
            )}
        </div>
    );
};

export default VideoThumbnail;
