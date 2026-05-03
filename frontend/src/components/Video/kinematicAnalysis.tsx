import { useEffect, useState, useRef } from 'react';
import { api } from '@/api/axiosInstance';
import * as echarts from 'echarts';

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
    };
}

interface PoseAnalysis {
    fps: number;
    total_frames: number;
    video_width: number;
    video_height: number;
    frames: FrameData[];
}

const ANGLE_NAMES: Record<string, string> = {
    left_knee: 'Left Knee',
    right_knee: 'Right Knee',
    left_hip: 'Left Hip',
    right_hip: 'Right Hip',
    left_elbow: 'Left Elbow',
    right_elbow: 'Right Elbow'
};

const ANGLE_COLORS: Record<string, string> = {
    left_knee: '#3b82f6',
    right_knee: '#ef4444',
    left_hip: '#10b981',
    right_hip: '#8b5cf6',
    left_elbow: '#f59e0b',
    right_elbow: '#ec4899'
};

const KinematicAnalysis = ({ videoId }: KinematicAnalysisProps) => {
    const [analysisData, setAnalysisData] = useState<PoseAnalysis | null>(null);
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['left_knee', 'right_knee']);
    const [xAxisMode, setXAxisMode] = useState<'frame' | 'time'>('time');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);

    // Fetch analysis data
    useEffect(() => {
        const fetchAnalysisData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await api.get(`/api/get-analysis/${videoId}`);
                setAnalysisData(response.data.result);
            } catch (err) {
                setError('Failed to load analysis data. Please analyze the video first.');
                console.error('Error fetching analysis data:', err);
            } finally {
                setIsLoading(false);
            }
        };

        if (videoId) {
            fetchAnalysisData();
        }
    }, [videoId]);

    // Update chart when data or settings change
    useEffect(() => {
        if (!analysisData || !analysisData.frames.length || !chartRef.current) return;

        const frames = analysisData.frames;
        const fps = analysisData.fps;

        // Prepare series data for each selected angle
        const series = selectedAngles.map(angleName => {
            const data: [number, number][] = [];

            frames.forEach((frame) => {
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

    const toggleAngle = (angleName: string) => {
        setSelectedAngles(prev =>
            prev.includes(angleName)
                ? prev.filter(a => a !== angleName)
                : [...prev, angleName]
        );
    };

    if (isLoading) {
        return (
            <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-text-secondary">Loading analysis data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-red-600 mb-2">{error}</p>
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
        <div className="bg-background rounded-xl shadow-sm border p-5 flex flex-col">
            <div className="flex mb-4 bg-gray-100 p-1 rounded-lg w-fit border border-gray-200">
                <button
                    onClick={() => setXAxisMode('time')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${xAxisMode === 'time'
                        ? 'bg-gray-700 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                >
                    Time
                </button>
                <button
                    onClick={() => setXAxisMode('frame')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${xAxisMode === 'frame'
                        ? 'bg-gray-700 text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                >
                    Frame
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {Object.keys(ANGLE_NAMES).map((angleName) => (
                    <button
                        key={angleName}
                        onClick={() => toggleAngle(angleName)}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors border ${selectedAngles.includes(angleName)
                            ? 'bg-opacity-20 border-opacity-100'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                        style={{
                            backgroundColor: selectedAngles.includes(angleName)
                                ? `${ANGLE_COLORS[angleName]}20`
                                : undefined,
                            borderColor: selectedAngles.includes(angleName)
                                ? ANGLE_COLORS[angleName]
                                : undefined,
                            color: selectedAngles.includes(angleName)
                                ? ANGLE_COLORS[angleName]
                                : undefined
                        }}
                    >
                        {ANGLE_NAMES[angleName]}
                    </button>
                ))}
            </div>

            <div ref={chartRef} className="h-80 w-full"></div>
        </div>
    );
};

export default KinematicAnalysis;