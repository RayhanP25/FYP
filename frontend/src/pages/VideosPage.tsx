import AppLayout from "../layout/AppLayout"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
import { useNavigate } from 'react-router-dom'

const VideosPage = () => {
    const navigate = useNavigate();

    // When a video is clicked (or just uploaded), open it in the analysis studio
    const handleVideoSelect = (videoId: string) => {
        navigate(`/analysis/${videoId}`);
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