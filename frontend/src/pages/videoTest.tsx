import AppLayout from "../layout/AppLayout"
import VideoUploadModal from "../components/Video/videoUploadModal"
import VideoUpload from "../components/Video/videoUpload"
import PastVideos from "../components/Video/pastVideos"
// should have blank canva with keypoints on top of video 

const VideoTest = () => {
    return (
        <AppLayout>
            <div className="flex flex-row gap-4">
                <div><VideoUpload /></div>
                <div><PastVideos /></div>
            </div>
        </AppLayout>
    )
}

export default VideoTest