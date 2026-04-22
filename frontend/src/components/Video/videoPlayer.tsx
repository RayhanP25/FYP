import { useEffect, useRef, useState, useCallback } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { getVideoUrl } from '@/api/videoApi';
import { api } from '@/api/axiosInstance';
import { toast } from 'react-toastify';

interface VideoPlayerProps {
    videoId: string;
    videoUrl: string;
}

const VideoPlayer = ({ videoId, videoUrl }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<any | null>(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const analyzePose = useCallback(async () => {
        try {
            setIsAnalyzing(true);
            setError(null);

            const response = await api.post(`/api/process-video/${videoId}`);

            toast.success('Pose analysis completed successfully!');
            console.log('Analysis result:', response.data);

        } catch (err) {
            setError('Failed to analyze pose. Please try again.');
            toast.error('Pose analysis failed');
            console.error('Error analyzing pose:', err);
        } finally {
            setIsAnalyzing(false);
        }
    }, [videoId]);

    const refreshVideoUrl = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const videoData = await getVideoUrl(videoId);
            setCurrentVideoUrl(videoData.presigned_url);

            // Update video element src
            if (videoRef.current) {
                videoRef.current.src = videoData.presigned_url;
                if (playerRef.current) {
                    playerRef.current.source = {
                        type: 'video',
                        sources: [{ src: videoData.presigned_url, type: 'video/mp4' }]
                    };
                }
            }
        } catch (err) {
            setError('Failed to refresh video URL. Please try again.');
            console.error('Error refreshing video URL:', err);
        } finally {
            setIsLoading(false);
        }
    }, [videoId, setIsLoading, setError, setCurrentVideoUrl, videoRef, playerRef]);

    useEffect(() => {
        // Clean up previous player instance
        if (playerRef.current) {
            playerRef.current.destroy();
            playerRef.current = null;
        }

        if (videoRef.current) {
            playerRef.current = new Plyr(videoRef.current, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                autoplay: false,
                muted: false,
                clickToPlay: true,
                hideControls: true,
                resetOnEnd: true,
                keyboard: { focused: true, global: true },
                tooltips: { controls: true, seek: true },
            });

            videoRef.current.addEventListener('error', (e) => {
                console.error('Video error:', e);
                setError('Video failed to load. The URL may have expired.');
            });

            // Auto-refresh URL every 50 minutes (before 1-hour expiration)
            const refreshInterval = setInterval(refreshVideoUrl, 50 * 60 * 1000);

            return () => {
                clearInterval(refreshInterval);
                if (playerRef.current) {
                    playerRef.current.destroy();
                    playerRef.current = null;
                }
            };
        }
    }, [videoId, videoUrl, refreshVideoUrl]);

    return (
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-text-primary">Video Analysis</h3>
                    <button
                        onClick={analyzePose}
                        disabled={isAnalyzing}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
                    >
                        {isAnalyzing ? 'Analyzing Pose...' : 'Analyze Pose'}
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-red-600 text-sm mb-2">{error}</p>
                        <button
                            onClick={refreshVideoUrl}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                            {isLoading ? 'Refreshing...' : 'Refresh Video'}
                        </button>
                    </div>
                )}

                <div className="aspect-video bg-gray-900 rounded-lg shadow-lg overflow-hidden min-h-96">
                    <video
                        ref={videoRef}
                        src={currentVideoUrl}
                        className="w-full h-full object-contain"
                        controls
                    />
                </div>
            </div>
        </div>
    )
}

export default VideoPlayer