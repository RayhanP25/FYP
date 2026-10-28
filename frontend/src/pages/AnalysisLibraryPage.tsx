import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileVideo, Search } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import VideoThumbnail from '@/components/Video/videoThumbnail';
import { getMyVideos, type Video } from '@/api/videoApi';
import { useListNav } from '@/shortcuts/useListNav';
import { useShortcut } from '@/shortcuts/useShortcut';

const PAGE_SIZE = 25;
const TOP_UPLOADERS = 5;
const MATCH_LIMIT = 8;
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_100px_180px_140px] items-center gap-4 px-4';

const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const uploaderOf = (v: Video) => v.owner_name || 'Unknown';

const AnalysisLibraryPage = () => {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [uploaderSearch, setUploaderSearch] = useState('');
    const [uploader, setUploader] = useState<string | null>(null);
    const [showPending, setShowPending] = useState(false);
    const [page, setPage] = useState(1);

    const { data, isLoading, error } = useQuery({ queryKey: ['my-videos'], queryFn: getMyVideos, refetchOnWindowFocus: true });
    const all = useMemo(() => data?.videos || [], [data]);

    const uploaderQuery = uploaderSearch.trim().toLowerCase();
    const uploaders = useMemo(() => {
        const counts = new Map<string, number>();
        all.forEach((v) => counts.set(uploaderOf(v), (counts.get(uploaderOf(v)) ?? 0) + 1));
        return [...counts.entries()]
            .filter(([name]) => name.toLowerCase().includes(uploaderQuery))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [all, uploaderQuery]);
    const shownUploaders = uploaders.slice(0, uploaderQuery ? MATCH_LIMIT : TOP_UPLOADERS);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return all
            .filter((v) => (showPending || v.has_analysis)
                && (!uploader || uploaderOf(v) === uploader)
                && v.original_filename.toLowerCase().includes(q))
            .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
    }, [all, search, uploader, showPending]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pageCount);
    const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    const active = useListNav(rows.length, `${current}|${search}|${uploader}|${showPending}`, (i) => navigate(`/analysis/${rows[i].video_id}`));
    useShortcut('page.prev', () => setPage(current - 1), current > 1);
    useShortcut('page.next', () => setPage(current + 1), current < pageCount);

    const selectUploader = (name: string | null) => { setUploader(name); setPage(1); };
    const filterClass = (active: boolean) =>
        `flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${active ? 'bg-background text-text font-medium' : 'text-text-secondary hover:bg-background hover:text-text'}`;

    return (
        <AppLayout>
            <div className="h-full min-h-0 flex flex-col gap-5 max-w-[1800px] mx-auto">
                <div className="flex items-end justify-between gap-6 flex-wrap">
                    <div>
                        <p className="mt-1 text-sm text-text-muted tabular-nums">
                            {all.length.toLocaleString()} {all.length === 1 ? 'video' : 'videos'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            role="switch" aria-checked={showPending} onClick={() => { setShowPending((v) => !v); setPage(1); }}
                            className="inline-flex items-center gap-2.5 h-9 px-3 rounded-md border border-border text-sm text-text-secondary hover:text-text hover:bg-background transition-colors"
                        >
                            <span className={`relative w-8 h-4 rounded-full transition-colors ${showPending ? 'bg-primary' : 'bg-border'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showPending ? 'translate-x-4' : ''}`} />
                            </span>
                            Show not analyzed
                        </button>
                        <div className="relative w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input
                                data-search type="text" placeholder="Search by video name" value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="w-full h-9 pl-9 pr-3 rounded-md bg-background border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-[220px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-5 items-start">
                    <aside className="max-h-full overflow-y-auto no-scrollbar flex flex-col gap-2">
                        <div className="h-10 flex items-center">
                            <input
                                type="text" placeholder="Search by name" value={uploaderSearch}
                                onChange={(e) => setUploaderSearch(e.target.value)}
                                className="w-full h-10 px-2.5 rounded-md bg-background border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <button onClick={() => selectUploader(null)} className={filterClass(!uploader)}>
                                <span>All uploaders</span>
                                <span className="text-xs tabular-nums text-text-muted">{all.length.toLocaleString()}</span>
                            </button>
                            {shownUploaders.map(([name, count]) => (
                                <button key={name} onClick={() => selectUploader(name)} className={filterClass(uploader === name)}>
                                    <span className="truncate">{name}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-text-muted">{count.toLocaleString()}</span>
                                </button>
                            ))}
                            {uploaderQuery && uploaders.length === 0 && <p className="px-2.5 py-2 text-xs text-text-muted">No one matches "{uploaderSearch.trim()}"</p>}
                            {uploaderQuery && uploaders.length > shownUploaders.length && (
                                <p className="px-2.5 py-2 text-xs text-text-muted">Showing {shownUploaders.length} of {uploaders.length.toLocaleString()}. Type more to narrow down.</p>
                            )}
                        </div>
                    </aside>

                    <div className="max-h-full flex flex-col border border-border rounded-md overflow-hidden bg-background-main min-w-0">
                        <div className={`${ROW_GRID} h-10 shrink-0 text-xs font-medium text-text-muted bg-background border-b border-border`}>
                            <span>Name</span>
                            <span>Type</span>
                            <span>Uploaded by</span>
                            <span>Date uploaded</span>
                        </div>

                        {/* Rows scroll inside the table; the header above and the page bar below stay put. */}
                        <div className="min-h-0 overflow-y-auto no-scrollbar">
                        {isLoading && Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className={`${ROW_GRID} h-[72px] border-t border-border`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 aspect-video rounded-sm bg-background animate-pulse" />
                                    <div className="h-4 w-1/2 rounded bg-background animate-pulse" />
                                </div>
                                <div className="h-4 w-12 rounded bg-background animate-pulse" />
                                <div className="h-4 w-3/4 rounded bg-background animate-pulse" />
                                <div className="h-4 w-20 rounded bg-background animate-pulse" />
                            </div>
                        ))}

                        {error && <p className="px-4 py-6 text-sm text-red-500">Error: {(error as Error).message}</p>}

                        {!isLoading && !error && rows.map((v, i) => (
                            <button
                                key={v.video_id}
                                data-row={i}
                                onClick={() => navigate(`/analysis/${v.video_id}`)}
                                className={`${ROW_GRID} w-full h-[72px] text-left text-sm border-t border-border hover:bg-background focus:outline-none focus-visible:bg-background transition-colors ${active === i ? 'bg-background' : ''}`}
                            >
                                <span className="min-w-0 flex items-center gap-3">
                                    <VideoThumbnail videoId={v.video_id} className="w-24 aspect-video rounded-sm" iconClassName="w-4 h-4" />
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium text-text" title={v.original_filename}>{v.original_filename}</span>
                                        {!v.has_analysis && <span className="block text-xs text-text-muted">Not analyzed</span>}
                                    </span>
                                </span>
                                <span className="text-text-secondary">{v.is_stereo ? 'Stereo' : '2D'}</span>
                                <span className="truncate text-text-secondary">{uploaderOf(v)}</span>
                                <span className="text-text-muted tabular-nums">{formatDate(v.uploaded_at)}</span>
                            </button>
                        ))}

                        {!isLoading && !error && filtered.length === 0 && (
                            <div className="flex flex-col items-center gap-3 py-24 text-center border-t border-border">
                                <FileVideo className="w-10 h-10 text-text-muted" strokeWidth={1.25} />
                                <p className="text-text">{all.length ? 'No videos match these filters' : 'No recordings yet'}</p>
                                {!all.length && <Button onClick={() => navigate('/video-test')} className="mt-2 px-6">Upload a video</Button>}
                            </div>
                        )}
                        </div>

                        {!isLoading && !error && filtered.length > 0 && (
                            <div className="flex items-center justify-between gap-4 h-12 shrink-0 px-4 border-t border-border text-sm text-text-muted">
                                <span className="tabular-nums">
                                    {((current - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(current * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="tabular-nums mr-2">Page {current} of {pageCount.toLocaleString()}</span>
                                    <Button variant="secondary" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <Button variant="secondary" size="sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)} aria-label="Next page">
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default AnalysisLibraryPage;
