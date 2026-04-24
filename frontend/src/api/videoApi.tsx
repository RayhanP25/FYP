import { api } from './axiosInstance';

export interface Video {
    video_id: string;
    original_filename: string;
    content_type: string;
    file_size: number;
    uploaded_at: string;
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

export const getVideoUrl = async (videoId: string): Promise<VideoUrlResponse> => {
    try {
        const response = await api.get(`/api/get-video/${videoId}`);
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

export const deleteVideo = async (videoId: string): Promise<{ message: string }> => {
    try {
        const response = await api.delete(`/api/delete-video/${videoId}`);
        return response.data;
    } catch (error) {
        throw new Error('Failed to delete video');
    }
};

