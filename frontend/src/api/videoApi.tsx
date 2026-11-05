import { api } from './axiosInstance';

export interface Video {
    video_id: string;
    original_filename: string;
    content_type: string;
    file_size: number;
    uploaded_at: string;
    has_analysis?: boolean;
    is_stereo?: boolean;
    has_right_view?: boolean;
    owner_id?: string;
    owner_name?: string | null;
    /** Who recorded or uploaded it (owner_* is who it belongs to now, which Assign can change). */
    recorded_by_id?: string;
    recorded_by_name?: string | null;
    recorded_by_role?: 'admin' | 'coach' | 'athlete' | null;
    /** False for videos added before this was stored: recorded_by_* is then the owner. */
    recorded_by_known?: boolean;
    source?: string;
}

export interface VideoUploadResponse {
    object_name: string;
    video_id: string;
}

export interface VideoUrlResponse {
    video_id: string;
    presigned_url: string;
    original_filename: string;
    content_type: string;
    uploaded_at: string;
    owner_id?: string;
    owner_name?: string | null;
    view?: 'left' | 'right';
    /** "plain": the camera view without a skeleton drawn; "overlay": with the skeleton drawn in. */
    variant?: 'plain' | 'overlay';
    has_right_view?: boolean;
    /** Who recorded or uploaded it (owner_* is who it belongs to now, which Assign can change). */
    recorded_by_id?: string;
    recorded_by_name?: string | null;
    recorded_by_role?: 'admin' | 'coach' | 'athlete' | null;
    /** False for videos added before this was stored: recorded_by_* is then the owner. */
    recorded_by_known?: boolean;
    source?: string;
    /** Seconds from Stop & Save until the recording was saved (camera recordings only). */
    save_seconds?: number | null;
    /** Still being copied to cloud storage (just recorded on this PC). */
    uploading?: boolean;
}

export interface MyVideosResponse {
    videos: Video[];
}

/** Largest video the server accepts (backend/routes/upload.py MAX_UPLOAD_MB). */
export const MAX_UPLOAD_MB = 100;

export const ROLE_LABEL: Record<string, string> = { admin: 'Admin', coach: 'Coach', athlete: 'Athlete' };

/** "Coach Carl (Coach)": who recorded or uploaded a video. */
export const recordedByText = (v: { recorded_by_name?: string | null; recorded_by_role?: string | null }) =>
    v.recorded_by_name ? `${v.recorded_by_name}${v.recorded_by_role ? ` (${ROLE_LABEL[v.recorded_by_role] ?? v.recorded_by_role})` : ''}` : 'Unknown';

/** onProgress: 0-1 while the file is being sent. job: progress key for what the server does after that. */
export const uploadVideo = async (formData: FormData, onProgress?: (fraction: number) => void, job?: string,
    twoCameras = false): Promise<VideoUploadResponse> => {
    try {
        const response = await api.post('/api/upload-video', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            params: { ...(job ? { job } : {}), ...(twoCameras ? { two_cameras: true } : {}) },
            onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
        });
        return response.data;
    } catch (error: any) {
        // The server says why (e.g. the file is not a video, or too large); fall back to a general message.
        throw new Error(error?.response?.data?.detail || 'Failed to upload video');
    }
};

export const getVideoUrl = async (
    videoId: string,
    view: 'left' | 'right' = 'left',
    variant: 'plain' | 'overlay' = 'overlay',
    download = false,
): Promise<VideoUrlResponse> => {
    try {
        const response = await api.get(`/api/get-video/${videoId}`, { params: { view, variant, download } });
        return response.data;
    } catch (error) {
        throw new Error('Failed to get video URL');
    }
};

/** A camera's video at the size it was recorded, with or without the skeleton, as a file to save. */
export const downloadFullSize = async (
    videoId: string, view: 'left' | 'right', skeleton: boolean, job?: string,
    onProgress?: (fraction: number) => void,
): Promise<void> => {
    const response = await api.get(`/api/download-video/${videoId}`, {
        params: { view, skeleton, ...(job ? { job } : {}) },
        responseType: 'blob',
        onDownloadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
    });
    const disposition: string = response.headers['content-disposition'] || '';
    const match = /filename\*=utf-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : 'video.mp4';
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const getMyVideos = async (): Promise<MyVideosResponse> => {
    try {
        const response = await api.get('/api/my-videos');
        return response.data;
    } catch (error) {
        throw new Error('Failed to fetch videos');
    }
};

export const moveVideo = async (videoId: string, ownerId: string): Promise<void> => {
    try {
        await api.put(`/api/videos/${videoId}/owner`, { owner_id: ownerId });
    } catch (error) {
        throw new Error('Failed to move video');
    }
};

export const renameVideo = async (videoId: string, originalFilename: string): Promise<void> => {
    try {
        await api.patch(`/api/videos/${videoId}/name`, { original_filename: originalFilename });
    } catch (error) {
        throw new Error('Failed to rename video');
    }
};

export const deleteVideo = async (videoId: string): Promise<{ message: string }> => {
    try {
        const response = await api.delete(`/api/delete-video/${videoId}`);
        return response.data;
    } catch (error) {
        throw new Error('Failed to delete video');
    }
};

