import { api } from './axiosInstance';

export interface User {
    _id: string;
    full_name: string;
    email: string;
    role: string;
    createdAt?: string;
    updatedAt?: string;
    profile_picture?: string;
}

export const fetchUsers = async (): Promise<User[]> => {
    try {
        const response = await api.get('/api/users');
        return response.data;
    } catch (error) {
        throw new Error('Failed to fetch users');
    }
};

export const createUser = async (userData: {
    full_name: string;
    email: string;
    password: string;
    role: string;
    profile_picture?: string;
}): Promise<Omit<User, 'password_hash'>> => {
    try {
        const response = await api.post('/api/users', userData);
        return response.data;
    } catch (error) {
        throw new Error('Failed to create user');
    }
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<User> => {
    try {
        const response = await api.put(`/api/users/${id}`, userData);
        return response.data;
    } catch (error) {
        throw new Error('Failed to update user');
    }
};

export const deleteUser = async (id: string): Promise<{ message: string }> => {
    try {
        const response = await api.delete(`/api/users/${id}`);
        return response.data;
    } catch (error) {
        throw new Error('Failed to delete user');
    }
};