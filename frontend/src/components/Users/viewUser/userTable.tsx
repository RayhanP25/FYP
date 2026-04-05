import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, Trash2 } from 'lucide-react';
import { fetchUsers } from '@/api/userApi';
import AddUserButton from './addUser';
import DeleteUserButton from './deleteUser';

const UserTable = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteModalOpen, setDeleteModalOpen] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: '', userName: '' });
    const usersPerPage = 10;

    const { data: users = [], isLoading, error } = useQuery({
        queryKey: ['users'],
        queryFn: () => fetchUsers(),
        staleTime: 5 * 60 * 1000
    });

    const filteredUsers = useMemo(() => {
        let filtered = users;

        if (searchTerm !== '') {
            filtered = filtered.filter(user =>
                user.full_name.toLowerCase().startsWith(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().startsWith(searchTerm.toLowerCase())
            );
        }

        if (selectedRole !== 'all') {
            filtered = filtered.filter(user => user.role.toLowerCase() === selectedRole.toLowerCase());
        }

        return filtered;
    }, [searchTerm, selectedRole, users]);

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const currentUsers = filteredUsers.slice(startIndex, endIndex);

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
                    <p className="text-secondary">Loading users...</p>
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

    const getRoleStyles = (role: string) => {
        switch (role.toLowerCase()) {
            case 'admin':
                return 'bg-red-500/20 text-red-400';
            case 'coach':
                return 'bg-green-500/20 text-green-400';
            case 'athlete':
                return 'bg-blue-500/20 text-blue-400';
            default:
                return 'bg-gray-500/20 text-gray-400';
        }
    };

    return (
        <section className="bg-background rounded-xl shadow-sm border p-5 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <AddUserButton />
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full md:w-64 pl-10 pr-4 py-2 border rounded-lg bg-background-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <select
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="pl-10 pr-8 py-2 border rounded-lg bg-background-main focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                        >
                            <option value="all">All Roles</option>
                            <option value="admin">Admin</option>
                            <option value="coach">Coach</option>
                            <option value="athlete">Athlete</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-3 px-4 font-medium text-secondary">Name</th>
                            <th className="text-left py-3 px-4 font-medium text-secondary">Email</th>
                            <th className="text-left py-3 px-4 font-medium text-secondary">Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(currentUsers) && currentUsers.map((user) => (
                            <tr key={user._id} className="border-b hover:bg-background-main/50 transition-colors">
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        {user.profile_picture ? (
                                            <img
                                                src={user.profile_picture}
                                                alt={user.full_name}
                                                className="w-8 h-8 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                                <span className="text-primary text-sm font-medium">
                                                    {user.full_name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-medium">{user.full_name}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-muted">{user.email}</td>
                                <td className="py-3 px-4">
                                    <span className={`px-2 py-1 text-xs rounded-full ${getRoleStyles(user.role)}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <button
                                        onClick={() => setDeleteModalOpen({ open: true, userId: user._id, userName: user.full_name })}
                                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-500 hover:text-red-400"
                                        title="Delete user"
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

            <DeleteUserButton
                userId={deleteModalOpen.userId}
                userName={deleteModalOpen.userName}
                isOpen={deleteModalOpen.open}
                onOpenChange={(open) => setDeleteModalOpen({ ...deleteModalOpen, open })}
            />
        </section>
    )
}

export default UserTable;

