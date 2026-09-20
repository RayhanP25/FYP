import { useEffect, useState, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axiosInstance';
import * as echarts from 'echarts';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/dropdown/dropdown';
import { ChevronDown, Clock, Frame } from 'lucide-react';

interface KinematicAnalysisProps { videoId: string; }
interface AngleData { angle: number | null; confidence: number; }
type AngleMap = Record<string, AngleData>;
interface FrameData { frame_index: number; keypoints: number[][] | null; angles: AngleMap; }

const ANGLE_NAMES: Record<string, string> = { left_knee: 'Left Knee', right_knee: 'Right Knee', left_hip: 'Left Hip', right_hip: 'Right Hip', left_elbow: 'Left Elbow', right_elbow: 'Right Elbow', left_wrist: 'Left Wrist', right_wrist: 'Right Wrist', left_shoulder: 'Left Shoulder', right_shoulder: 'Right Shoulder', left_ankle: 'Left Ankle', right_ankle: 'Right Ankle' };

const ANGLE_COLORS: Record<string, string> = { left_knee: '#F55036', right_knee: '#EE6983', left_hip: '#D1C49F', right_hip: '#9B8EC4', left_elbow: '#E8A04C', right_elbow: '#C97F6B', left_wrist: '#8FA98F', right_wrist: '#7FA3B8', left_shoulder: '#E8C06B', right_shoulder: '#B08BB0', left_ankle: '#E0E0E0', right_ankle: '#9CA3AF' };

const KinematicAnalysis = ({ videoId }: KinematicAnalysisProps) => {
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
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



    const is3D = !!analysisData?.frames_3d?.length;

    const THEME = useMemo(() => {
        const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        return {
            surface: v('--color-background'),
            border: v('--color-border'),
            text: v('--color-text'),
            textSecondary: v('--color-text-secondary'),
            textMuted: v('--color-text-muted'),
            primary: v('--color-primary'),
        };
    }, []);

    const availableAngles = analysisData
        ? Object.keys(ANGLE_NAMES).filter((name) =>
              is3D
                  ? analysisData.frames_3d.some((f: any) => typeof f.angles_3d?.[name] === 'number')
                  : analysisData.frames.some((f: FrameData) => f.angles?.[name]?.angle != null)
          )
        : [];

    // Echarts Initialization
    useEffect(() => {
        if (!analysisData || !chartRef.current || (!analysisData.frames?.length && !analysisData.frames_3d?.length)) return;
        
        const buildSeries = (angleName: string) => {
            const data: [number, number][] = [];
            const toX = (idx: number) => xAxisMode === 'time' ? idx / analysisData.fps : idx;
            if (is3D) {
                analysisData.frames_3d.forEach((f: any) => {
                    const v = f.angles_3d?.[angleName];
                    if (typeof v === 'number') data.push([toX(f.frame_index), v]);
                });
            } else {
                analysisData.frames.forEach((f: FrameData) => {
                    const ad = f.angles?.[angleName];
                    if (ad && ad.angle !== null && ad.confidence > 0.5) data.push([toX(f.frame_index), ad.angle]);
                });
            }
            const col = ANGLE_COLORS[angleName] || THEME.textSecondary;
            return {
                name: ANGLE_NAMES[angleName],
                type: 'line',
                data,
                smooth: true,
                showSymbol: false,
                z: 2,
                lineStyle: { width: 2.5, color: col, opacity: 1, type: 'solid' },
                areaStyle: { opacity: 0.1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: col }, { offset: 1, color: 'transparent' }]) }
            };
        };

        const series = selectedAngles.map((a) => buildSeries(a));

        if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current);
        
        chartInstance.current.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: THEME.surface,
                borderColor: THEME.border,
                borderWidth: 1,
                textStyle: { color: THEME.text },
                padding: [10, 14],
                borderRadius: 8,
                valueFormatter: (value: any) => Number(value).toFixed(1),
            },
            grid: { left: '3%', right: '3%', bottom: '12%', top: '8%', containLabel: true },
            xAxis: { type: 'value', name: xAxisMode === 'time' ? 'Time (s)' : 'Frame', nameLocation: 'middle', nameGap: 25, nameTextStyle: { color: THEME.textSecondary }, splitLine: { show: true, lineStyle: { color: THEME.border, type: 'dashed' } }, axisLine: { lineStyle: { color: THEME.border } }, axisLabel: { color: THEME.textMuted } },
            yAxis: { type: 'value', name: 'Angle (°)', nameLocation: 'middle', nameGap: 40, nameTextStyle: { color: THEME.textSecondary }, splitLine: { show: true, lineStyle: { color: THEME.border, type: 'dashed' } }, axisLine: { lineStyle: { color: THEME.border } }, axisLabel: { color: THEME.textMuted } },
            series
        }, true);

        const handleResize = () => chartInstance.current?.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [analysisData, selectedAngles, xAxisMode, THEME]);

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
                series: [{ markLine: { animation: false, silent: true, symbol: ['none', 'none'], label: { show: false }, data: [{ xAxis: xVal }], lineStyle: { color: '#FFFFFF', width: 2, type: 'solid' } } }]
            });
        };
        window.addEventListener('sync-time', handleSync);
        return () => window.removeEventListener('sync-time', handleSync);
    }, [xAxisMode, analysisData, THEME]);

    if (isLoading || !analysisData) return <div className="h-full flex items-center justify-center text-text-muted text-sm">Loading analysis data...</div>;

    return (
        <div className="flex flex-col w-full h-full p-5 relative">
            <div className="flex items-center justify-between mb-4 flex-shrink-0 z-10 relative">
                <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-3 px-4 py-2 text-sm bg-background border border-border rounded-lg text-text hover:bg-border transition-colors">
                        <span className="font-medium">{selectedAngles.length} Joints Tracked</span> <ChevronDown className="w-4 h-4 text-text-muted" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 bg-background border-border text-text rounded-lg p-2">
                        {availableAngles.map((k) => (
                            <DropdownMenuCheckboxItem key={k} checked={selectedAngles.includes(k)} onCheckedChange={(c) => setSelectedAngles(p => c ? [...p, k] : p.filter(a => a !== k))} className="hover:bg-border rounded-md cursor-pointer">
                                <div className="flex items-center gap-3 py-1">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ANGLE_COLORS[k] }} />
                                    <span className="font-medium text-sm">{ANGLE_NAMES[k]}</span>
                                </div>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <button onClick={() => setXAxisMode(xAxisMode === 'time' ? 'frame' : 'time')} className="flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-2 cursor-pointer hover:bg-border transition-colors" title={xAxisMode === 'time' ? 'Showing time — switch to frames' : 'Showing frames — switch to time'}>
                    <Clock className={`w-4 h-4 ${xAxisMode === 'time' ? 'text-primary' : 'text-text-muted'}`} />
                    <span className="text-xs text-text-muted">/</span>
                    <Frame className={`w-4 h-4 ${xAxisMode === 'frame' ? 'text-primary' : 'text-text-muted'}`} />
                </button>
            </div>
            
            <div ref={chartRef} className="flex-1 w-full min-h-0 relative"></div>
        </div>
    );
};

export default KinematicAnalysis;