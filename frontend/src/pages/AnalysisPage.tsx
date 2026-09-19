import AppLayout from "../layout/AppLayout"
import VideoPlayer from "../components/Video/videoPlayer"
import Button from "../components/ui/button"
import KinematicAnalysis from "@/components/Video/kinematicAnalysis"
import Skeleton3DViewer from "../components/Skeleton3DViewer"
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Activity } from "lucide-react"

const AnalysisPage = () => {
    const { videoId } = useParams<{ videoId: string }>();
    const [searchParams] = useSearchParams();
    const videoUrl = searchParams.get('url') || '';
    const navigate = useNavigate();

    if (!videoId) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-[70vh] gap-5">
                    <div className="p-5 bg-background-main border border-border rounded-2xl text-primary">
                        <Activity size={40} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-2xl font-medium text-text tracking-tight">No video selected for analysis.</h2>
                    <p className="text-sm text-text-muted -mt-2">Pick a clip from your library to view its kinematics.</p>
                    <Button onClick={() => navigate('/video-test')} className="mt-2 px-8">
                        Open Library
                    </Button>
                </div>
            </AppLayout>
        )
    }

    const isStereo = true; // Switch back to checking your DB mode when ready

    return (
        <AppLayout>
            <div className="flex flex-col h-[calc(100vh-90px)] overflow-hidden gap-4">
                
                {/* Header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                        <h2 className="text-2xl font-semibold text-text tracking-tight">Kinematic Analysis</h2>
                    </div>
                    <Button onClick={() => navigate('/video-test')} variant="secondary" size="md">
                        ← Back to Library
                    </Button>
                </div>
                
                {/* Top Row: Video & 3D Viewer */}
                <div className="flex flex-row h-[42%] gap-4 flex-shrink-0">
                    <div className={`${isStereo ? 'w-1/2' : 'w-full'} h-full bg-background-main border border-border rounded-xl shadow-sm overflow-hidden relative`}>
                        <VideoPlayer videoId={videoId} videoUrl={videoUrl} />
                    </div>
                    
                    {isStereo && (
                        <div className="w-1/2 h-full bg-background-main border border-border rounded-xl shadow-sm overflow-hidden">
                            <Skeleton3DViewer videoId={videoId} apiBase="http://localhost:8000" />
                        </div>
                    )}
                </div>

                {/* Bottom Row: Chart */}
                <div className="flex-1 min-h-0 w-full pb-1">
                    <div className="h-full w-full bg-background-main border border-border rounded-xl shadow-sm overflow-hidden">
                        <KinematicAnalysis videoId={videoId} />
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default AnalysisPage;