import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Clock, FileVideo, Sparkles, Upload, Video } from 'lucide-react';
import AppLayout from '../layout/AppLayout';
import { getDashboard, type DashboardVideo } from '../api/dashboardApi';

const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const timeAgo = (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
};

const formatDuration = (s: number | null) => (s == null ? '-' : s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`);

const Panel = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
    <section className="rounded-xl bg-background-main border border-border p-5 min-w-0">
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">{title}</h2>
            {aside}
        </div>
        {children}
    </section>
);

interface StatProps {
    label: string;
    value: number | string;
    detail: string;
    icon: typeof Video;
    highlight?: boolean;
}

const Stat = ({ label, value, detail, icon: Icon, highlight }: StatProps) => (
    <div className={`rounded-xl border p-5 ${highlight ? 'border-primary/50 bg-primary/5' : 'border-border bg-background-main'}`}>
        <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">{label}</span>
            <Icon className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-text-muted'}`} />
        </div>
        <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums text-text">{value}</p>
        <p className="mt-1 text-sm text-text-muted">{detail}</p>
    </div>
);

const VideoList = ({ videos, empty }: { videos: DashboardVideo[]; empty: string }) => {
    const navigate = useNavigate();
    if (!videos.length) return <p className="py-6 text-center text-sm text-text-muted">{empty}</p>;
    return (
        <ul className="divide-y divide-border -my-2">
            {videos.map((v) => (
                <li key={v.video_id}>
                    <button
                        onClick={() => navigate(`/analysis/${v.video_id}`)}
                        className="w-full py-3 flex items-center text-left rounded-md hover:bg-background transition-colors px-2 -mx-2"
                    >
                        <span className="shrink-0 w-9 h-9 mr-3 rounded-lg border border-border flex items-center justify-center text-text-muted">
                            {v.kind === 'recording' ? <Video className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-text truncate">{v.name}</span>
                            <span className="block text-xs text-text-muted truncate">
                                {v.recorded_by ?? 'Unknown user'}
                                {v.recorded_by_role && <span className="capitalize"> · {v.recorded_by_role}</span>}
                                {v.uploaded_at && <> · {formatDateTime(v.uploaded_at)}</>}
                            </span>
                        </span>
                        <span className="shrink-0 ml-3 text-xs tabular-nums text-text-muted w-16 text-right">{formatDuration(v.duration_s)}</span>
                        <span className={`shrink-0 ml-3 inline-flex items-center text-xs w-28 justify-end ${v.analysed ? 'text-green-500' : 'text-text-muted'}`}>
                            {v.analysed ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <CircleDashed className="w-3.5 h-3.5 mr-1" />}
                            {v.analysed ? 'Analysed' : 'Not analysed'}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
};

function HomePage() {
    const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard, refetchOnWindowFocus: true });

    return (
        <AppLayout>
            <div className="flex flex-col gap-8 max-w-[1500px] mx-auto">
                <div>

                </div>

                {isLoading && <div className="py-24 text-center text-sm text-text-muted">Loading...</div>}
                {isError && <div className="py-24 text-center text-sm text-text-muted">Could not load the dashboard.</div>}

                {data && (
                    <>
                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                            <Stat label="Recordings" value={data.totals.recordings} detail="from the stereo cameras" icon={Video} />
                            <Stat label="Videos" value={data.totals.videos} detail={`${data.totals.videos - data.totals.recordings} uploaded, ${data.totals.recordings} recorded`} icon={FileVideo} />
                            <Stat
                                label="Analysed"
                                value={data.totals.analysed}
                                detail={data.totals.videos ? `${Math.round((100 * data.totals.analysed) / data.totals.videos)}% of all videos` : 'no videos yet'}
                                icon={CheckCircle2}
                            />
                            <Stat
                                label="New since last login"
                                value={data.new_since_login.count}
                                detail={data.last_login ? `since ${formatDate(data.last_login)}` : 'first login'}
                                icon={Sparkles}
                                highlight={data.new_since_login.count > 0}
                            />
                        </div>

                        <div className={`grid grid-cols-1 gap-6 items-start ${data.scope !== 'mine' ? '2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
                            <div className="flex flex-col gap-6 min-w-0">
                                <Panel
                                    title="New since your last login"
                                    aside={data.new_since_login.count > data.new_since_login.videos.length && (
                                        <span className="text-xs text-text-muted">latest {data.new_since_login.videos.length} of {data.new_since_login.count}</span>
                                    )}
                                >
                                    <VideoList videos={data.new_since_login.videos} empty="Nothing new since your last login." />
                                </Panel>
                                <Panel title="Recent videos">
                                    <VideoList videos={data.recent} empty="No videos yet. Record one on the Camera page or upload one on Videos." />
                                </Panel>
                            </div>

                            {data.scope !== 'mine' && (
                                <Panel title="Videos per user">
                                    {data.per_user.length ? (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs text-text-muted border-b border-border">
                                                    <th className="pb-2 font-medium">User</th>
                                                    <th className="pb-2 font-medium text-right">Videos</th>
                                                    <th className="pb-2 font-medium text-right">Recorded</th>
                                                    <th className="pb-2 font-medium text-right">Analysed</th>
                                                    <th className="pb-2 font-medium text-right">Last upload</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {data.per_user.map((u) => (
                                                    <tr key={u.user_id}>
                                                        <td className="py-2.5 pr-3">
                                                            <span className="block text-text truncate">{u.name}</span>
                                                            {u.role && <span className="block text-xs text-text-muted capitalize">{u.role}</span>}
                                                        </td>
                                                        <td className="py-2.5 text-right tabular-nums text-text">{u.videos}</td>
                                                        <td className="py-2.5 text-right tabular-nums text-text-secondary">{u.recordings}</td>
                                                        <td className="py-2.5 text-right tabular-nums text-text-secondary">{u.analysed}</td>
                                                        <td className="py-2.5 text-right text-xs text-text-muted whitespace-nowrap">
                                                            {u.last_upload ? <span title={formatDateTime(u.last_upload)}><Clock className="inline w-3 h-3 mr-1 -mt-0.5" />{timeAgo(u.last_upload)}</span> : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="py-6 text-center text-sm text-text-muted">No videos yet.</p>
                                    )}
                                </Panel>
                            )}
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}

export default HomePage;
