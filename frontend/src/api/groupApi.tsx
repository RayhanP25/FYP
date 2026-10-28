import type { AxiosError, AxiosResponse } from 'axios';
import { api } from './axiosInstance';

export interface GroupAthlete {
    id: string;
    full_name: string;
    email: string;
}

export interface Group {
    id: string;
    name: string;
    coach_id: string;
    members_visible: boolean;
    athletes: GroupAthlete[];
}

export interface MyGroup {
    id: string;
    name: string;
    members_visible: boolean;
    coach: { full_name: string; email: string; profile_picture?: string | null } | null;
    members: { id: string; full_name: string; email: string; profile_picture?: string | null }[];
}

export interface CoachGroups {
    id: string;
    full_name: string;
    email: string;
    groups: Group[];
}

export interface GroupsResponse {
    coaches: CoachGroups[];
    unassigned: GroupAthlete[];
}

async function call<T>(request: Promise<AxiosResponse<T>>, fallback: string): Promise<T> {
    try {
        return (await request).data;
    } catch (error) {
        throw new Error((error as AxiosError<{ detail?: string }>).response?.data?.detail || fallback);
    }
}

export const getGroups = () => call(api.get<GroupsResponse>('/api/groups'), 'Failed to load groups');

export const createGroup = (name: string, coachId?: string) =>
    call(api.post<Group>('/api/groups', { name, coach_id: coachId }), 'Failed to create group');

export const getMyGroup = () => call(api.get<{ group: MyGroup | null }>('/api/my-group'), 'Failed to load your group');

export const updateGroup = (groupId: string, changes: { name?: string; coach_id?: string; members_visible?: boolean }) =>
    call(api.put<Group>(`/api/groups/${groupId}`, changes), 'Failed to update group');

export const deleteGroup = (groupId: string) =>
    call(api.delete<{ message: string }>(`/api/groups/${groupId}`), 'Failed to delete group');

export const setAthleteGroup = (athleteId: string, groupId: string | null) =>
    call(api.put(`/api/athletes/${athleteId}/group`, { group_id: groupId }), 'Failed to move athlete');

export const addAthletesToGroup = (groupId: string, athleteIds: string[]) =>
    call(api.post<{ added: number }>(`/api/groups/${groupId}/athletes`, { athlete_ids: athleteIds }), 'Failed to add athletes');

export const athletesInGroups = (data?: GroupsResponse): GroupAthlete[] =>
    data ? data.coaches.flatMap((c) => c.groups.flatMap((g) => g.athletes)) : [];
