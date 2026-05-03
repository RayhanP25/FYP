import AppLayout from "../layout/AppLayout"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
import VideoPlayer from "../components/Video/videoPlayer"
import Button from "../components/ui/button"
import KinematicAnalysis from "@/components/Video/kinematicAnalysis"
import { useState } from 'react'

const VideoTest = () => {
    const [view, setView] = useState<'upload' | 'analysis'>('upload')
    const [currentVideo, setCurrentVideo] = useState<{ id: string; url: string } | null>(null)

    const handleUploadSuccess = (videoId: string, videoUrl: string) => {
        setCurrentVideo({ id: videoId, url: videoUrl })
        setView('analysis')
    }

    const handleVideoSelect = (videoId: string, videoUrl: string) => {
        setCurrentVideo({ id: videoId, url: videoUrl })
        setView('analysis')
    }

    const handleBackToUpload = () => {
        setView('upload')
        setCurrentVideo(null)
    }

    if (view === 'analysis' && currentVideo) {
        return (
            <AppLayout>
                <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-semibold text-text-primary">Video Analysis</h2>
                        <Button onClick={handleBackToUpload} variant="secondary" size="md">
                            ← Back to Upload
                        </Button>
                    </div>
                    <div className="flex gap-6">
                        <VideoPlayer videoId={currentVideo.id} videoUrl={currentVideo.url} />
                        <KinematicAnalysis videoId={currentVideo.id} />
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