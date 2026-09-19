import { useEffect, useRef, useState, useCallback } from 'react';
import { getVideoUrl } from '@/api/videoApi';
import { api } from '@/api/axiosInstance';
import { toast } from 'react-toastify';
import Button from '../ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Wand2 } from 'lucide-react';

interface VideoPlayerProps {
    videoId: string;
    videoUrl: string;
}

const VideoPlayer = ({ videoId, videoUrl }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
    const [error, setError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isAnalyzed, setIsAnalyzed] = useState(false);

    // --- EVENT-DRIVEN TIME SYNC ---
    useEffect(() => {
        let animationFrameId: number;
        const video = videoRef.current;

        const emitTime = () => {
            if (video) window.dispatchEvent(new CustomEvent('sync-time', { detail: video.currentTime }));
        };

        const loop = () => {
            if (video && !video.paused) emitTime();
            animationFrameId = requestAnimationFrame(loop);
        };

        const handleEvents = () => { emitTime(); if (animationFrameId) cancelAnimationFrame(animationFrameId); };

        if (video) {
            video.addEventListener('play', () => { loop(); });
            video.addEventListener('pause', handleEvents);
            video.addEventListener('seeked', handleEvents);
        }

        return () => {
            if (video) {
                video.removeEventListener('play', loop);
                video.removeEventListener('pause', handleEvents);
                video.removeEventListener('seeked', handleEvents);
            }
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const refreshVideoUrl = useCallback(async () => {
        try {
            const videoData = await getVideoUrl(videoId);
            setCurrentVideoUrl(videoData.presigned_url);
            if (videoRef.current) videoRef.current.src = videoData.presigned_url;
        } catch (err) { setError('Failed to load media stream.'); }
    }, [videoId]);

    const analyzePose = async () => {
        try {
            setIsAnalyzing(true);
            const response = await api.post(`/api/process-video/${videoId}`);
            toast.success('Pose analysis completed!');
            setIsAnalyzed(true);
            if (response.data.status === 'completed' || response.data.status === 'already_processed') await refreshVideoUrl();
            window.dispatchEvent(new CustomEvent('analysis-complete', { detail: { videoId } }));
        } catch (err) { toast.error('Analysis failed'); } finally { setIsAnalyzing(false); }
    };

    return (
        <div className="flex flex-col w-full h-full relative bg-black/50">
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-4 left-4 right-4 z-20 p-3 bg-red-500/10 backdrop-blur-sm border border-red-500/20 rounded-lg flex justify-between items-center">
                        <p className="text-red-400 text-sm font-medium">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            <video ref={videoRef} src={currentVideoUrl} className="w-full h-full object-contain" controls />
            
            {!isAnalyzed && (
                <div className="absolute top-4 right-4 z-10">
                    <Button onClick={analyzePose} disabled={isAnalyzing} className="bg-primary/90 backdrop-blur-sm text-text-inverse hover:bg-primary transition-colors rounded-lg px-4 py-2 flex items-center gap-2 text-sm">
                        {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing AI...</> : <><Wand2 className="w-4 h-4" /> Extract Kinematics</>}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;