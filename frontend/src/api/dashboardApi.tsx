import { api } from './axiosInstance';

export interface DashboardVideo {
    video_id: string;
    name: string;
    uploaded_at: string | null;
    recorded_by: string | null;
    recorded_by_role: string | null;
    kind: 'recording' | 'upload';
    duration_s: number | null;
    analysed: boolean;
}

export interface DashboardUserRow {
    user_id: string;
    name: string;
    role: string | null;
    videos: number;
    recordings: number;
    analysed: number;
    last_upload: string | null;
}

export interface Dashboard {
    /** "all" for admins (every user's videos), "group" for coaches (theirs and their athletes'), "mine" otherwise. */
    scope: 'all' | 'group' | 'mine';
    totals: { videos: number; recordings: number; analysed: number };
    /** The login before this session; null on a first login. */
    last_login: string | null;
    new_since_login: { count: number; videos: DashboardVideo[] };
    per_user: DashboardUserRow[];
    recent: DashboardVideo[];
}

export const getDashboard = async (): Promise<Dashboard> => {
    const response = await api.get('/api/dashboard');
    return response.data;
};
