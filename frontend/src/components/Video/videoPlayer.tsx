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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [keypointsData, setKeypointsData] = useState<any>(null);
    const [showOverlay, setShowOverlay] = useState(false);

    const analyzePose = useCallback(async () => {
        try {
            setIsAnalyzing(true);
            setError(null);

            // Start playing video when analysis begins
            if (videoRef.current) {
                videoRef.current.play().catch(e => {
                    console.log('Video play failed:', e);
                });
            }

            const response = await api.post(`/api/process-video/${videoId}`);

            toast.success('Pose analysis completed successfully!');

            // Get the full analysis data and show overlay
            if (response.data.status === 'completed' || response.data.status === 'already_processed') {
                try {
                    const analysisResponse = await api.get(`/api/get-analysis/${videoId}`);
                    if (analysisResponse.data.result) {
                        setKeypointsData(analysisResponse.data.result);
                        setShowOverlay(true);

                        // Force video to play after analysis completion
                        setTimeout(() => {
                            if (videoRef.current) {
                                videoRef.current.play();
                            }
                        }, 500);
                    } else {
                        console.log('No result field in analysis response');
                    }
                } catch (err: any) {
                    console.error('ERROR fetching analysis data:', {
                        error: err,
                        message: err.message,
                        stack: err.stack,
                        videoId
                    });
                }
            }

        } catch (err: any) {
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
            }
        } catch (err) {
            setError('Failed to refresh video URL. Please try again.');
            console.error('Error refreshing video URL:', err);
        } finally {
            setIsLoading(false);
        }
    }, [videoId]);

    const drawKeypoints = useCallback((currentTime: number, canvas: HTMLCanvasElement, video: HTMLVideoElement | null, keypointsData: any) => {

        if (!canvas || !keypointsData) {
            console.error('drawKeypoints FAILED - missing parameters:', {
                hasCanvas: !!canvas,
                hasKeypointsData: !!keypointsData
            });
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('drawKeypoints FAILED - no canvas context');
            return;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate frame index based on current time
        const fps = keypointsData.fps || 30;
        const frameIndex = Math.floor(currentTime * fps);

        if (frameIndex >= 0 && frameIndex < keypointsData.frames.length) {
            const frame = keypointsData.frames[frameIndex];
            // Calculate scaling and offset for coordinate mapping
            let scaleX, scaleY;

            // Use video dimensions if available, otherwise use canvas dimensions
            if (video && video.videoWidth && video.videoHeight) {
                const videoAspectRatio = video.videoWidth / video.videoHeight;
                const canvasAspectRatio = canvas.width / canvas.height;

                if (videoAspectRatio > canvasAspectRatio) {
                    scaleX = canvas.width / video.videoWidth;
                    scaleY = scaleX;
                } else {
                    scaleY = canvas.height / video.videoHeight;
                    scaleX = scaleY;
                }
            } else {
                // Fallback: assume keypoints are already scaled to canvas dimensions
                // or use a reasonable default scaling
                scaleX = canvas.width / 640; // assuming 640px width as base
                scaleY = canvas.height / 480; // assuming 480px height as base
            }

            // Calculate scaling once for both keypoints and skeleton
            let videoDisplayWidth, videoDisplayHeight, videoOffsetX = 0, videoOffsetY = 0;

            // Calculate proper scaling for object-fit: cover
            // The video is cropped to fill the container, so we need to find the visible area

            // Use actual video dimensions from backend for proper scaling
            const videoAspectRatio = keypointsData.video_width / keypointsData.video_height;
            const canvasAspectRatio = canvas.width / canvas.height;

            if (videoAspectRatio > canvasAspectRatio) {
                // Video is wider than container - height fills, width is cropped
                videoDisplayHeight = canvas.height;
                videoDisplayWidth = videoDisplayHeight * videoAspectRatio;
                videoOffsetX = (canvas.width - videoDisplayWidth) / 2; // Center the cropped area
            } else {
                // Video is taller than container - width fills, height is cropped
                videoDisplayWidth = canvas.width;
                videoDisplayHeight = videoDisplayWidth / videoAspectRatio;
                videoOffsetY = (canvas.height - videoDisplayHeight) / 2; // Center the cropped area
            }

            // Draw keypoints
            ctx.fillStyle = '#00ff00';
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;

            if (frame.keypoints && Array.isArray(frame.keypoints)) {
                frame.keypoints.forEach((keypoint: any, index: number) => {

                    let x, y, presence;

                    if (Array.isArray(keypoint)) {
                        // Keypoints are arrays: [x, y, presence]
                        [x, y, presence] = keypoint;
                    } else if (typeof keypoint === 'object') {
                        // Keypoints are objects: {x, y, presence} or similar
                        x = keypoint.x || keypoint.x_coord || keypoint.x_pos;
                        y = keypoint.y || keypoint.y_coord || keypoint.y_pos;
                        presence = keypoint.presence || keypoint.confidence || keypoint.score || 1;
                    }

                    if (presence > 0.5 && x !== undefined && y !== undefined) {
                        // Scale keypoints to actual video display area
                        const scaledX = x * videoDisplayWidth + videoOffsetX;
                        const scaledY = y * videoDisplayHeight + videoOffsetY;

                        // Draw keypoint
                        ctx.beginPath();
                        ctx.arc(scaledX, scaledY, 4, 0, 2 * Math.PI);
                        ctx.fill();

                        // Draw keypoint number
                        ctx.fillStyle = '#ffffff';
                        ctx.font = '10px Arial';
                        ctx.fillText(index.toString(), scaledX + 6, scaledY - 6);
                        ctx.fillStyle = '#00ff00';
                    } else {
                        console.log(`Skipping keypoint ${index} - presence too low or missing coords`);
                    }
                });
            } else {
                console.log('No keypoints array found in frame');
            }

            // Draw connections (skeleton)
            const connections = [
                [0, 1],           // Nose to Neck
                [1, 2], [1, 3],   // Neck to Shoulders
                [2, 4], [4, 6], [6, 8],   // Left Arm
                [3, 5], [5, 7], [7, 9],   // Right Arm
                [2, 10], [3, 11],         // Shoulders to Hips
                [10, 11],                 // Pelvis
                [10, 12], [12, 14], [14, 16], // Left Leg
                [11, 13], [13, 15], [15, 17]  // Right Leg
            ];

            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;

            connections.forEach(([start, end]) => {
                if (!frame.keypoints || !Array.isArray(frame.keypoints)) {
                    return;
                }

                const startKeypoint = frame.keypoints[start];
                const endKeypoint = frame.keypoints[end];

                if (startKeypoint && endKeypoint && Array.isArray(startKeypoint) && Array.isArray(endKeypoint)) {
                    const [startX, startY, startPresence] = startKeypoint;
                    const [endX, endY, endPresence] = endKeypoint;

                    if (startPresence > 0.5 && endPresence > 0.5) {
                        // Use the same scaling as keypoints
                        const scaledStartX = startX * videoDisplayWidth + videoOffsetX;
                        const scaledStartY = startY * videoDisplayHeight + videoOffsetY;
                        const scaledEndX = endX * videoDisplayWidth + videoOffsetX;
                        const scaledEndY = endY * videoDisplayHeight + videoOffsetY;

                        ctx.beginPath();
                        ctx.moveTo(scaledStartX, scaledStartY);
                        ctx.lineTo(scaledEndX, scaledEndY);
                        ctx.stroke();
                    }
                }
            });
        }
    }, []);

    // Check for existing analysis on load
    useEffect(() => {
        const checkExistingAnalysis = async () => {
            try {
                const response = await api.get(`/api/get-analysis/${videoId}`);
                if (response.data.result) {
                    setKeypointsData(response.data.result);
                    setShowOverlay(true);

                    // Force video to play after loading existing analysis
                    setTimeout(() => {
                        if (videoRef.current) {
                            videoRef.current.play();
                        }
                    }, 500);
                }
            } catch (err: any) {
                console.error('ERROR checking existing analysis:', {
                    error: err,
                    message: err.message,
                    videoId
                });
                // No existing analysis, that's fine
                console.log('No existing analysis found');
            }
        };

        checkExistingAnalysis();
    }, [videoId]);

    // Setup requestAnimationFrame for animation sync
    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas || !showOverlay || !keypointsData) {
            return;
        }

        let animationId: number;

        const animate = () => {
            if (canvas && keypointsData && videoRef.current) {
                // Sync with actual video time
                const currentTime = videoRef.current.currentTime;
                drawKeypoints(currentTime, canvas, videoRef.current, keypointsData);
            }
            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    }, [showOverlay, keypointsData, drawKeypoints]);

    // Setup canvas dimensions
    useEffect(() => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;

        const resizeCanvas = () => {
            canvas.width = video.offsetWidth;
            canvas.height = video.offsetHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.addEventListener('error', (e) => {
                console.error('Video error:', e);
                setError('Video failed to load. The URL may have expired.');
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
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                    whileHover={{ boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                >
                    <video
                        ref={videoRef}
                        src={currentVideoUrl}
                        className="w-full h-full object-cover"
                        controls
                    />
                    <AnimatePresence>
                        {showOverlay && (
                            <motion.canvas
                                ref={canvasRef}
                                className="absolute inset-0 w-full h-full pointer-events-none z-10"
                                style={{
                                    mixBlendMode: 'normal',
                                    objectFit: 'cover'
                                }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4 }}
                            />
                        )}
                    </AnimatePresence>
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
    )
}

export default VideoPlayer
