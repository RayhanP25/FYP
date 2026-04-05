import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

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
        const response = await axios.get(`${API_URL}/api/users`);
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
        const response = await axios.post(`${API_URL}/api/users`, userData);
        return response.data;
    } catch (error) {
        throw new Error('Failed to create user');
    }
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<User> => {
    try {
        const response = await axios.put(`${API_URL}/api/users/${id}`, userData);
        return response.data;
    } catch (error) {
        throw new Error('Failed to update user');
    }
};

export const deleteUser = async (id: string): Promise<{ message: string }> => {
    try {
        const response = await axios.delete(`${API_URL}/api/users/${id}`);
        return response.data;
    } catch (error) {
        throw new Error('Failed to delete user');
    }
};