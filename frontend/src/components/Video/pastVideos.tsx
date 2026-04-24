import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Search, FileVideo, Play, Trash2, AlertTriangle, X } from 'lucide-react';
import { getMyVideos, getVideoUrl, deleteVideo } from '@/api/videoApi';
import { toast } from 'react-toastify';
import * as Dialog from '@radix-ui/react-dialog';
import Button from '@/components/ui/button';

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
    const queryClient = useQueryClient();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [videoToDelete, setVideoToDelete] = useState<string | null>(null);

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

    const handleDelete = (videoId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setVideoToDelete(videoId);
        setIsDeleteDialogOpen(true);
    };

    const deleteVideoMutation = useMutation({
        mutationFn: deleteVideo,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-videos'] });
            toast.success('Video deleted successfully');
            setIsDeleteDialogOpen(false);
            setVideoToDelete(null);
        },
        onError: (error: Error) => {
            toast.error('Failed to delete video');
        }
    });

    const confirmDelete = () => {
        if (!videoToDelete) return;
        deleteVideoMutation.mutate(videoToDelete);
    };

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
        <>
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
                                        <th className="text-right py-3 px-4 font-medium text-secondary">Actions</th>
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
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={(e) => handleDelete(video.video_id, e)}
                                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete video"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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

            <Dialog.Root open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/80" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[90vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-text">Delete Video</h2>
                            <Dialog.Close asChild>
                                <button className="p-2 hover:bg-background-main rounded-lg transition-colors">
                                    <X className="w-4 h-4 text-text-muted" />
                                </button>
                            </Dialog.Close>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <div className="text-sm">
                                    <p className="text-text font-medium mb-1">Are you sure you want to delete this video?</p>
                                    <p className="text-text-muted">This action cannot be undone. The video will be permanently removed from the system.</p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Dialog.Close asChild>
                                    <Button type="button" variant="secondary" className="flex-1 bg-background-main text-text border border-border hover:bg-background">
                                        Cancel
                                    </Button>
                                </Dialog.Close>
                                <Button
                                    type="button"
                                    onClick={confirmDelete}
                                    disabled={deleteVideoMutation.isPending}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500"
                                >
                                    {deleteVideoMutation.isPending ? 'Deleting...' : 'Delete'}
                                </Button>
                            </div>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
};

export default PastVideos;