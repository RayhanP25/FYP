import * as Dialog from "@radix-ui/react-dialog";
import Button from "@/components/ui/button";
import { X, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUser } from "@/api/userApi";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface DeleteUserProps {
    userId: string;
    userName: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const DeleteUserButton = ({ userId, userName, isOpen, onOpenChange }: DeleteUserProps) => {
    const queryClient = useQueryClient();

    const deleteUserMutation = useMutation({
        mutationFn: deleteUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });

            toast.success('User deleted successfully!', {
                position: "top-right",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
            });

            onOpenChange(false);
        },
        onError: (error: Error) => {
            toast.error(error.message, {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
            });
        }
    });

    const handleDelete = () => {
        deleteUserMutation.mutate(userId);
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/80" />
                <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[90vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none border border-border">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-text">Delete User</h2>
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
                                <p className="text-text font-medium mb-1">Are you sure you want to delete <span className="text-red-400">{userName}</span>?</p>
                                <p className="text-text-muted">This action cannot be undone. The user will be permanently removed from the system.</p>
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
                                onClick={handleDelete}
                                disabled={deleteUserMutation.isPending}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500"
                            >
                                {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
                            </Button>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

export default DeleteUserButton;
