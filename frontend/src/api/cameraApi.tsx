import { api } from './axiosInstance';

/** Which camera index is left / right, and the size the cameras are asked for (CAMERA_WIDTH x CAMERA_HEIGHT). */
export interface CameraSettings {
    left: number;
    right: number;
    width: number;
    height: number;
    /** True once left/right were picked in the app on this PC (otherwise .env decides). */
    saved: boolean;
}

export interface CameraDevice {
    index: number;
    width: number;
    height: number;
    /** Small JPEG snapshot (data URL) to tell the cameras apart. */
    preview: string | null;
}

export interface CameraScan {
    devices: CameraDevice[];
    left: number;
    right: number;
    width: number;
    height: number;
}

export const getCameraSettings = async (): Promise<CameraSettings> => {
    const response = await api.get('/api/camera/settings');
    return response.data;
};

export const saveCameraSettings = async (left: number, right: number): Promise<CameraSettings> => {
    const response = await api.put('/api/camera/settings', { left, right });
    return response.data;
};

/** Opens every camera once; 2K cameras can take a while to open, so the timeout is generous. */
export const scanCameras = async (): Promise<CameraScan> => {
    const response = await api.post('/api/camera/devices/scan', {}, { timeout: 180000 });
    return response.data;
};
