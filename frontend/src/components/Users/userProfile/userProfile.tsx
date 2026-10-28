import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/axiosInstance';
import type { User } from '@/api/authApi';

type Me = User & { group_name?: string | null };

/** "28.10.2026" (how logins are stored) or an ISO date -> "28 Oct 2026". */
const formatDate = (value?: string | null) => {
    if (!value) return null;
    const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
    const d = dmy ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) : new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-6 py-3">
        <dt className="text-sm text-text-muted">{label}</dt>
        <dd className="text-sm text-text text-right">{children}</dd>
    </div>
);

/** The signed-in user's account: who they are, their role, group and coach. */
const UserProfile = () => {
    const { data: me, isLoading, isError } = useQuery({
        queryKey: ['me'],
        queryFn: async () => (await api.get<Me>('/api/me')).data,
    });

    if (isLoading) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 text-text-muted animate-spin" /></div>;
    if (isError || !me) return <div className="py-24 text-center text-sm text-text-muted">Could not load your account.</div>;

    // The default picture is a placeholder from an outside site: show initials instead.
    const picture = me.profile_picture && !me.profile_picture.includes('dummyimage.com') ? me.profile_picture : null;

    return (
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <h1 className="text-3xl font-semibold tracking-tight text-text">Account</h1>
            <section className="rounded-xl border border-border bg-background-main p-6">
                <div className="flex items-center gap-4">
                    {picture ? (
                        <img src={picture} alt="" className="w-16 h-16 rounded-full object-cover border border-border" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-semibold">{initials(me.full_name)}</div>
                    )}
                    <div className="min-w-0">
                        <p className="text-lg font-medium text-text truncate">{me.full_name}</p>
                        <p className="text-sm text-text-muted truncate">{me.email}</p>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded border border-border text-xs font-medium capitalize text-text-secondary">{me.role}</span>
                </div>
                <dl className="mt-6 divide-y divide-border border-t border-border">
                    {me.role === 'athlete' && (
                        <>
                            <Row label="Group">{me.group_name ?? <span className="text-text-muted">Not in a group yet</span>}</Row>
                            <Row label="Coach">{me.coach_name ?? <span className="text-text-muted">-</span>}</Row>
                        </>
                    )}
                    <Row label="Member since">{formatDate(me.created_at) ?? '-'}</Row>
                    <Row label="Last login">{formatDate(me.last_login) ?? '-'}</Row>
                </dl>
            </section>
            <p className="text-xs text-text-muted">To change your name, email or password, ask an admin.</p>
        </div>
    );
};

export default UserProfile;
