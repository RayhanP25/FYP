import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileVideo, Play } from 'lucide-react';
import { getMyVideos, getVideoUrl } from '@/api/videoApi';

const VideoThumbnail = ({ videoId }: { videoId: string }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchThumbnail = async () => {
            setIsLoading(true);
            try {
                const videoData = await getVideoUrl(videoId);
                setThumbnailUrl(videoData.presigned_url);
            } catch (error) {
                console.error('Failed to fetch video URL:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchThumbnail();
    }, [videoId]);

    return (
        <div className="w-16 h-10 rounded-md overflow-hidden bg-background-main">
            {isLoading ? (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : thumbnailUrl ? (
                <div className="relative w-full h-full">
                    <video
                        className="w-full h-full object-cover"
                        style={{ objectPosition: 'center' }}
                        muted
                        preload="metadata"
                    >
                        <source src={thumbnailUrl} />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className="w-3 h-3 text-white opacity-80" />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <FileVideo className="w-4 h-4 text-primary" />
                </div>
            )}
        </div>
    );
};

interface PastVideosProps {
    onVideoSelect?: (videoId: string, videoUrl: string) => void;
}

const PastVideos = ({ onVideoSelect }: PastVideosProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const videosPerPage = 8;

    const { data: videosData, isLoading, error } = useQuery({
        queryKey: ['my-videos'],
        queryFn: () => getMyVideos(),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 3
    });

    const videos = videosData?.videos || [];

    const filteredVideos = useMemo(() => {
        if (searchTerm === '') return videos;

        return videos.filter(video =>
            video.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, videos]);

    const totalPages = Math.ceil(filteredVideos.length / videosPerPage);
    const startIndex = (currentPage - 1) * videosPerPage;
    const endIndex = startIndex + videosPerPage;
    const currentVideos = filteredVideos.slice(startIndex, endIndex);

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    if (isLoading) {
        return (
            <section className="bg-background rounded-xl shadow-sm border p-5 flex flex-col">
                <div className="flex items-center justify-center py-8">
                    <p className="text-secondary">Loading videos...</p>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="bg-background rounded-xl shadow-sm border p-5 flex flex-col">
                <div className="flex items-center justify-center py-8">
                    <p className="text-red-500">Error: {(error as Error).message}</p>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-background rounded-xl shadow-sm border p-5 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <FileVideo className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-medium text-text-primary">Past Videos</h3>
                </div>
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                        type="text"
                        placeholder="Search videos..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
            </div>

            {videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <FileVideo className="w-16 h-16 text-muted mb-4" />
                    <p className="text-secondary text-lg font-medium">No videos uploaded yet</p>
                    <p className="text-muted mt-2">Upload your first video to get started</p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4 font-medium text-secondary">Video Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentVideos.map((video) => (
                                    <tr
                                        key={video.video_id}
                                        className="border-b hover:bg-background-main/50 transition-colors cursor-pointer"
                                        onClick={() => {
                                            getVideoUrl(video.video_id).then(videoData => {
                                                onVideoSelect?.(video.video_id, videoData.presigned_url);
                                            });
                                        }}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <VideoThumbnail videoId={video.video_id} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate" title={video.original_filename}>
                                                        {video.original_filename}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center mt-4 gap-1">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="rounded-full border py-2 px-3 text-center text-sm transition-all shadow-sm hover:shadow-lg text-text-muted hover:text-text hover:bg-background-main hover:border-background-main focus:text-text focus:bg-background-main focus:border-background-main active:border-background-main active:text-text active:bg-background-main disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
                            >
                                Prev
                            </button>

                            {startPage > 1 && (
                                <button
                                    onClick={() => setCurrentPage(startPage - 1)}
                                    className="rounded-full border py-2 px-3 text-center text-sm transition-all shadow-sm hover:shadow-lg text-text-muted hover:text-text hover:bg-background-main hover:border-background-main focus:text-text focus:bg-background-main focus:border-background-main active:border-background-main active:text-text active:bg-background-main disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
                                >
                                    ...
                                </button>
                            )}
                            {visiblePages.map(pageNum => (
                                <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`min-w-9 rounded-full py-2 px-3.5 text-center text-sm transition-all shadow-md hover:shadow-lg focus:shadow-none active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${currentPage === pageNum
                                        ? 'bg-primary text-text border-transparent'
                                        : 'border text-text-secondary hover:text-text hover:bg-background-main hover:border-background-main focus:text-text focus:bg-background-main focus:border-background-main active:border-background-main active:text-text active:bg-background-main'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            ))}
                            {endPage < totalPages && (
                                <button
                                    onClick={() => setCurrentPage(endPage + 1)}
                                    className="rounded-full border py-2 px-3 text-center text-sm transition-all shadow-sm hover:shadow-lg text-text-secondary hover:text-text hover:bg-background-main hover:border-background-main focus:text-text focus:bg-background-main focus:border-background-main active:border-background-main active:text-text active:bg-background-main disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
                                >
                                    ...
                                </button>
                            )}

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="rounded-full border py-2 px-3 text-center text-sm transition-all shadow-sm hover:shadow-lg text-text-secondary hover:text-text hover:bg-background-main hover:border-background-main focus:text-text focus:bg-background-main focus:border-background-main active:border-background-main active:text-text active:bg-background-main disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}

export default PastVideos