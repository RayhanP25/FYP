import { api } from './axiosInstance';

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface LoginResponse {
    user: {
        _id: string;
        full_name: string;
        email: string;
        role: string;
        profile_picture?: string;
    };
}

export interface User {
    _id: string;
    full_name: string;
    email: string;
    role: string;
    profile_picture?: string;
    created_at?: string;
    last_login?: string;
}

export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    try {
        const response = await api.post('/api/login', credentials);
        return response.data;
    } catch (error) {
        throw new Error('Login failed');
    }
};

export const getCurrentUser = async (): Promise<User> => {
    try {
        const response = await api.get('/api/me');
        return response.data;
    } catch (error) {
        throw new Error('Failed to get current user');
    }
};

export const logout = async (): Promise<void> => {
    try {
        await api.post('/api/logout', {});
    } catch (error) {
        throw new Error('Logout failed');
    }
};
