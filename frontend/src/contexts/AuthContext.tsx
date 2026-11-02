import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
    const queryClient = useQueryClient();

    // Empty the cached server data (video lists, video links, analyses, users...) whenever the signed-in user
    // changes - logout, login as someone else, or an expired session - so nobody sees what the previous user
    // could see, with their permissions.
    const lastUserId = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (loading) return;
        const id = user?._id ?? null;
        if (lastUserId.current !== undefined && lastUserId.current !== id) queryClient.clear();
        lastUserId.current = id;
    }, [user?._id, loading, queryClient]);

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

    const refreshUser = async () => {
        setUser(await getCurrentUser());
    };

    const isAuthenticated = () => {
        return !!user;
    };

    const isAdmin = () => {
        return user?.role === 'admin';
    };

    const isCoach = () => {
        return user?.role === 'coach';
    };

    const isAthlete = () => {
        return user?.role === 'athlete';
    };

    const value: AuthContextType = {
        user,
        token,
        loading,
        login,
        logout,
        refreshUser,
        isAuthenticated,
        isAdmin,
        isCoach,
        isAthlete
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};