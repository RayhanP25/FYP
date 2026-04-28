import { useEffect, useRef, useState, useCallback } from 'react';
import { getVideoUrl } from '@/api/videoApi';
import { api } from '@/api/axiosInstance';
import { toast } from 'react-toastify';
import Button from '../ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface VideoPlayerProps {
    videoId: string;
    videoUrl: string;
}

const VideoPlayer = ({ videoId, videoUrl }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const refreshVideoUrl = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const videoData = await getVideoUrl(videoId);
            setCurrentVideoUrl(videoData.presigned_url);

            // Update video element src
            if (videoRef.current) {
                videoRef.current.src = videoData.presigned_url;
            }
        } catch (err) {
            setError('Failed to refresh video URL. Please try again.');
            console.error('Error refreshing video URL:', err);
        } finally {
            setIsLoading(false);
        }
    }, [videoId]);

    const analyzePose = useCallback(async () => {
        try {
            setIsAnalyzing(true);
            setError(null);

            const response = await api.post(`/api/process-video/${videoId}`);

            toast.success('Pose analysis completed successfully!');

            // Refresh video URL to get the processed version
            if (response.data.status === 'completed' || response.data.status === 'already_processed') {
                await refreshVideoUrl();
            }

        } catch (err: any) {
            setError('Failed to analyze pose. Please try again.');
            toast.error('Pose analysis failed');
            console.error('Error analyzing pose:', err);
        } finally {
            setIsAnalyzing(false);
        }
    }, [videoId, refreshVideoUrl]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.addEventListener('error', () => {
                setError('Failed to load video. Please try refreshing.');
            });

            // Auto-refresh URL every 50 minutes (before 1-hour expiration)
            const refreshInterval = setInterval(refreshVideoUrl, 50 * 60 * 1000);

            return () => {
                clearInterval(refreshInterval);
            };
        }
    }, [videoId, videoUrl, refreshVideoUrl]);

    return (
        <motion.div
            className="flex-1 flex items-center justify-center p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
        >
            <motion.div
                className="w-full max-w-2xl"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            >
                <AnimatePresence>
                    {error && (
                        <motion.div
                            className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <p className="text-red-600 text-sm mb-2">{error}</p>
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Button
                                    onClick={refreshVideoUrl}
                                    disabled={isLoading}
                                    size="sm"
                                    variant="secondary"
                                >
                                    {isLoading ? 'Refreshing...' : 'Refresh Video'}
                                </Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    className="aspect-video bg-gray-900 rounded-lg shadow-lg overflow-hidden min-h-96 relative"
                    initial={{ opacity: 0, scale: 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                    whileHover={{ boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                >
                    <video
                        ref={videoRef}
                        src={currentVideoUrl}
                        className="w-full h-full object-contain"
                        controls
                    />
                </motion.div>

                <motion.div
                    className="flex justify-end mt-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                >
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                        <Button
                            onClick={analyzePose}
                            disabled={isAnalyzing}
                            size="md"
                        >
                            {isAnalyzing ? 'Analyzing Pose...' : 'Analyze Pose'}
                        </Button>
                    </motion.div>
                </motion.div>
            </motion.div>
        </motion.div>
    );
};

export default VideoPlayer;
