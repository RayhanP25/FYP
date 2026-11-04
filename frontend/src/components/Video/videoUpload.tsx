import { Upload, X } from "lucide-react";
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/button';
import { uploadVideo, getVideoUrl, MAX_UPLOAD_MB } from '@/api/videoApi';
import { JobProgress, newJobKey, useJobProgress } from '../ui/JobProgress';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';

interface VideoUploadProps {
    onUploadSuccess?: (videoId: string, videoUrl: string) => void;
}

const VideoUpload = ({ onUploadSuccess }: VideoUploadProps) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [sent, setSent] = useState(0);                          // 0-1: how much of the file has been sent
    const [job, setJob] = useState<string | null>(null);
    const serverProgress = useJobProgress(job);
    const [dragging, setDragging] = useState(false);
    const [twoCameras, setTwoCameras] = useState(false);   // left and right camera side by side in one file
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Some PCs report no type for AVI / MOV files, so the extension counts too.
    const pick = (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('video/') && !/\.(mp4|mov|avi)$/i.test(file.name)) {
            toast.error('Please choose a video file (MP4, MOV or AVI).');
            return;
        }
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
            toast.error(`This video is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_UPLOAD_MB} MB: trim it or record a shorter clip.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        setSelectedFile(file);
    };
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => pick(event.target.files?.[0]);

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
        setSent(0);
        const key = newJobKey('upload');
        setJob(key);
        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            const response = await uploadVideo(formData, setSent, key, twoCameras);
            toast.success('Video uploaded.');
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
            toast.error(error instanceof Error ? error.message : 'Failed to upload video');
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
            setJob(null);
        }
    };

    return (
        <div className="flex flex-col items-center justify-between gap-4 bg-background rounded-xl shadow-sm border p-5 h-full">
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (!isUploading) pick(e.dataTransfer.files?.[0]); }}
                className={`flex-1 flex flex-col items-center justify-center gap-6 rounded-lg border-2 border-dashed bg-background-main p-8 text-center transition-colors hover:border-primary/50 w-full min-h-96 ${dragging ? 'border-primary' : 'border-border'}`}
            >
                <Upload className="w-16 h-16 text-text-muted" />
                <p className="text-text-secondary">
                    Drag & Drop or <label htmlFor="file-upload" className="cursor-pointer text-primary hover:underline font-medium">Choose file</label> to upload
                    <input
                        ref={fileInputRef}
                        id="file-upload"
                        type="file"
                        className="hidden"
                        accept="video/*,.mp4,.mov,.avi"
                        onChange={handleFileSelect}
                    />
                </p>
                <p className="text-sm text-text-muted">MP4, MOV or AVI, up to {MAX_UPLOAD_MB} MB</p>
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
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={twoCameras} disabled={isUploading}
                        onChange={(e) => setTwoCameras(e.target.checked)} />
                    Two cameras side by side (left | right), e.g. an OBS recording of both cameras
                </label>
            </div>
            {isUploading ? (
                <div className="w-full">
                    {sent < 1
                        ? <JobProgress title="Uploading the video" job={null} fallbackStage="Sending the file" fraction={sent} />
                        : <JobProgress title="Uploading the video" job={serverProgress}
                            fallbackStage={twoCameras ? "Splitting the two cameras" : "Converting the video"}
                            note={twoCameras ? "The video is split into the left and right camera so it can be analysed in 3D."
                                : "MOV and AVI videos are converted to MP4 so every browser can play them."} />}
                </div>
            ) : (
                <Button onClick={handleUpload} disabled={!selectedFile}>Upload Video</Button>
            )}
            <span className="text-text-secondary text-xs">OR</span>
            <Button className="w-4/5" onClick={() => navigate('/camera-capture')}>Camera Capture</Button>
        </div>
    )
}

export default VideoUpload