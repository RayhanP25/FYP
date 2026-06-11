import AppLayout from "../layout/AppLayout"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
import VideoPlayer from "../components/Video/videoPlayer"
import Button from "../components/ui/button"
import KinematicAnalysis from "@/components/Video/kinematicAnalysis"
import Skeleton3DViewer from "../components/Skeleton3DViewer"
import { useState } from 'react'

const VideoTest = () => {
    const [view, setView] = useState<'upload' | 'analysis'>('upload')
    const [currentVideo, setCurrentVideo] = useState<{ id: string; url: string } | null>(null)
    
    // NEW: Master time state.
    const [currentTime, setCurrentTime] = useState(0)

    const handleUploadSuccess = (videoId: string, videoUrl: string) => {
        setCurrentVideo({ id: videoId, url: videoUrl })
        setView('analysis')
        setCurrentTime(0) // Reset time on new video
    }

    const handleVideoSelect = (videoId: string, videoUrl: string) => {
        setCurrentVideo({ id: videoId, url: videoUrl })
        setView('analysis')
        setCurrentTime(0) // Reset time on new video
    }

    const handleBackToUpload = () => {
        setView('upload')
        setCurrentVideo(null)
    }

    if (view === 'analysis' && currentVideo) {
        const isStereo = true; // Switch back to analysisData?.mode === "stereo_3d" when your DB is ready!

        return (
            <AppLayout>
                {/* This outer container locks the height to the viewport, preventing the window from scrolling */}
                <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden gap-4">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between flex-shrink-0">
                        <h2 className="text-2xl font-semibold text-text-primary">Video Analysis</h2>
                        <Button onClick={handleBackToUpload} variant="secondary" size="md">
                            ← Back to Upload
                        </Button>
                    </div>
                    
                    {/* TOP ROW: Video and 3D Viewer (Takes up ~40% of the screen height) */}
                    <div className="flex flex-row h-[42%] gap-4 flex-shrink-0">
                        <div className={`${isStereo ? 'w-1/2' : 'w-full'} h-full bg-background rounded-xl overflow-hidden shadow-sm border border-border`}>
                            {/* Passes the time UP to this parent */}
                            <VideoPlayer 
                                videoId={currentVideo.id} 
                                videoUrl={currentVideo.url} 
                                onTimeUpdate={setCurrentTime} 
                            />
                        </div>
                        
                        {isStereo && (
                            <div className="w-1/2 h-full bg-[#0F1523] border border-[#222B3D] rounded-xl overflow-hidden">
                                {/* Passes the time DOWN to the viewer */}
                                <Skeleton3DViewer 
                                    videoId={currentVideo.id} 
                                    apiBase="http://localhost:8000" 
                                    currentTime={currentTime} 
                                />
                            </div>
                        )}
                    </div>

                    {/* BOTTOM ROW: Kinematic Chart (Takes up remaining ~58% of screen height) */}
                    <div className="flex-1 min-h-0 w-full rounded-xl overflow-hidden">
                         {/* Passes the time DOWN to the chart cursor */}
                        <KinematicAnalysis 
                            videoId={currentVideo.id} 
                            currentTime={currentTime} 
                        />
                    </div>

                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="flex flex-row gap-6">
                <div className="flex-1 h-fit">
                    <VideoUpload onUploadSuccess={handleUploadSuccess} />
                </div>
                <div>
                    <PastVideos onVideoSelect={handleVideoSelect} />
                </div>
            </div>
        </AppLayout>
    )
}

export default VideoTest