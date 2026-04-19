import AppLayout from "../layout/AppLayout"
import VideoUploadModal from "../components/Video/videoUploadModal"
// should have blank canva with keypoints on top of video 

const VideoTest = () => {
    return (
        <AppLayout>
            <div className="p-8">
                <div className="flex justify-center">
                    <div className="w-full max-w-4xl">
                        <div className="mb-4 flex justify-center">
                            {/*<VideoUploadModal />*/}
                        </div>
                        <div className="relative overflow-hidden rounded-lg shadow-lg bg-black">
                            {/*<iframe
                                src=""
                                className="w-full aspect-video"
                                allowFullScreen
                            />*/}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default VideoTest