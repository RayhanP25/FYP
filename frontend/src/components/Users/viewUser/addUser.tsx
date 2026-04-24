import * as Dialog from "@radix-ui/react-dialog";
import Button from "@/components/ui/button";
import { Camera, User, Mail, Lock, Shield, X } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser } from "@/api/userApi";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const AddUserButton = () => {
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
        role: 'athlete'
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isOpen, setIsOpen] = useState(false);
    const queryClient = useQueryClient();

    const createUserMutation = useMutation({
        mutationFn: createUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });

            setFormData({
                full_name: '',
                email: '',
                password: '',
                confirm_password: '',
                role: 'athlete'
            });
            setProfilePic(null);
            setErrors({});

            toast.success('User created successfully!', {
                position: "top-right",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
            });

            setIsOpen(false);
        },
        onError: (error: Error) => {
            setErrors({ submit: error.message });
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

    // Convert image to base64 for API submission. Need to store in MinIO later instead.
    const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfilePic(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.full_name.trim()) {
            newErrors.full_name = 'Full name is required';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Email is invalid';
        }

        if (!formData.password.trim()) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        if (!formData.confirm_password.trim()) {
            newErrors.confirm_password = 'Please confirm password';
        } else if (formData.password !== formData.confirm_password) {
            newErrors.confirm_password = 'Passwords do not match';
        }

        if (!formData.role) {
            newErrors.role = 'Role is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (validateForm()) {
            const userData = {
                full_name: formData.full_name,
                email: formData.email,
                password: formData.password,
                role: formData.role,
                profile_picture: profilePic || undefined
            };

            createUserMutation.mutate(userData);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
            <Dialog.Trigger asChild>
                <Button>
                    Add User
                </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/80" />
                <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none border border-border">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold text-text">Add New User</h2>
                        <Dialog.Close asChild>
                            <button className="p-2 hover:bg-background-main rounded-lg transition-colors">
                                <X className="w-5 h-5 text-text-muted" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className="space-y-5">
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full bg-background-main border-2 border-border flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors">
                                    {profilePic ? (
                                        <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <Camera className="w-6 h-6 text-text-muted" />
                                    )}
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProfilePicChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                            <p className="text-xs text-text-muted mt-1">Click to upload</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text">
                                        <User className="w-4 h-4 text-primary" />
                                        Full Name
                                    </label>
                                    <input
                                        type="text"
                                        name="full_name"
                                        value={formData.full_name}
                                        onChange={handleInputChange}
                                        className={`w-full px-3 py-2.5 rounded-lg bg-background-main border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-text placeholder:text-text-muted transition-colors ${errors.full_name ? 'border-red-500' : 'border-border'
                                            }`}
                                        placeholder="Enter full name"
                                    />
                                    {errors.full_name && (
                                        <p className="text-red-500 text-xs">{errors.full_name}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text">
                                        <Mail className="w-4 h-4 text-primary" />
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        className={`w-full px-3 py-2.5 rounded-lg bg-background-main border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-text placeholder:text-text-muted transition-colors ${errors.email ? 'border-red-500' : 'border-border'
                                            }`}
                                        placeholder="Enter email address"
                                    />
                                    {errors.email && (
                                        <p className="text-red-500 text-xs">{errors.email}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text">
                                        <Lock className="w-4 h-4 text-primary" />
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        className={`w-full px-3 py-2.5 rounded-lg bg-background-main border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-text placeholder:text-text-muted transition-colors ${errors.password ? 'border-red-500' : 'border-border'
                                            }`}
                                        placeholder="Enter password"
                                    />
                                    {errors.password && (
                                        <p className="text-red-500 text-xs">{errors.password}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text">
                                        <Lock className="w-4 h-4 text-primary" />
                                        Confirm
                                    </label>
                                    <input
                                        type="password"
                                        name="confirm_password"
                                        value={formData.confirm_password}
                                        onChange={handleInputChange}
                                        className={`w-full px-3 py-2.5 rounded-lg bg-background-main border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-text placeholder:text-text-muted transition-colors ${errors.confirm_password ? 'border-red-500' : 'border-border'
                                            }`}
                                        placeholder="Confirm password"
                                    />
                                    {errors.confirm_password && (
                                        <p className="text-red-500 text-xs">{errors.confirm_password}</p>
                                    )}
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text">
                                        <Shield className="w-4 h-4 text-primary" />
                                        Role
                                    </label>
                                    <select
                                        name="role"
                                        value={formData.role}
                                        onChange={handleInputChange}
                                        className={`w-full px-3 py-2.5 rounded-lg bg-background-main border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-text transition-colors appearance-none cursor-pointer ${errors.role ? 'border-red-500' : 'border-border'
                                            }`}
                                    >
                                        <option value="athlete">Athlete</option>
                                        <option value="coach">Coach</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    {errors.role && (
                                        <p className="text-red-500 text-xs">{errors.role}</p>
                                    )}
                                </div>
                            </div>

                            {errors.submit && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">
                                    {errors.submit}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <Dialog.Close asChild>
                                    <Button type="button" variant="secondary" className="flex-1 bg-background-main text-text border border-border hover:bg-background">
                                        Cancel
                                    </Button>
                                </Dialog.Close>
                                <Button type="submit" disabled={createUserMutation.isPending} className="flex-1">
                                    {createUserMutation.isPending ? 'Creating...' : 'Add User'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

export default AddUserButton