import { useState, useEffect } from 'react';
import { api } from '../api/axiosInstance';
import { Camera, VideoOff, Video, StopCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import AppLayout from '../layout/AppLayout';

export default function CameraCapture() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [streamKey, setStreamKey] = useState(0);
    const [mode, setMode] = useState<string>('IDLE');
    const [lastVideoId, setLastVideoId] = useState<string | null>(null);

    const backendUrl = api.defaults.baseURL || 'http://localhost:8000';

    // Reflect real backend state on mount (e.g. after a page refresh)
    useEffect(() => {
        api.get('/api/camera/status')
            .then(({ data }) => {
                setIsStreaming(!!data.live);
                setIsRecording(!!data.recording);
                setMode(data.mode || 'IDLE');
                if (data.live) setStreamKey((k) => k + 1);
            })
            .catch(() => { /* not started yet */ });
    }, []);

    const toggleStream = async () => {
        if (isStreaming) {
            try {
                if (isRecording) {
                    toast.warn('Stop recording before stopping the feed.');
                    return;
                }
                await api.post('/api/camera/stop-feed');
                setIsStreaming(false);
                setMode('IDLE');
                toast.info('Cameras disconnected.');
            } catch {
                toast.error('Failed to stop cameras.');
            }
            return;
        }

        setIsConnecting(true);
        try {
            const { data } = await api.post('/api/camera/start-feed', {}, { timeout: 60000 });
            setStreamKey((k) => k + 1);
            setIsStreaming(true);
            setMode(data.mode || 'LIVE');
            toast.success(`Live feed started (${data.mode} mode).`);
        } catch (error: unknown) {
            const axiosErr = error as {
                code?: string;
                response?: { data?: { detail?: unknown } };
            };
            if (axiosErr.code === 'ECONNABORTED') {
                toast.error('Connecting to the cameras timed out. Check that both camera apps are running and reachable.');
                return;
            }
            const detail = axiosErr.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to start the cameras.');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleStartRecording = async () => {
        try {
            await api.post('/api/camera/start-recording');
            setIsRecording(true);
            setLastVideoId(null);
            toast.info('Recording started — perform your movement!');
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(detail || 'Failed to start recording.');
        }
    };

    const handleStopRecording = async () => {
        const id = toast.loading('Saving recording to MinIO...');
        try {
            const { data } = await api.post('/api/camera/stop-recording');
            setIsRecording(false);
            setLastVideoId(data.video_id);
            toast.update(id, {
                render: `Saved ${data.frames} frames. Find it in Videos to analyze.`,
                type: 'success',
                isLoading: false,
                autoClose: 4000,
            });
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.update(id, {
                render: detail || 'Failed to stop recording.',
                type: 'error',
                isLoading: false,
                autoClose: 4000,
            });
        }
    };

    const status = isStreaming
        ? {
              boxClass: 'border-green-500/50 bg-green-500/5',
              badgeClass: 'bg-green-500/10 text-green-500 border-green-500/20',
              statusText: 'LIVE',
              dot: 'bg-green-500 animate-pulse',
          }
        : {
              boxClass: 'border-border bg-background-main',
              badgeClass: 'bg-background text-text-muted border-border',
              statusText: 'Standby',
              dot: 'bg-text-muted',
          };

    const streamSrc = `${backendUrl}/api/camera/stream?t=${streamKey}`;

    return (
        <AppLayout>
            <div className="p-6 h-full flex flex-col overflow-hidden max-w-6xl mx-auto">
                <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 shrink-0">
                    <div>
                        <h1 className="text-3xl font-bold text-text mb-2">3D Triangulation Capture</h1>
                        <div className="flex items-center gap-3 text-sm text-text-muted">
                            <p>Synchronized stereo capture from two cameras.</p>
                            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-border"></span>
                            <p className="flex items-center gap-1.5 font-mono text-xs bg-background px-2 py-1 rounded border border-border">
                                <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-text-muted'}`}></span>
                                MODE: {isStreaming ? mode : 'IDLE'}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {isStreaming && (
                            <button
                                onClick={isRecording ? handleStopRecording : handleStartRecording}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all h-fit whitespace-nowrap shadow-md text-sm font-medium active:scale-95 ${
                                    isRecording
                                        ? 'bg-background border border-red-500 text-red-500 hover:bg-red-500/10 animate-pulse'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                            >
                                {isRecording ? <StopCircle className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                                {isRecording ? 'Stop & Save' : 'Record Video'}
                            </button>
                        )}

                        <button
                            onClick={toggleStream}
                            disabled={isConnecting}
                            className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-lg transition-all h-fit whitespace-nowrap shadow-md text-sm font-medium active:scale-95 disabled:opacity-60 ${
                                isStreaming
                                    ? 'bg-background-main border border-border text-text hover:bg-background'
                                    : 'bg-primary hover:bg-primary/90'
                            }`}
                        >
                            {isStreaming ? <StopCircle className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                            {isConnecting ? 'Connecting...' : isStreaming ? 'Stop Live Feed' : 'Start Live Feed'}
                        </button>
                    </div>
                </div>

                <div className={`rounded-xl border-2 flex flex-col relative overflow-hidden transition-colors duration-300 w-full ${status.boxClass}`}>
                    {isStreaming ? (
                        <div className="relative bg-black w-full">
                            <span className="absolute top-3 left-3 z-10 px-2 py-1 text-xs font-bold uppercase tracking-wider bg-background/90 backdrop-blur rounded border border-border text-text">
                                Left | Right (synchronized)
                            </span>
                            <img
                                key={`stereo-${streamKey}`}
                                src={streamSrc}
                                alt="Synchronized stereo feed"
                                className="w-full h-auto object-contain"
                                onError={() => toast.warn('Stereo stream failed — is the feed still running?')}
                            />
                        </div>
                    ) : (
                        <div className="aspect-video flex flex-col items-center justify-center p-8">
                            <VideoOff className="w-10 h-10 text-text-muted mb-2 opacity-40" />
                            <p className="font-bold text-lg text-text">Cameras Offline</p>
                            <p className="text-sm text-text-muted mt-2 text-center max-w-md">
                                Make sure both camera sources are available, then click &quot;Start Live Feed&quot;.
                            </p>
                            {lastVideoId && (
                                <p className="text-xs text-text-muted mt-3 font-mono">
                                    Last recording saved (id {lastVideoId.slice(-6)}). Open Videos to analyze it.
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
