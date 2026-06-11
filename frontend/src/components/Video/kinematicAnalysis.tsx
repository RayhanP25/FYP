import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axiosInstance';
import * as echarts from 'echarts';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/dropdown/dropdown';
import { ChevronDown, Clock, Frame } from 'lucide-react';

interface KinematicAnalysisProps {
    videoId: string;
    currentTime?: number; // <--- NEW PROP
}

// ... (KEEP ALL YOUR EXISTING INTERFACES AND CONSTANTS HERE) ...
interface AngleData { angle: number | null; confidence: number; }
type AngleMap = { left_knee?: AngleData; right_knee?: AngleData; left_hip?: AngleData; right_hip?: AngleData; left_elbow?: AngleData; right_elbow?: AngleData; left_wrist?: AngleData; right_wrist?: AngleData; left_shoulder?: AngleData; right_shoulder?: AngleData; left_ankle?: AngleData; right_ankle?: AngleData; };
interface FrameData { frame_index: number; keypoints: number[][] | null; angles: AngleMap; angles_raw?: AngleMap; }
const ANGLE_NAMES: Record<string, string> = { left_knee: 'Left Knee', right_knee: 'Right Knee', left_hip: 'Left Hip', right_hip: 'Right Hip', left_elbow: 'Left Elbow', right_elbow: 'Right Elbow', left_wrist: 'Left Wrist', right_wrist: 'Right Wrist', left_shoulder: 'Left Shoulder', right_shoulder: 'Right Shoulder', left_ankle: 'Left Ankle', right_ankle: 'Right Ankle' };
const ANGLE_COLORS: Record<string, string> = { left_knee: '#3b82f6', right_knee: '#ef4444', left_hip: '#10b981', right_hip: '#8b5cf6', left_elbow: '#f59e0b', right_elbow: '#ec4899', left_wrist: '#06b6d4', right_wrist: '#84cc16', left_shoulder: '#14b8a6', right_shoulder: '#a855f7', left_ankle: '#e11d48', right_ankle: '#6366f1' };

const KinematicAnalysis = ({ videoId, currentTime }: KinematicAnalysisProps) => {
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
    const [showRaw, setShowRaw] = useState<boolean>(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const queryClient = useQueryClient();

    const { data: analysisData, isLoading, error } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => {
            const response = await api.get(`/api/get-analysis/${videoId}`);
            return response.data.result;
        },
        enabled: !!videoId,
        retry: false
    });

    useEffect(() => {
        const handleAnalysisComplete = () => queryClient.invalidateQueries({ queryKey: ['analysis', videoId] });
        window.addEventListener('analysis-complete', handleAnalysisComplete);
        return () => window.removeEventListener('analysis-complete', handleAnalysisComplete);
    }, [videoId, queryClient]);

    const hasRaw = !!analysisData?.frames?.some((f: FrameData) => f.angles_raw);

    // Initial Chart Render Hook
    useEffect(() => {
        if (!analysisData || !analysisData.frames.length || !chartRef.current) return;
        const frames = analysisData.frames;
        const fps = analysisData.fps;
        const xOf = (frame: FrameData) => xAxisMode === 'time' ? frame.frame_index / fps : frame.frame_index;

        const buildSeries = (angleName: string, source: 'angles' | 'angles_raw') => {
            const data: [number, number][] = [];
            frames.forEach((frame: FrameData) => {
                const map = source === 'angles' ? frame.angles : frame.angles_raw;
                const angleData = map?.[angleName as keyof AngleMap];
                if (angleData && angleData.angle !== null && angleData.confidence > 0.5) {
                    data.push([xOf(frame), angleData.angle]);
                }
            });
            const color = ANGLE_COLORS[angleName] || '#666';
            const isRaw = source === 'angles_raw';
            return {
                name: isRaw ? `${ANGLE_NAMES[angleName]} (raw)` : ANGLE_NAMES[angleName],
                type: 'line', data, smooth: !isRaw, showSymbol: false, z: isRaw ? 1 : 2,
                lineStyle: { width: isRaw ? 1.25 : 2.5, color, opacity: isRaw ? 0.45 : 1, type: isRaw ? 'dashed' : 'solid' },
                emphasis: { lineStyle: { width: isRaw ? 2 : 3.5 } },
                areaStyle: isRaw ? undefined : { opacity: 0.05 }
            };
        };

        const rawSeries = (showRaw && hasRaw) ? selectedAngles.map(a => buildSeries(a, 'angles_raw')) : [];
        const healedSeries = selectedAngles.map(a => buildSeries(a, 'angles'));
        const series = [...rawSeries, ...healedSeries];

        if (!chartInstance.current) {
            chartInstance.current = echarts.init(chartRef.current);
        }

        chartInstance.current.setOption({
            title: { text: showRaw && hasRaw ? 'Joint Angles — Raw vs Healed' : 'Joint Angles Over Time', left: 'center', top: 0, textStyle: { fontSize: 14, color: '#EAEEF7' } },
            tooltip: { trigger: 'axis' },
            grid: { left: '8%', right: '5%', bottom: '10%', top: '20%' },
            xAxis: { type: 'value', name: xAxisMode === 'time' ? 'Time (s)' : 'Frame', nameLocation: 'middle', nameGap: 25 },
            yAxis: { type: 'value', name: 'Angle (°)', nameLocation: 'middle', nameGap: 40 },
            series
        }, true);

        const handleResize = () => chartInstance.current?.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [analysisData, selectedAngles, xAxisMode, showRaw, hasRaw]);

    // NEW: Real-time Cursor Sync Hook
    useEffect(() => {
        if (!chartInstance.current || currentTime === undefined || !analysisData || selectedAngles.length === 0) return;
        
        const fps = analysisData.fps || 30;
        const xVal = xAxisMode === 'time' ? currentTime : currentTime * fps;

        // Injects a vertical red cursor line into the first series without fully rebuilding the chart
        chartInstance.current.setOption({
            series: [{
                markLine: {
                    animation: false,
                    silent: true,
                    symbol: ['none', 'none'],
                    label: { show: false },
                    data: [{ xAxis: xVal }],
                    lineStyle: { color: '#ef4444', width: 2, type: 'solid' }
                }
            }]
        });
    }, [currentTime, xAxisMode, analysisData, selectedAngles]);

    useEffect(() => {
        return () => chartInstance.current?.dispose();
    }, []);

    if (isLoading || !analysisData) return <div className="p-5 min-h-[200px] text-text-secondary">Loading...</div>;
    if (error) return <div className="p-5 text-text-muted">Please analyze the video first.</div>;

    return (
        <div className="bg-background rounded-xl shadow-sm border p-4 flex flex-col w-full h-full">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-text-primary/70">Select Angles:</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-background-main border rounded-md">
                            <span className="text-text-primary/70">{selectedAngles.length} selected</span>
                            <ChevronDown className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 bg-background border">
                            {Object.entries(ANGLE_NAMES).map(([angleKey, angleName]) => (
                                <DropdownMenuCheckboxItem
                                    key={angleKey}
                                    checked={selectedAngles.includes(angleKey)}
                                    onCheckedChange={(checked) => setSelectedAngles(prev => checked ? [...prev, angleKey] : prev.filter(a => a !== angleKey))}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ANGLE_COLORS[angleKey] }} />
                                        <span>{angleName}</span>
                                    </div>
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Clock className={`w-4 h-4 ${xAxisMode === 'time' ? 'text-primary' : 'text-text-primary/30'}`} />
                        <button onClick={() => setXAxisMode(xAxisMode === 'time' ? 'frame' : 'time')} className="relative inline-flex h-6 w-11 items-center rounded-full bg-border">
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-background ${xAxisMode === 'time' ? 'translate-x-1' : 'translate-x-6'}`} />
                        </button>
                        <Frame className={`w-4 h-4 ${xAxisMode === 'frame' ? 'text-primary' : 'text-text-primary/30'}`} />
                    </div>
                </div>
            </div>
            {/* flex-1 and min-h-0 prevents the chart from forcing its parent to expand */}
            <div ref={chartRef} className="flex-1 w-full min-h-0"></div>
        </div>
    );
};

export default KinematicAnalysis;