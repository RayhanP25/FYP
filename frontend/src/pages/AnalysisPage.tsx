import AppLayout from "../layout/AppLayout"
import VideoPlayer from "../components/Video/videoPlayer"
import Button from "../components/ui/button"
import KinematicAnalysis from "@/components/Video/kinematicAnalysis"
import Skeleton3DViewer from "../components/Skeleton3DViewer"
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'

const AnalysisPage = () => {
    const { videoId } = useParams<{ videoId: string }>();
    const [searchParams] = useSearchParams();
    const videoUrl = searchParams.get('url') || '';
    const navigate = useNavigate();

    // If they click the Analysis tab without a video, tell them to go pick one
    if (!videoId) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <h2 className="text-xl text-text-secondary">No video selected for analysis.</h2>
                    <Button onClick={() => navigate('/video-test')} variant="primary">
                        Go to Videos
                    </Button>
                </div>
            </AppLayout>
        )
    }

    const isStereo = true; // Switch back to analysisData?.mode === "stereo_3d" when DB is ready

    return (
        <AppLayout>
            <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden gap-4">
                <div className="flex items-center justify-between flex-shrink-0">
                    <h2 className="text-2xl font-semibold text-text-primary">Video Analysis</h2>
                    <Button onClick={() => navigate('/video-test')} variant="secondary" size="md">
                        ← Back to Videos
                    </Button>
                </div>
                
                <div className="flex flex-row h-[42%] gap-4 flex-shrink-0">
                    <div className={`${isStereo ? 'w-1/2' : 'w-full'} h-full bg-background rounded-xl overflow-hidden shadow-sm border border-border`}>
                        {/* No more props passed down! Time is synced via background events */}
                        <VideoPlayer videoId={videoId} videoUrl={videoUrl} />
                    </div>
                    
                    {isStereo && (
                        <div className="w-1/2 h-full bg-[#0F1523] border border-[#222B3D] rounded-xl overflow-hidden">
                            <Skeleton3DViewer videoId={videoId} apiBase="http://localhost:8000" />
                        </div>
                    )}
                </div>

                <div className="flex-1 min-h-0 w-full rounded-xl overflow-hidden">
                    <KinematicAnalysis videoId={videoId} />
                </div>
            </div>
        </AppLayout>
    )
}

export default AnalysisPage;