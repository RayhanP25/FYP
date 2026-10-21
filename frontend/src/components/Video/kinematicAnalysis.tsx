import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axiosInstance';
import KinematicChart, { type ChartMode } from './kinematicChart';

interface KinematicAnalysisProps { videoId: string; }

const TABS: [ChartMode, string][] = [['angles', 'Angles'], ['position', 'Position'], ['velocity', 'Velocity'], ['distance', 'Distance']];

const KinematicAnalysis = ({ videoId }: KinematicAnalysisProps) => {
    const [tab, setTab] = useState<ChartMode>('angles');
    const queryClient = useQueryClient();

    const { data: analysisData, isLoading } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => { const res = await api.get(`/api/get-analysis/${videoId}`); return res.data.result; },
        enabled: !!videoId
    });

    useEffect(() => {
        const handleAnalysisComplete = () => queryClient.invalidateQueries({ queryKey: ['analysis', videoId] });
        window.addEventListener('analysis-complete', handleAnalysisComplete);
        return () => window.removeEventListener('analysis-complete', handleAnalysisComplete);
    }, [videoId, queryClient]);

    if (isLoading || !analysisData) return <div className="h-full flex items-center justify-center text-text-muted text-sm">Loading analysis data...</div>;

    const is3D = !!analysisData.frames_3d?.length;

    const tabBar = is3D && (
        <div className="inline-flex p-1 bg-background border border-border rounded-lg">
            {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`px-3 py-1 text-sm rounded-md transition-colors ${tab === k ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}>{l}</button>
            ))}
        </div>
    );

    return <KinematicChart analysisData={analysisData} mode={tab} leading={tabBar} />;
};

export default KinematicAnalysis;
