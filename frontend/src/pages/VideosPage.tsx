import AppLayout from "../layout/AppLayout"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
import { useNavigate } from 'react-router-dom'

const VideosPage = () => {
    const navigate = useNavigate();

    // When a video is clicked, send the ID and URL safely to the new Analysis route
    const handleVideoSelect = (videoId: string, videoUrl: string) => {
        navigate(`/kinematic-analysis/${videoId}?url=${encodeURIComponent(videoUrl)}`);
    }

    return (
        <AppLayout>
            <div className="flex flex-row gap-6">
                <div className="flex-1 h-fit">
                    <VideoUpload onUploadSuccess={handleVideoSelect} />
                </div>
                <div>
                    <PastVideos onVideoSelect={handleVideoSelect} />
                </div>
            </div>
        </AppLayout>
    )
}

export default VideosPage;