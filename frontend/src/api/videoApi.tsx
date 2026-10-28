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
}

export interface MyVideosResponse {
    videos: Video[];
}

export const uploadVideo = async (formData: FormData): Promise<VideoUploadResponse> => {
    try {
        const response = await api.post('/api/upload-video', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        throw new Error('Failed to upload video');
    }
};

export const getVideoUrl = async (
    videoId: string,
    view: 'left' | 'right' = 'left',
    variant: 'plain' | 'overlay' = 'overlay',
): Promise<VideoUrlResponse> => {
    try {
        const response = await api.get(`/api/get-video/${videoId}`, { params: { view, variant } });
        return response.data;
    } catch (error) {
        throw new Error('Failed to get video URL');
    }
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

