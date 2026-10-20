import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileVideo, Search } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import Button from '@/components/ui/button';
import VideoThumbnail from '@/components/Video/videoThumbnail';
import { getMyVideos } from '@/api/videoApi';

const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const AnalysisLibraryPage = () => {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [showPending, setShowPending] = useState(false);

    const { data, isLoading, error } = useQuery({ queryKey: ['my-videos'], queryFn: getMyVideos, refetchOnWindowFocus: true });

    const all = useMemo(() => data?.videos || [], [data]);
    const videos = useMemo(() =>
        [...all]
            .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
            .filter((v) => (showPending || v.has_analysis) && v.original_filename.toLowerCase().includes(search.toLowerCase())),
    [all, search, showPending]);

    return (
        <AppLayout>
            <div className="flex flex-col gap-8 max-w-[1800px] mx-auto">
                <div className="flex items-end justify-between gap-6 flex-wrap">
                    <h1 className="text-3xl font-semibold tracking-tight text-text">Analysis</h1>
                    <div className="flex items-center gap-5 flex-wrap">
                        <button
                            role="switch" aria-checked={showPending} onClick={() => setShowPending((v) => !v)}
                            className="inline-flex items-center gap-3 text-sm text-text-secondary hover:text-text transition-colors"
                        >
                            <span className={`relative w-9 h-5 rounded-full transition-colors ${showPending ? 'bg-primary' : 'bg-border'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showPending ? 'translate-x-4' : ''}`} />
                            </span>
                            Show not analyzed
                        </button>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input
                                type="text" placeholder="Search videos..." value={search} onChange={(e) => setSearch(e.target.value)}
                                className="w-full h-10 pl-10 pr-3 rounded-lg bg-background border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                            />
                        </div>
                    </div>
                </div>

                {isLoading && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-6 gap-y-9">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-video rounded-lg bg-background animate-pulse" />)}
                    </div>
                )}

                {error && <p className="text-red-500 text-sm">Error: {(error as Error).message}</p>}

                {!isLoading && !error && videos.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-28 text-center">
                        <FileVideo className="w-10 h-10 text-text-muted" strokeWidth={1.25} />
                        <p className="text-text">{all.length ? (showPending || search ? 'Nothing matches your search' : 'No analyzed videos yet. Turn on "Show not analyzed" to see the rest.') : 'No recordings yet'}</p>
                        {!all.length && <Button onClick={() => navigate('/video-test')} className="mt-2 px-6">Upload a video</Button>}
                    </div>
                )}

                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-6 gap-y-9">
                    {videos.map((v) => (
                        <button
                            key={v.video_id}
                            onClick={() => navigate(`/analysis/${v.video_id}`)}
                            className="group text-left focus:outline-none"
                        >
                            <div className="relative rounded-lg overflow-hidden ring-1 ring-border group-hover:ring-primary/70 group-focus-visible:ring-primary transition-shadow">
                                <VideoThumbnail videoId={v.video_id} className="w-full aspect-video" iconClassName="w-9 h-9" />
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                                <div className="absolute left-2.5 bottom-2.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] uppercase">
                                    <span className={`px-1.5 py-0.5 rounded ${v.is_stereo ? 'bg-primary text-white' : 'bg-black/60 text-white/80'}`}>{v.is_stereo ? 'Stereo' : '2D'}</span>
                                    {!v.has_analysis && <span className="px-1.5 py-0.5 rounded bg-black/60 text-white/60">Not analyzed</span>}
                                </div>
                            </div>
                            <p className="mt-3 text-sm font-medium text-text truncate group-hover:text-primary transition-colors" title={v.original_filename}>{v.original_filename}</p>
                            <p className="mt-0.5 text-xs text-text-muted">{formatDate(v.uploaded_at)}</p>
                        </button>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
};

export default AnalysisLibraryPage;
