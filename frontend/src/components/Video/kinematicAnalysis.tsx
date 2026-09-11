import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axiosInstance';
import * as echarts from 'echarts';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/dropdown/dropdown';
import { ChevronDown, Clock, Frame } from 'lucide-react';

interface KinematicAnalysisProps { videoId: string; }
interface AngleData { angle: number | null; confidence: number; }
type AngleMap = Record<string, AngleData>;
interface FrameData { frame_index: number; keypoints: number[][] | null; angles: AngleMap; angles_raw?: AngleMap; }

const ANGLE_NAMES: Record<string, string> = { left_knee: 'Left Knee', right_knee: 'Right Knee', left_hip: 'Left Hip', right_hip: 'Right Hip', left_elbow: 'Left Elbow', right_elbow: 'Right Elbow', left_wrist: 'Left Wrist', right_wrist: 'Right Wrist', left_shoulder: 'Left Shoulder', right_shoulder: 'Right Shoulder', left_ankle: 'Left Ankle', right_ankle: 'Right Ankle' };

// Vivid neon palette for dark mode
const ANGLE_COLORS: Record<string, string> = { left_knee: '#22D3EE', right_knee: '#F472B6', left_hip: '#34D399', right_hip: '#A78BFA', left_elbow: '#FBBF24', right_elbow: '#FB7185', left_wrist: '#06B6D4', right_wrist: '#A3E635', left_shoulder: '#2DD4BF', right_shoulder: '#C084FC', left_ankle: '#F43F5E', right_ankle: '#818CF8' };

const KinematicAnalysis = ({ videoId }: KinematicAnalysisProps) => {
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
    const [showRaw, setShowRaw] = useState<boolean>(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
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

    const hasRaw = !!analysisData?.frames?.some((f: FrameData) => f.angles_raw);

    // Echarts Initialization
    useEffect(() => {
        if (!analysisData || !analysisData.frames.length || !chartRef.current) return;
        
        const buildSeries = (angleName: string, source: 'angles' | 'angles_raw') => {
            const data: [number, number][] = [];
            analysisData.frames.forEach((f: FrameData) => {
                const map = source === 'angles' ? f.angles : f.angles_raw;
                const ad = map?.[angleName];
                if (ad && ad.angle !== null && ad.confidence > 0.5) data.push([xAxisMode === 'time' ? f.frame_index / analysisData.fps : f.frame_index, ad.angle]);
            });
            const col = ANGLE_COLORS[angleName] || '#94A3B8';
            const isRaw = source === 'angles_raw';
            return {
                name: isRaw ? `${ANGLE_NAMES[angleName]} (Raw)` : ANGLE_NAMES[angleName],
                type: 'line', data, smooth: !isRaw, showSymbol: false, z: isRaw ? 1 : 2,
                lineStyle: { width: isRaw ? 1.5 : 2.5, color: col, opacity: isRaw ? 0.4 : 1, type: isRaw ? 'dashed' : 'solid' },
                areaStyle: isRaw ? undefined : { opacity: 0.1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: col }, { offset: 1, color: 'transparent' }]) }
            };
        };

        const series = [...(showRaw && hasRaw ? selectedAngles.map(a => buildSeries(a, 'angles_raw')) : []), ...selectedAngles.map(a => buildSeries(a, 'angles'))];

        if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current);
        
        chartInstance.current.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderWidth: 1, textStyle: { color: '#F8FAFC' }, padding: [12, 16], borderRadius: 12 },
            grid: { left: '3%', right: '3%', bottom: '12%', top: '8%', containLabel: true },
            xAxis: { type: 'value', name: xAxisMode === 'time' ? 'Time (s)' : 'Frame', nameLocation: 'middle', nameGap: 25, splitLine: { show: true, lineStyle: { color: '#1E293B', type: 'dashed' } }, axisLabel: { color: '#64748B', fontFamily: 'monospace' } },
            yAxis: { type: 'value', name: 'Angle (°)', nameLocation: 'middle', nameGap: 40, splitLine: { show: true, lineStyle: { color: '#1E293B', type: 'dashed' } }, axisLabel: { color: '#64748B', fontFamily: 'monospace' } },
            series
        }, true);

        const handleResize = () => chartInstance.current?.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [analysisData, selectedAngles, xAxisMode, showRaw, hasRaw]);

    // EVENT-DRIVEN CURSOR SYNC (Throttled to 20fps)
    const lastUpdate = useRef<number>(0);
    useEffect(() => {
        const handleSync = (e: Event) => {
            const time = (e as CustomEvent).detail as number;
            const now = performance.now();
            if (now - lastUpdate.current < 50 || !chartInstance.current || !analysisData) return;
            lastUpdate.current = now;

            const xVal = xAxisMode === 'time' ? time : time * (analysisData.fps || 30);
            chartInstance.current.setOption({
                series: [{ markLine: { animation: false, silent: true, symbol: ['none', 'none'], label: { show: false }, data: [{ xAxis: xVal }], lineStyle: { color: '#F43F5E', width: 2, type: 'solid' } } }]
            });
        };
        window.addEventListener('sync-time', handleSync);
        return () => window.removeEventListener('sync-time', handleSync);
    }, [xAxisMode, analysisData]);

    if (isLoading || !analysisData) return <div className="h-full flex items-center justify-center text-slate-500 font-mono tracking-widest text-sm uppercase">Loading sequence data...</div>;

    return (
        <div className="flex flex-col w-full h-full p-5 relative">
            {/* Sleek unified control bar */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0 z-10 relative bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 backdrop-blur-md">
                <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-3 px-4 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all shadow-lg">
                        <span className="font-medium">{selectedAngles.length} Joints Tracked</span> <ChevronDown className="w-4 h-4 text-slate-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 bg-slate-900 border-slate-700 shadow-2xl text-slate-200 rounded-xl p-2">
                        {Object.entries(ANGLE_NAMES).map(([k, name]) => (
                            <DropdownMenuCheckboxItem key={k} checked={selectedAngles.includes(k)} onCheckedChange={(c) => setSelectedAngles(p => c ? [...p, k] : p.filter(a => a !== k))} className="hover:bg-slate-800 rounded-lg cursor-pointer">
                                <div className="flex items-center gap-3 py-1">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: ANGLE_COLORS[k], color: ANGLE_COLORS[k] }} />
                                    <span className="font-medium text-sm tracking-wide">{name}</span>
                                </div>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex gap-3">
                    {hasRaw && (
                        <button onClick={() => setShowRaw(!showRaw)} className={`text-xs px-4 py-1.5 rounded-lg border font-bold tracking-wider transition-all ${showRaw ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-slate-200'}`}>
                            RAW
                        </button>
                    )}
                    <button onClick={() => setXAxisMode(xAxisMode === 'time' ? 'frame' : 'time')} className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-lg px-4 py-1.5 cursor-pointer hover:bg-slate-800 transition-all">
                        <Clock className={`w-4 h-4 ${xAxisMode === 'time' ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'text-slate-500'}`} />
                        <span className="text-xs text-slate-600 font-black">/</span>
                        <Frame className={`w-4 h-4 ${xAxisMode === 'frame' ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'text-slate-500'}`} />
                    </button>
                </div>
            </div>
            
            <div ref={chartRef} className="flex-1 w-full min-h-0 relative -mt-2"></div>
        </div>
    );
};

export default KinematicAnalysis;