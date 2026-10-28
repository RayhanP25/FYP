import { api } from './axiosInstance';

export const updateProfile = async (body: { full_name?: string; email?: string }): Promise<void> => {
    await api.patch('/api/me', body);
};

export const uploadPicture = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);
    await api.post('/api/me/picture', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.put('/api/me/password', { current_password: currentPassword, new_password: newPassword });
};

export const deleteAccount = async (password: string): Promise<void> => {
    await api.post('/api/me/delete', { password });
};
