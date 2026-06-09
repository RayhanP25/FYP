import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@/api/authApi';
import { getCurrentUser, logout as logoutApi } from '@/api/authApi';
import { AuthContext, type AuthContextType } from './authContextDefinition';

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        // Check authentication status on mount
        const checkAuth = async () => {
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);
                setToken('');
            } catch (error) {
                setUser(null);
                setToken(null);
            }
        };

        checkAuth();
    }, []);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        logoutApi();
        setUser(null);
        setToken(null);
    };

    const isAuthenticated = () => {
        return !!user;
    };

    const isAdmin = () => {
        return user?.role === 'admin';
    };

    const value: AuthContextType = {
        user,
        token,
        login,
        logout,
        isAuthenticated,
        isAdmin
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};