import { createContext } from 'react';
import type { User } from '@/api/authApi';

export interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: () => boolean;
    isAdmin: () => boolean;
    isCoach: () => boolean;
    isAthlete: () => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
