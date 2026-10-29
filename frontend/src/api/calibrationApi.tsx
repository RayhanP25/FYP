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
    setup: string | null;
}

export interface CalibrationResult {
    updated_at: string;
    rms: number;
    square_mm: number;
    pairs: number;
    camera_size: [number, number];
    floor_set: boolean;
    baseline_mm: number;
    calibrated_at: string | null;
    report: string[];
    floor_report: string[];
    id: string | null;
    setup: string | null;
}

export interface CalibrationEntry {
    id: string;
    setup: string;
    active: boolean;
    created_at: string;
    created_by: string | null;
    calibrated_at: string | null;
    session: string | null;
    rms: number | null;
    baseline_mm: number;
    camera_size: [number, number];
    pairs: number | null;
    floor_set: boolean;
}

export interface CalibrationLibrary {
    entries: CalibrationEntry[];
    setups: string[];
}

export interface CalibrationStatus {
    live: boolean;
    recording: boolean;
    camera_size: [number, number] | null;
    session: CalibrationSessionInfo | null;
    calibration: CalibrationResult | null;
    size_mismatch: boolean;
    job: 'loading' | 'calibrate' | 'floor' | null;
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

export const startCalibrationSession = async (setup: string): Promise<void> => {
    await api.post('/api/calibration/session/start', { setup }, { timeout: 60000 });
};

/** An earlier session whose photos are still in backend/calib_sessions/ (GET /api/calibration/sessions). */
export interface CalibrationSavedSession {
    name: string;
    date: string;
    pairs: number;
    floor_photos: boolean;
    camera_size: [number, number] | null;
    /** Setups this session was already calibrated as, if any. */
    calibrated_as: string[];
    active: boolean;
}

export const getCalibrationSessions = async (): Promise<CalibrationSavedSession[]> => {
    const response = await api.get('/api/calibration/sessions');
    return response.data.sessions;
};

/** Open an earlier session again; its photos are reloaded in the background (status job "loading"). */
export const resumeCalibrationSession = async (name: string, setup: string): Promise<{ status: string; pairs: number }> => {
    // Generous timeout: the cameras are started too, and 2K cameras can take a while to open.
    const response = await api.post(`/api/calibration/sessions/${encodeURIComponent(name)}/resume`, { setup }, { timeout: 150000 });
    return response.data;
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

export const getCalibrationLibrary = async (): Promise<CalibrationLibrary> => {
    const response = await api.get('/api/calibration/library');
    return response.data;
};

export const activateCalibration = async (id: string): Promise<CalibrationEntry> => {
    const response = await api.post(`/api/calibration/library/${id}/activate`);
    return response.data;
};

export const renameCalibration = async (id: string, setup: string): Promise<CalibrationEntry> => {
    const response = await api.patch(`/api/calibration/library/${id}`, { setup });
    return response.data;
};

export const deleteCalibration = async (id: string): Promise<void> => {
    await api.delete(`/api/calibration/library/${id}`);
};

/** A saved calibration to pick when re-analysing a recording (GET /api/calibration/options, any signed-in user). */
export interface CalibrationOption {
    id: string;
    setup: string;
    active: boolean;
    calibrated_at: string | null;
    created_at: string;
    rms: number | null;
    baseline_mm: number;
    floor_set: boolean;
    camera_size: [number, number];
}

export const getCalibrationOptions = async (): Promise<CalibrationOption[]> => {
    const response = await api.get('/api/calibration/options');
    return response.data.entries;
};
