import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/axiosInstance';
import * as echarts from 'echarts';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/components/dropdown/dropdown';
import { ChevronDown, Clock, Frame } from 'lucide-react';

interface KinematicAnalysisProps {
    videoId: string;
}

interface AngleData {
    angle: number | null;
    confidence: number;
}

interface FrameData {
    frame_index: number;
    keypoints: number[][] | null;
    angles: {
        left_knee?: AngleData;
        right_knee?: AngleData;
        left_hip?: AngleData;
        right_hip?: AngleData;
        left_elbow?: AngleData;
        right_elbow?: AngleData;
        left_wrist?: AngleData;
        right_wrist?: AngleData;
        left_shoulder?: AngleData;
        right_shoulder?: AngleData;
        left_ankle?: AngleData;
        right_ankle?: AngleData;
    };
}

const ANGLE_NAMES: Record<string, string> = {
    left_knee: 'Left Knee',
    right_knee: 'Right Knee',
    left_hip: 'Left Hip',
    right_hip: 'Right Hip',
    left_elbow: 'Left Elbow',
    right_elbow: 'Right Elbow',
    left_wrist: 'Left Wrist',
    right_wrist: 'Right Wrist',
    left_shoulder: 'Left Shoulder',
    right_shoulder: 'Right Shoulder',
    left_ankle: 'Left Ankle',
    right_ankle: 'Right Ankle'
};

const ANGLE_COLORS: Record<string, string> = {
    left_knee: '#3b82f6',
    right_knee: '#ef4444',
    left_hip: '#10b981',
    right_hip: '#8b5cf6',
    left_elbow: '#f59e0b',
    right_elbow: '#ec4899',
    left_wrist: '#06b6d4',
    right_wrist: '#84cc16',
    left_shoulder: '#14b8a6',
    right_shoulder: '#a855f7',
    left_ankle: '#e11d48',
    right_ankle: '#6366f1'
};

const KinematicAnalysis = ({ videoId }: KinematicAnalysisProps) => {
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const queryClient = useQueryClient();

    // Fetch analysis data
    const { data: analysisData, isLoading, error } = useQuery({
        queryKey: ['analysis', videoId],
        queryFn: async () => {
            const response = await api.get(`/api/get-analysis/${videoId}`);
            return response.data.result;
        },
        enabled: !!videoId,
        retry: false
    });

    // Listen for analysis completion and invalidate query
    useEffect(() => {
        const handleAnalysisComplete = () => {
            queryClient.invalidateQueries({ queryKey: ['analysis', videoId] });
        };

        window.addEventListener('analysis-complete', handleAnalysisComplete);

        return () => {
            window.removeEventListener('analysis-complete', handleAnalysisComplete);
        };
    }, [videoId, queryClient]);

    // Update chart when data or settings change
    useEffect(() => {
        if (!analysisData || !analysisData.frames.length || !chartRef.current) return;

        const frames = analysisData.frames;
        const fps = analysisData.fps;

        // Prepare series data for each selected angle
        const series = selectedAngles.map(angleName => {
            const data: [number, number][] = [];

            frames.forEach((frame: FrameData) => {
                const angleData = frame.angles?.[angleName as keyof typeof frame.angles];
                if (angleData && angleData.angle !== null && angleData.confidence > 0.5) {
                    const xValue = xAxisMode === 'time'
                        ? frame.frame_index / fps
                        : frame.frame_index;
                    data.push([xValue, angleData.angle]);
                }
            });

            return {
                name: ANGLE_NAMES[angleName] || angleName,
                type: 'line',
                data: data,
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 2.5,
                    color: ANGLE_COLORS[angleName] || '#666'
                },
                emphasis: {
                    lineStyle: {
                        width: 3.5
                    }
                },
                areaStyle: {
                    opacity: 0.05
                }
            };
        });

        // Initialize or update chart
        if (!chartInstance.current) {
            chartInstance.current = echarts.init(chartRef.current);
        }

        const option = {
            title: {
                text: 'Joint Angles Over Time',
                left: 'center',
                textStyle: {
                    fontSize: 14,
                    fontWeight: 'bold'
                }
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    let result = xAxisMode === 'time'
                        ? `Time: ${params[0].value[0].toFixed(2)}s<br/>`
                        : `Frame: ${params[0].value[0]}<br/>`;
                    params.forEach((param: any) => {
                        result += `${param.seriesName}: ${param.value[1].toFixed(1)}°<br/>`;
                    });
                    return result;
                }
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%',
                top: '20%'
            },
            xAxis: {
                type: 'value',
                name: xAxisMode === 'time' ? 'Time (seconds)' : 'Frame Number',
                nameLocation: 'middle',
                nameGap: 30,
                axisLabel: {
                    formatter: (value: number) => {
                        if (xAxisMode === 'time') {
                            return value.toFixed(1) + 's';
                        }
                        return Math.round(value).toString();
                    }
                }
            },
            yAxis: {
                type: 'value',
                name: 'Angle (degrees)',
                nameLocation: 'middle',
                nameGap: 50
            },
            series: series
        };

        chartInstance.current.setOption(option, true);

        // Handle resize
        const handleResize = () => {
            chartInstance.current?.resize();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [analysisData, selectedAngles, xAxisMode]);

    // Cleanup chart on unmount
    useEffect(() => {
        return () => {
            if (chartInstance.current) {
                chartInstance.current.dispose();
            }
        };
    }, []);

    if (isLoading) {
        return (
            <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-text-secondary">Loading analysis data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col items-center justify-center min-h-[500px] min-w-[500px]">
                <p className="text-sm text-text-muted">Please analyze the video first.</p>
            </div>
        );
    }

    if (!analysisData) {
        return (
            <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-text-secondary">No analysis data available</p>
            </div>
        );
    }

    return (
        <div className="bg-background rounded-xl shadow-sm border p-6 flex flex-col min-w-135">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-text-primary/70">Select Angles:</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-background-main border border-border rounded-md hover:bg-border transition-colors focus:outline-none focus:ring-2 focus:ring-border">
                            <span className="text-text-primary/70">{selectedAngles.length === 0 ? 'Select angles...' : selectedAngles.length === 1 ? ANGLE_NAMES[selectedAngles[0]] : `${selectedAngles.length} angles selected`}</span>
                            <ChevronDown className="w-4 h-4 text-text-primary/50" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 bg-background border border-border">
                            {Object.entries(ANGLE_NAMES).map(([angleKey, angleName]) => (
                                <DropdownMenuCheckboxItem
                                    key={angleKey}
                                    checked={selectedAngles.includes(angleKey)}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setSelectedAngles(prev => [...prev, angleKey]);
                                        } else {
                                            setSelectedAngles(prev => prev.filter(a => a !== angleKey));
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: ANGLE_COLORS[angleKey] }}
                                        />
                                        <span className="text-text-primary/70">{angleName}</span>
                                    </div>
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 transition-colors ${xAxisMode === 'time' ? 'text-primary' : 'text-text-primary/30'}`} />
                    <button
                        onClick={() => setXAxisMode(xAxisMode === 'time' ? 'frame' : 'time')}
                        className="relative inline-flex h-6 w-11 items-center rounded-full bg-border transition-colors focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-background"
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${xAxisMode === 'time' ? 'translate-x-1' : 'translate-x-6'}`}
                        />
                    </button>
                    <Frame className={`w-4 h-4 transition-colors ${xAxisMode === 'frame' ? 'text-primary' : 'text-text-primary/30'}`} />
                </div>
            </div>
            <div ref={chartRef} className="h-96 w-full"></div>
        </div>
    );
};

export default KinematicAnalysis;