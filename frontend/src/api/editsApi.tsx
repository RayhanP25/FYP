import { api } from './axiosInstance';
import type { StereoCalibration } from '@/utils/skeleton';

/** target "3d": value [X, Y, Z] in mm (floor-levelled, like keypoints_3d); "left" / "right": [x, y] from 0 to 1. */
export interface KeypointEdit {
    frame: number;
    joint: number;
    target: '3d' | 'left' | 'right';
    value: number[];
    author?: string | null;
    created_at?: string;
}

export interface EditsInfo {
    edits: KeypointEdit[];
    can_edit: boolean;
    stereo: boolean;
    calibration: StereoCalibration | null;
    fade_frames: number;
    keyframe_gap: number;
}

export const getEdits = async (videoId: string): Promise<EditsInfo> => (await api.get(`/api/analysis/${videoId}/edits`)).data;

export const saveEdits = async (videoId: string, edits: KeypointEdit[]): Promise<{ saved: number }> =>
    (await api.put(`/api/analysis/${videoId}/edits`, { edits })).data;

/** Revert one joint of one frame, or every edit of the video when frame / joint are left out. */
export const revertEdits = async (videoId: string, frame?: number, joint?: number): Promise<{ reverted: number }> =>
    (await api.delete(`/api/analysis/${videoId}/edits`, { params: { frame, joint } })).data;
