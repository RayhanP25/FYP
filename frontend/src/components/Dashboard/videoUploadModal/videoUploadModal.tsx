import Button from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";

//temporary video upload modal to test radix dialog

const VideoUploadModal = () => (
    <Dialog.Root>
        <Dialog.Trigger asChild>
            <Button size="lg" variant="primary">
                Upload Video
            </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60" />
            <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg focus:outline-none">
                <div className="flex flex-col gap-4">
                    <Dialog.Title className="text-lg font-medium text-text-primary">
                        Select video to upload
                    </Dialog.Title>
                    <Dialog.Description />
                    <div className="flex flex-col items-center justify-center gap-4 rounded-md border-2 border-dashed border-gray-300 p-8 text-center">
                        <Upload className="text-text-muted" />
                        <p className="text-text-secondary">
                            Drag & Drop or <label htmlFor="file-upload" className="cursor-pointer text-blue-600">Choose file</label> to upload
                            <input id="file-upload" type="file" className="hidden" accept="video/*" />
                        </p>
                        <p className="text-sm text-text-secondary">MP4 or MOV</p>
                    </div>
                    <div className="relative my-4 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center" aria-hidden="false">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center bg-white px-4">
                            <span className="text-xs text-text-secondary">OR</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label>Import from URL</label>
                        <input type="url" placeholder="Add file URL" className="border border-gray-300 rounded-md p-2.5 text-sm placeholder:text-xs" />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Dialog.Close asChild>
                            <Button variant="secondary">
                                cancel
                            </Button>
                        </Dialog.Close>
                        <Dialog.Close asChild>
                            <Button className="primary">
                                import
                            </Button>
                        </Dialog.Close>
                    </div>
                </div>
                <Dialog.Close asChild>
                    <Button variant="ghost" className="absolute right-3 top-3">
                        <X />
                    </Button>
                </Dialog.Close>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

export default VideoUploadModal;
