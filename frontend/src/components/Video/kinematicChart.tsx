import { useEffect, useState, useRef, useMemo, type ReactNode } from 'react';
import * as echarts from 'echarts';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/dropdown/dropdown';
import { ChevronDown, Clock, Frame } from 'lucide-react';

interface AngleData { angle: number | null; confidence: number; }
interface FrameData { frame_index: number; keypoints: number[][] | null; angles: Record<string, AngleData>; }

export type ChartMode = 'angles' | 'position' | 'velocity';

const ANGLE_NAMES: Record<string, string> = { left_knee: 'Left Knee', right_knee: 'Right Knee', left_hip: 'Left Hip', right_hip: 'Right Hip', left_elbow: 'Left Elbow', right_elbow: 'Right Elbow', left_wrist: 'Left Wrist', right_wrist: 'Right Wrist', left_shoulder: 'Left Shoulder', right_shoulder: 'Right Shoulder', left_ankle: 'Left Ankle', right_ankle: 'Right Ankle' };

const ANGLE_COLORS: Record<string, string> = { left_knee: '#F55036', right_knee: '#EE6983', left_hip: '#D1C49F', right_hip: '#9B8EC4', left_elbow: '#E8A04C', right_elbow: '#C97F6B', left_wrist: '#8FA98F', right_wrist: '#7FA3B8', left_shoulder: '#E8C06B', right_shoulder: '#B08BB0', left_ankle: '#E0E0E0', right_ankle: '#9CA3AF' };

const KP_NAMES = ['Nose', 'Neck', 'Left Shoulder', 'Right Shoulder', 'Left Elbow', 'Right Elbow', 'Left Wrist', 'Right Wrist', 'Left Index', 'Right Index', 'Left Hip', 'Right Hip', 'Left Knee', 'Right Knee', 'Left Ankle', 'Right Ankle', 'Left Toe', 'Right Toe'];
const KP_COLORS = ['#F55036', '#EE6983', '#D1C49F', '#9B8EC4', '#E8A04C', '#C97F6B', '#8FA98F', '#7FA3B8', '#E8C06B', '#B08BB0', '#4CC9F0', '#F72585', '#80ED99', '#FFD166', '#06D6A0', '#EF476F', '#E0E0E0', '#9CA3AF'];
const AXES = ['X', 'Y', 'Z'];
const DASHES = ['solid', 'dashed', 'dotted'];
interface Sample { i: number; p: number[]; }

const getTrack = (frames: any[], kp: number): Sample[] =>
    frames.flatMap((f) => { const p = f.keypoints_3d?.[kp]; return p ? [{ i: f.frame_index, p: [p[0], -p[1], p[2]] }] : []; });

const getSpeeds = (track: Sample[], fps: number): (number | null)[] => {
    const raw = track.map((s, k) => {
        const a = track[k - 1];
        if (!a || s.i - a.i > 3) return null;
        return Math.hypot(s.p[0] - a.p[0], s.p[1] - a.p[1], s.p[2] - a.p[2]) / ((s.i - a.i) / fps) / 1000;
    });
    return raw.map((_, k) => {
        const w = raw.slice(Math.max(0, k - 2), k + 3).filter((v): v is number => v !== null);
        return w.length ? w.reduce((x, y) => x + y, 0) / w.length : null;
    });
};

interface KinematicChartProps {
    analysisData: any;
    mode: ChartMode;
    leading?: ReactNode;
    padded?: boolean;
}

const KinematicChart = ({ analysisData, mode, leading, padded = true }: KinematicChartProps) => {
    const [selectedKps, setSelectedKps] = useState<number[]>(() => {
        const frames: any[] = analysisData?.frames_3d || [];
        const coverage = KP_NAMES.map((_, k) => frames.filter((f) => f.keypoints_3d?.[k]).length);
        const best = coverage.indexOf(Math.max(...coverage));
        return [coverage[9] >= frames.length * 0.5 ? 9 : best];
    });
    const [unit, setUnit] = useState<'cm' | 'mm'>('cm');
    const [posMode, setPosMode] = useState<'absolute' | 'displacement'>('absolute');
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);

    const is3D = !!analysisData?.frames_3d?.length;
    const activeTab: ChartMode = is3D ? mode : 'angles';

    const THEME = useMemo(() => {
        const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        return {
            surface: v('--color-background'),
            border: v('--color-border'),
            text: v('--color-text'),
            textSecondary: v('--color-text-secondary'),
            textMuted: v('--color-text-muted'),
        };
    }, []);

    const availableAngles = Object.keys(ANGLE_NAMES).filter((name) =>
        is3D
            ? analysisData.frames_3d.some((f: any) => typeof f.angles_3d?.[name] === 'number')
            : analysisData.frames.some((f: FrameData) => f.angles?.[name]?.angle != null)
    );
    const hasNoData = activeTab !== 'angles' && !selectedKps.some((k) => analysisData.frames_3d.some((f: any) => f.keypoints_3d?.[k]));
    const availableKps = is3D ? KP_NAMES.map((_, i) => i).filter((i) => analysisData.frames_3d.some((f: any) => f.keypoints_3d?.[i])) : [];

    useEffect(() => {
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        chartInstance.current = chart;
        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(chartRef.current);
        return () => { ro.disconnect(); chart.dispose(); chartInstance.current = null; };
    }, []);

    useEffect(() => {
        const chart = chartInstance.current;
        if (!chart || (!analysisData.frames?.length && !analysisData.frames_3d?.length)) return;

        const fps = analysisData.fps || 30;
        const toX = (idx: number) => xAxisMode === 'time' ? idx / fps : idx;

        const buildSeries = (angleName: string) => {
            const data: [number, number][] = [];
            if (is3D) {
                analysisData.frames_3d.forEach((f: any) => {
                    const v = f.angles_3d?.[angleName];
                    if (typeof v === 'number') data.push([toX(f.frame_index), v]);
                });
            } else {
                analysisData.frames.forEach((f: FrameData) => {
                    const ad = f.angles?.[angleName];
                    if (ad && ad.angle !== null && ad.confidence > 0.2) data.push([toX(f.frame_index), ad.angle]);
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

        const lineOf = (name: string, col: string, data: any[], dash = 'solid') => ({
            name, type: 'line', data, showSymbol: false, z: 2,
            lineStyle: { width: 2, color: col, type: dash }, itemStyle: { color: col }
        });
        const div = unit === 'cm' ? 10 : 1;
        let series: any[];
        let yName = 'Angle (°)';
        if (activeTab === 'position') {
            yName = `Position (${unit})`;
            series = selectedKps.flatMap((kp) => {
                const track = getTrack(analysisData.frames_3d, kp);
                const start = posMode === 'displacement' && track.length ? track[0].p : [0, 0, 0];
                return AXES.map((ax, a) => lineOf(`${KP_NAMES[kp]} ${ax}`, KP_COLORS[kp], track.map((s) => [toX(s.i), (s.p[a] - start[a]) / div]), DASHES[a]));
            });
        } else if (activeTab === 'velocity') {
            yName = 'Speed (m/s)';
            series = selectedKps.map((kp) => {
                const track = getTrack(analysisData.frames_3d, kp);
                const sp = getSpeeds(track, fps);
                return lineOf(KP_NAMES[kp], KP_COLORS[kp], track.map((s, k) => [toX(s.i), sp[k]]));
            });
        } else series = selectedAngles.map((a) => buildSeries(a));

        chart.setOption({
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
            legend: { show: activeTab === 'position', top: 0, type: 'scroll', textStyle: { color: THEME.textSecondary } },
            dataZoom: [{ type: 'inside', xAxisIndex: 0 }],
            grid: { left: '3%', right: '3%', bottom: '12%', top: activeTab === 'position' ? '20%' : '14%', containLabel: true },
            xAxis: { type: 'value', name: xAxisMode === 'time' ? 'Time (s)' : 'Frame', nameLocation: 'middle', nameGap: 25, nameTextStyle: { color: THEME.textSecondary }, splitLine: { show: true, lineStyle: { color: THEME.border, type: 'dashed' } }, axisLine: { lineStyle: { color: THEME.border } }, axisLabel: { color: THEME.textMuted } },
            yAxis: { type: 'value', name: yName, nameLocation: 'end', nameGap: 14, nameTextStyle: { color: THEME.textSecondary, align: 'left' }, splitLine: { show: true, lineStyle: { color: THEME.border, type: 'dashed' } }, axisLine: { lineStyle: { color: THEME.border } }, axisLabel: { color: THEME.textMuted } },
            series
        }, true);
    }, [analysisData, selectedAngles, xAxisMode, THEME, activeTab, selectedKps, unit, posMode, is3D]);

    // EVENT-DRIVEN CURSOR SYNC (Throttled to 20fps)
    const lastUpdate = useRef<number>(0);
    useEffect(() => {
        const handleSync = (e: Event) => {
            const time = (e as CustomEvent).detail as number;
            const now = performance.now();
            if (now - lastUpdate.current < 50 || !chartInstance.current) return;
            lastUpdate.current = now;

            const xVal = xAxisMode === 'time' ? time : time * (analysisData.fps || 30);
            chartInstance.current.setOption({
                series: [{ markLine: { animation: false, silent: true, symbol: ['none', 'none'], label: { show: false }, data: [{ xAxis: xVal }], lineStyle: { color: '#FFFFFF', width: 2, type: 'solid' } } }]
            });
        };
        window.addEventListener('sync-time', handleSync);
        return () => window.removeEventListener('sync-time', handleSync);
    }, [xAxisMode, analysisData]);

    // Click on the chart -> ask the video player (if any) to seek there
    useEffect(() => {
        const chart = chartInstance.current;
        if (!chart) return;
        const zr = chart.getZr();
        const onClick = (p: any) => {
            const x = chart.convertFromPixel({ xAxisIndex: 0 }, [p.offsetX, p.offsetY])[0];
            if (typeof x === 'number' && x >= 0) window.dispatchEvent(new CustomEvent('seek-time', { detail: xAxisMode === 'time' ? x : x / (analysisData.fps || 30) }));
        };
        zr.on('click', onClick);
        return () => { zr.off('click', onClick); };
    }, [xAxisMode, analysisData]);

    const toggleKp = (k: number, c: boolean) => setSelectedKps((p) => c ? [...p, k] : p.filter((a) => a !== k));
    const toggleAngle = (k: string, c: boolean) => setSelectedAngles((p) => c ? [...p, k] : p.filter((a) => a !== k));

    const compact = !padded;
    const ctl = compact
        ? 'px-2.5 py-1 text-xs rounded-md bg-border/40 text-text-muted hover:text-text hover:bg-border transition-colors'
        : 'px-3 py-2 text-xs bg-background border border-border rounded-lg text-text hover:bg-border transition-colors';

    return (
        <div className={`flex flex-col w-full h-full relative ${compact ? 'p-3' : 'p-5'}`}>
            <div className={`flex items-center justify-between gap-3 flex-shrink-0 z-10 relative flex-wrap ${compact ? 'mb-2' : 'mb-4'}`}>
                <div className="flex items-center gap-3">
                    {leading}
                    <DropdownMenu>
                        <DropdownMenuTrigger className={`inline-flex items-center gap-2 ${compact ? ctl : 'gap-3 px-4 py-2 text-sm bg-background border border-border rounded-lg text-text hover:bg-border transition-colors'}`}>
                            <span className="font-medium">{activeTab === 'angles' ? `${selectedAngles.length} ${selectedAngles.length === 1 ? 'joint' : 'joints'}` : `${selectedKps.length} ${selectedKps.length === 1 ? 'keypoint' : 'keypoints'}`}</span> <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 bg-background border-border text-text rounded-lg p-2">
                            {activeTab !== 'angles' ? availableKps.map((k) => (
                                <DropdownMenuCheckboxItem key={k} checked={selectedKps.includes(k)} onCheckedChange={(c) => toggleKp(k, c)} className="hover:bg-border rounded-md cursor-pointer">
                                    <div className="flex items-center gap-3 py-1">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: KP_COLORS[k] }} />
                                        <span className="font-medium text-sm">{KP_NAMES[k]}</span>
                                    </div>
                                </DropdownMenuCheckboxItem>
                            )) : availableAngles.map((k) => (
                                <DropdownMenuCheckboxItem key={k} checked={selectedAngles.includes(k)} onCheckedChange={(c) => toggleAngle(k, c)} className="hover:bg-border rounded-md cursor-pointer">
                                    <div className="flex items-center gap-3 py-1">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ANGLE_COLORS[k] }} />
                                        <span className="font-medium text-sm">{ANGLE_NAMES[k]}</span>
                                    </div>
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-3'}`}>
                    {activeTab === 'position' && (
                        <>
                            <button onClick={() => setPosMode(posMode === 'absolute' ? 'displacement' : 'absolute')} className={ctl} title="Absolute position (Y up, Z depth) or displacement from first frame">
                                {posMode === 'absolute' ? 'Absolute' : 'Displacement'}
                            </button>
                            <button onClick={() => setUnit(unit === 'cm' ? 'mm' : 'cm')} className={ctl}>{unit}</button>
                        </>
                    )}
                    <button onClick={() => setXAxisMode(xAxisMode === 'time' ? 'frame' : 'time')} className={`flex items-center gap-2 ${compact ? ctl : 'bg-background border border-border rounded-lg px-4 py-2 cursor-pointer hover:bg-border transition-colors'}`} title={xAxisMode === 'time' ? 'Showing time — switch to frames' : 'Showing frames — switch to time'}>
                        <Clock className={`w-3.5 h-3.5 ${xAxisMode === 'time' ? 'text-primary' : 'text-text-muted'}`} />
                        <span className="text-xs text-text-muted">/</span>
                        <Frame className={`w-3.5 h-3.5 ${xAxisMode === 'frame' ? 'text-primary' : 'text-text-muted'}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full min-h-0 relative">
                <div ref={chartRef} className="absolute inset-0"></div>
                {hasNoData && (
                    <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-text-muted px-6 pointer-events-none">
                        No 3D data for the selected keypoints in this clip.<br />Pick other keypoints, or re-record with both cameras seeing the subject.
                    </div>
                )}
            </div>
        </div>
    );
};

export default KinematicChart;
