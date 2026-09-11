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
                    <div className="p-5 bg-slate-900/50 border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-2xl text-cyan-400">
                        <Activity size={40} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-2xl font-light text-slate-300 tracking-wide">No video selected for analysis.</h2>
                    <Button onClick={() => navigate('/video-test')} className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-8 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all">
                        Open Library
                    </Button>
                </div>
            </AppLayout>
        )
    }

    const isStereo = true; // Switch back to checking your DB mode when ready

    return (
        <AppLayout>
            <div className="flex flex-col h-[calc(100vh-90px)] overflow-hidden gap-4 bg-slate-950 p-2 rounded-2xl">
                
                {/* Header */}
                <div className="flex items-center justify-between flex-shrink-0 px-4 pt-2">
                    <div className="flex items-center gap-4">
                        <div className="w-1.5 h-6 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
                        <h2 className="text-2xl font-medium text-slate-100 tracking-tight">Kinematic Analysis</h2>
                    </div>
                    <Button onClick={() => navigate('/video-test')} variant="secondary" size="md" className="bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors">
                        ← Back to Library
                    </Button>
                </div>
                
                {/* Top Row: Video & 3D Viewer */}
                <div className="flex flex-row h-[42%] gap-4 flex-shrink-0 px-2">
                    <div className={`${isStereo ? 'w-1/2' : 'w-full'} h-full bg-slate-900/40 backdrop-blur-sm rounded-2xl overflow-hidden shadow-xl border border-slate-800 relative group`}>
                        <VideoPlayer videoId={videoId} videoUrl={videoUrl} />
                    </div>
                    
                    {isStereo && (
                        <div className="w-1/2 h-full bg-slate-900/40 backdrop-blur-sm border border-slate-800 shadow-xl rounded-2xl overflow-hidden">
                            <Skeleton3DViewer videoId={videoId} apiBase="http://localhost:8000" />
                        </div>
                    )}
                </div>

                {/* Bottom Row: Chart */}
                <div className="flex-1 min-h-0 w-full px-2 pb-2">
                    <div className="h-full w-full bg-slate-900/40 backdrop-blur-sm border border-slate-800 shadow-xl rounded-2xl overflow-hidden">
                        <KinematicAnalysis videoId={videoId} />
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default AnalysisPage;