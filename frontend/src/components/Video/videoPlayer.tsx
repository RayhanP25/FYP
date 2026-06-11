import { useEffect, useRef, useState, useCallback } from 'react';
import { getVideoUrl } from '@/api/videoApi';
import { api } from '@/api/axiosInstance';
import { toast } from 'react-toastify';
import Button from '../ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface VideoPlayerProps {
    videoId: string;
    videoUrl: string;
    onTimeUpdate?: (time: number) => void; 
}

const VideoPlayer = ({ videoId, videoUrl, onTimeUpdate }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isAnalyzed, setIsAnalyzed] = useState(false);

    // --- NEW: Butter-smooth 60fps time sync ---
    useEffect(() => {
        let animationFrameId: number;
        const video = videoRef.current;

        const loop = () => {
            if (video && !video.paused) {
                onTimeUpdate?.(video.currentTime);
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        const handlePlay = () => { loop(); };
        const handlePauseOrSeek = () => {
            if (video) onTimeUpdate?.(video.currentTime);
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };

        if (video) {
            video.addEventListener('play', handlePlay);
            video.addEventListener('pause', handlePauseOrSeek);
            video.addEventListener('seeked', handlePauseOrSeek);
            video.addEventListener('loadeddata', handlePauseOrSeek);
        }

        return () => {
            if (video) {
                video.removeEventListener('play', handlePlay);
                video.removeEventListener('pause', handlePauseOrSeek);
                video.removeEventListener('seeked', handlePauseOrSeek);
                video.removeEventListener('loadeddata', handlePauseOrSeek);
            }
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [onTimeUpdate]);
    // ------------------------------------------

    const refreshVideoUrl = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const videoData = await getVideoUrl(videoId);
            setCurrentVideoUrl(videoData.presigned_url);

            if (videoRef.current) {
                videoRef.current.src = videoData.presigned_url;
            }
        } catch (err) {
            setError('Failed to refresh video URL.');
        } finally {
            setIsLoading(false);
        }
    }, [videoId]);

    const analyzePose = useCallback(async () => {
        try {
            setIsAnalyzing(true);
            const response = await api.post(`/api/process-video/${videoId}`);
            toast.success('Pose analysis completed successfully!');
            setIsAnalyzed(true);

            if (response.data.status === 'completed' || response.data.status === 'already_processed') {
                await refreshVideoUrl();
            }
            window.dispatchEvent(new CustomEvent('analysis-complete', { detail: { videoId } }));
        } catch (err: any) {
            setError('Failed to analyze pose.');
            toast.error('Pose analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    }, [videoId, refreshVideoUrl]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.addEventListener('error', () => setError('Failed to load video.'));
            const refreshInterval = setInterval(refreshVideoUrl, 50 * 60 * 1000);
            return () => clearInterval(refreshInterval);
        }
    }, [videoId, videoUrl, refreshVideoUrl]);

    return (
        <motion.div className="flex flex-col w-full h-full p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AnimatePresence>
                {error && (
                    <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex justify-between items-center">
                        <p className="text-red-600 text-sm">{error}</p>
                        <Button onClick={refreshVideoUrl} disabled={isLoading} size="sm" variant="secondary">
                            Refresh
                        </Button>
                    </div>
                )}
            </AnimatePresence>

            <div className="flex-1 bg-gray-900 rounded-lg shadow-lg overflow-hidden relative min-h-0">
                <video
                    ref={videoRef}
                    src={currentVideoUrl}
                    className="w-full h-full object-contain"
                    controls
                    // REMOVED onTimeUpdate from here entirely. The useEffect handles it now!
                />
            </div>

            <div className="flex justify-start gap-3 mt-4 h-[40px] flex-shrink-0">
                {!isAnalyzed && (
                    <Button onClick={analyzePose} disabled={isAnalyzing} size="md">
                        {isAnalyzing ? 'Analyzing Pose...' : 'Analyze Pose'}
                    </Button>
                )}
                <Button variant="primary" size="md">Download Video</Button>
            </div>
        </motion.div>
    );
};

export default VideoPlayer;