import { useEffect, useState } from 'react';
import { api } from '../api/axiosInstance';
import { Camera, VideoOff, Video, StopCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import AppLayout from '../layout/AppLayout';

export default function CameraCapture() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [streamKey, setStreamKey] = useState(0);
    const [detectedIndices, setDetectedIndices] = useState<number[] | null>(null);

    const backendUrl = api.defaults.baseURL || "http://localhost:8000";

    useEffect(() => {
        api.get('/api/camera/list', { timeout: 60000 })
            .then((res) => setDetectedIndices(res.data.available_indices ?? []))
            .catch(() => setDetectedIndices(null));
    }, []);

    const toggleStream = async () => {
        if (isStreaming) {
            try {
                await api.post('/api/camera/stop');
                setIsStreaming(false);
                toast.info("Webcams disconnected.");
            } catch {
                toast.error("Failed to stop cameras.");
            }
            return;
        }

        setIsConnecting(true);
        try {
            const { data } = await api.post('/api/camera/start', {}, { timeout: 45000 });
            if (!data.started) {
                const detail = data.errors
                    ? `Left: ${data.errors.left ?? 'ok'} | Right: ${data.errors.right ?? 'ok'}`
                    : data.error ?? 'Unknown error';
                toast.error(`Could not start both webcams. ${detail}`);
                return;
            }
            setStreamKey((k) => k + 1);
            setIsStreaming(true);
            toast.success(`Connected — Left: index ${data.left_index}, Right: index ${data.right_index}`);
        } catch (error: unknown) {
            const axiosErr = error as {
                code?: string;
                response?: { data?: { detail?: unknown } };
            };
            if (axiosErr.code === 'ECONNABORTED') {
                toast.error(
                    'Camera start timed out. Close Zoom/Teams/OBS, then retry. ' +
                    'If needed, set CAMERA_LEFT_INDEX and CAMERA_RIGHT_INDEX in backend/.env'
                );
                return;
            }
            const detail = axiosErr.response?.data?.detail;
            let message = 'Check that both USB webcams are plugged in.';
            if (typeof detail === 'string') {
                message = detail;
            } else if (detail && typeof detail === 'object') {
                const d = detail as { errors?: Record<string, string>; hint?: string };
                if (d.errors) {
                    message = `Left: ${d.errors.left ?? 'ok'} | Right: ${d.errors.right ?? 'ok'}`;
                }
                if (d.hint) {
                    message += ` — ${d.hint}`;
                }
            }
            toast.error(`Failed to start webcams. ${message}`);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleStartRecording = async () => {
        try {
            await api.post('/api/obs/start-recording');
            setIsRecording(true);
            toast.info("OBS Recording started... Perform your pose!");
        } catch {
            toast.error("Failed to start OBS recording.");
        }
    };

    const handleStopRecording = async () => {
        const id = toast.loading("Stopping OBS and saving...");
        try {
            const response = await api.post('/api/obs/stop-recording');
            setIsRecording(false);

            if (response.data.error) {
                toast.update(id, {
                    render: `OBS Error: ${response.data.error}`,
                    type: "error",
                    isLoading: false,
                    autoClose: 4000,
                });
            } else {
                toast.update(id, {
                    render: "Saved! Ready for upload to MinIO.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                });
            }
        } catch {
            toast.update(id, {
                render: "Failed to stop recording.",
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });
        }
    };

    const getCameraStatus = () => {
        if (isStreaming) {
            return {
                boxClass: "border-green-500/50 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]",
                badgeClass: "bg-green-500/10 text-green-500 border-green-500/20",
                icon: <Video className="w-10 h-10 text-green-500 mb-2 opacity-80" />,
                statusText: "LIVE",
                dot: "bg-green-500 animate-pulse",
            };
        }
        return {
            boxClass: "border-border bg-background-main",
            badgeClass: "bg-background text-muted border-border",
            icon: <VideoOff className="w-10 h-10 text-muted mb-2 opacity-40" />,
            statusText: "Standby",
            dot: "bg-muted",
        };
    };

    const status = getCameraStatus();
    const streamSrc = (side: 'left' | 'right') =>
        `${backendUrl}/api/camera/stream/${side}?t=${streamKey}`;

    return (
        <AppLayout>
            <div className="p-6 h-full flex flex-col overflow-hidden max-w-6xl mx-auto">

                <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 shrink-0">
                    <div>
                        <h1 className="text-3xl font-bold text-text mb-2">3D Triangulation Capture</h1>
                        <div className="flex items-center gap-3 text-sm text-text-muted">
                            <p>Synchronized stereo capture from two USB webcams.</p>
                            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-border"></span>
                            <p className="flex items-center gap-1.5 font-mono text-xs bg-background px-2 py-1 rounded border border-border">
                                <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-muted'}`}></span>
                                MODE: {isStreaming ? "DUAL WEBCAM" : "IDLE"}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {isStreaming && (
                            <button
                                onClick={isRecording ? handleStopRecording : handleStartRecording}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all h-fit whitespace-nowrap shadow-md text-sm font-medium active:scale-95 ${isRecording ? 'bg-background border border-red-500 text-red-500 hover:bg-red-500/10 animate-pulse' : 'bg-red-500 text-white hover:bg-red-600'}`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500' : 'bg-white'}`}></div>
                                {isRecording ? "Stop OBS Recording" : "Record Video"}
                            </button>
                        )}

                        <button
                            onClick={toggleStream}
                            disabled={isConnecting}
                            className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-lg transition-all h-fit whitespace-nowrap shadow-md text-sm font-medium active:scale-95 disabled:opacity-60 ${isStreaming ? 'bg-background-light border border-border text-text hover:bg-background' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
                        >
                            {isStreaming ? <StopCircle className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                            {isConnecting ? "Connecting..." : isStreaming ? "Stop Live Feed" : "Start Live Feed"}
                        </button>
                    </div>
                </div>

                <div className={`rounded-xl border-2 flex flex-col relative overflow-hidden transition-colors duration-300 w-full ${status.boxClass}`}>
                    {isStreaming ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 w-full aspect-video">
                            <div className="relative bg-black border-b md:border-b-0 md:border-r border-border/50">
                                <span className="absolute top-3 left-3 z-10 px-2 py-1 text-xs font-bold uppercase tracking-wider bg-background/90 backdrop-blur rounded border border-border text-text">
                                    Left
                                </span>
                                <img
                                    key={`left-${streamKey}`}
                                    src={streamSrc('left')}
                                    alt="Left webcam"
                                    className="w-full h-full object-contain"
                                    onError={() => toast.warn("Left webcam stream failed.")}
                                />
                            </div>
                            <div className="relative bg-black">
                                <span className="absolute top-3 left-3 z-10 px-2 py-1 text-xs font-bold uppercase tracking-wider bg-background/90 backdrop-blur rounded border border-border text-text">
                                    Right
                                </span>
                                <img
                                    key={`right-${streamKey}`}
                                    src={streamSrc('right')}
                                    alt="Right webcam"
                                    className="w-full h-full object-contain"
                                    onError={() => toast.warn("Right webcam stream failed.")}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="aspect-video flex flex-col items-center justify-center p-8">
                            {status.icon}
                            <p className="text-muted-foreground font-bold text-lg drop-shadow-md">Webcams Offline</p>
                            <p className="text-sm text-muted mt-2 text-center max-w-md">
                                Plug in both USB cameras, then click &quot;Start Live Feed&quot;.
                                Default indices are 0 (left) and 1 (right).
                            </p>
                            {detectedIndices !== null && (
                                <p className="text-xs text-muted mt-3 font-mono">
                                    Detected: {detectedIndices.length
                                        ? detectedIndices.join(', ')
                                        : 'none — check USB connections'}
                                </p>
                            )}
                        </div>
                    )}

                    <div className={`absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-bold uppercase tracking-wider bg-background/90 backdrop-blur shadow-sm ${status.badgeClass}`}>
                        <div className={`w-2 h-2 rounded-full ${status.dot}`}></div>
                        {status.statusText}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
