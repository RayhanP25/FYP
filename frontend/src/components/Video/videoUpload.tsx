import { Upload, X } from "lucide-react";
import { useState, useRef } from "react";

const VideoUpload = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-background-main p-18 text-center transition-colors hover:border-primary/50">
            <Upload className="w-12 h-12 text-text-muted" />
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
    )
}

export default VideoUpload