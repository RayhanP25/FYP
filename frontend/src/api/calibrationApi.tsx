import { api } from './axiosInstance';

export interface CalibrationCheck {
    text: string;
    ok: boolean;
}

export interface CalibrationSessionInfo {
    folder: string;
    pairs: number;
    min_pairs: number;
    aim_pairs: number;
    checks: CalibrationCheck[];
    saved: number;
    camera_size: [number, number];
}

export interface CalibrationResult {
    updated_at: string;
    rms: number;
    square_mm: number;
    pairs: number;
    camera_size: [number, number];
    floor_set: boolean;
    report: string[];
    floor_report: string[];
}

export interface CalibrationStatus {
    live: boolean;
    recording: boolean;
    camera_size: [number, number] | null;
    session: CalibrationSessionInfo | null;
    calibration: CalibrationResult | null;
    size_mismatch: boolean;
    job: 'calibrate' | 'floor' | null;
    message: string;
}

export interface CalibrationStepResponse {
    ok: boolean;
    message: string;
}

export const errorDetail = (error: unknown, fallback: string): string => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
};

export const getCalibrationStatus = async (): Promise<CalibrationStatus> => {
    const response = await api.get('/api/calibration/status');
    return response.data;
};

export const startCalibrationSession = async (): Promise<void> => {
    await api.post('/api/calibration/session/start', {}, { timeout: 60000 });
};

export const endCalibrationSession = async (): Promise<void> => {
    await api.post('/api/calibration/session/stop');
};

export const capturePair = async (): Promise<CalibrationStepResponse> => {
    const response = await api.post('/api/calibration/capture');
    return response.data;
};

export const undoPair = async (): Promise<CalibrationStepResponse> => {
    const response = await api.post('/api/calibration/undo');
    return response.data;
};

export const runCalibration = async (): Promise<void> => {
    await api.post('/api/calibration/calibrate');
};

export const runFloorLevel = async (): Promise<void> => {
    await api.post('/api/calibration/floor');
};
