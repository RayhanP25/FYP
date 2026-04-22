import AppLayout from "../layout/AppLayout"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
import VideoPlayer from "../components/Video/videoPlayer"
import { useState } from 'react'
// should have blank canva with keypoints on top of video 

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
                        <button
                            onClick={handleBackToUpload}
                            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                        >
                            ← Back to Upload
                        </button>
                    </div>
                    <div className="flex-1">
                        <VideoPlayer videoId={currentVideo.id} videoUrl={currentVideo.url} />
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
                <div className="">
                    <PastVideos onVideoSelect={handleVideoSelect} />
                </div>
            </div>
        </AppLayout>
    )
}

export default VideoTest