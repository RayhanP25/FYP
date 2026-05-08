import { Upload, X } from "lucide-react";
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/button';
import { uploadVideo, getVideoUrl } from '@/api/videoApi';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';

interface VideoUploadProps {
    onUploadSuccess?: (videoId: string, videoUrl: string) => void;
}

const VideoUpload = ({ onUploadSuccess }: VideoUploadProps) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setSelectedFile(file);
        }
    };

    const handleUnselectFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error('Please select a video file');
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            const response = await uploadVideo(formData);
            toast.success('Video uploaded successfully!');
            console.log('Upload response:', response);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            // Refresh the video list
            queryClient.invalidateQueries({ queryKey: ['my-videos'] });
            // Get video URL and call success callback
            const videoData = await getVideoUrl(response.video_id);
            onUploadSuccess?.(response.video_id, videoData.presigned_url);
        } catch (error) {
            toast.error('Failed to upload video');
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-between gap-4 bg-background rounded-xl shadow-sm border p-5 h-full">
            <div className="flex-1 flex flex-col items-center justify-center gap-6 rounded-lg border-2 border-dashed border-border bg-background-main p-8 text-center transition-colors hover:border-primary/50 w-full min-h-96">
                <Upload className="w-16 h-16 text-text-muted" />
                <p className="text-text-secondary">
                    Drag & Drop or <label htmlFor="file-upload" className="cursor-pointer text-primary hover:underline font-medium">Choose file</label> to upload
                    <input
                        ref={fileInputRef}
                        id="file-upload"
                        type="file"
                        className="hidden"
                        accept="video/*"
                        onChange={handleFileSelect}
                    />
                </p>
                <p className="text-sm text-text-muted">MP4, MOV, or AVI</p>
                {selectedFile && (
                    <div className="mt-2 p-3 bg-primary/10 rounded-md border border-primary/20 relative">
                        <X
                            className="w-4 h-4 text-text-muted cursor-pointer absolute -top-1 -right-1"
                            onClick={handleUnselectFile}
                        />
                        <p className="text-sm text-primary font-medium">
                            Selected: {selectedFile.name}
                        </p>
                        <p className="text-xs text-text-muted">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                )}
            </div>
            <Button
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
            >
                {isUploading ? 'Uploading...' : 'Upload Video'}
            </Button>
            <span className="text-text-secondary text-xs">OR</span>
            <Button className="w-4/5" onClick={() => navigate('/camera-capture')}>Camera Capture</Button>
        </div>
    )
}

export default VideoUpload