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
    // Starts true so route guards don't redirect to /login before the
    // session cookie has been checked against /api/me.
    const [loading, setLoading] = useState(true);

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
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    // Keep the session alive: /api/me re-issues the cookie, so revalidating
    // periodically turns the fixed expiry into a sliding one while the app is open.
    useEffect(() => {
        if (!user) return;
        const id = setInterval(() => {
            getCurrentUser()
                .then(setUser)
                .catch(() => {
                    setUser(null);
                    setToken(null);
                });
        }, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, [user?._id]);

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
        loading,
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