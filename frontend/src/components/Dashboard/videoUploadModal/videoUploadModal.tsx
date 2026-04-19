import Button from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import { useState } from "react";
import { uploadVideo } from "@/api/videoApi";
import { toast } from "react-toastify";

//temporary video upload modal to test radix dialog

const VideoUploadModal = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setSelectedFile(file);
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
        } catch (error) {
            toast.error('Failed to upload video');
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog.Root>
            <Dialog.Trigger asChild>
                <Button size="lg" variant="primary">
                    Upload Video
                </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background border border-border p-6 shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <div className="flex flex-col gap-6">
                        <Dialog.Title className="text-xl font-semibold text-text-primary">
                            Upload Video
                        </Dialog.Title>
                        <Dialog.Description className="text-text-secondary">
                            Upload your sports video for pose analysis
                        </Dialog.Description>

                        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-background-main p-8 text-center transition-colors hover:border-primary/50">
                            <Upload className="w-12 h-12 text-text-muted" />
                            <p className="text-text-secondary">
                                Drag & Drop or <label htmlFor="file-upload" className="cursor-pointer text-primary hover:underline font-medium">Choose file</label> to upload
                                <input
                                    id="file-upload"
                                    type="file"
                                    className="hidden"
                                    accept="video/*"
                                    onChange={handleFileSelect}
                                />
                            </p>
                            <p className="text-sm text-text-muted">MP4, MOV, or AVI</p>
                            {selectedFile && (
                                <div className="mt-2 p-2 bg-primary/10 rounded-md border border-primary/20">
                                    <p className="text-sm text-primary font-medium">
                                        Selected: {selectedFile.name}
                                    </p>
                                    <p className="text-xs text-text-muted">
                                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="relative my-2 flex items-center justify-center">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center bg-background px-3">
                                <span className="text-xs text-text-muted font-medium">OR</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="url-input" className="text-sm font-medium text-text-primary">
                                Import from URL
                            </label>
                            <input
                                id="url-input"
                                type="url"
                                placeholder="https://example.com/video.mp4"
                                className="w-full border border-border bg-background-main rounded-md px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Dialog.Close asChild>
                                <Button variant="secondary" size="md">
                                    Cancel
                                </Button>
                            </Dialog.Close>
                            <Dialog.Close asChild>
                                <Button
                                    variant="primary"
                                    size="md"
                                    onClick={handleUpload}
                                    disabled={isUploading || !selectedFile}
                                >
                                    {isUploading ? 'Uploading...' : 'Upload'}
                                </Button>
                            </Dialog.Close>
                        </div>
                    </div>

                    <Dialog.Close asChild>
                        <Button variant="ghost" className="absolute right-4 top-4 p-1 hover:bg-background-main rounded-md">
                            <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
                        </Button>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default VideoUploadModal;
