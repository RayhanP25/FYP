import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter } from 'lucide-react';
import { fetchUsers } from '@/api/userApi';

const UserTable = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState<string>('all');

    const { data: users = [], isLoading, error } = useQuery({
        queryKey: ['users'],
        queryFn: () => {
            console.log('API call made at', new Date().toLocaleTimeString());
            return fetchUsers();
        },
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
                    <h2 className="text-xl font-semibold mb-2">Users</h2>
                    <p className="text-secondary text-sm">Total users: {filteredUsers.length}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pl-10 pr-4 py-2 border rounded-lg bg-background-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
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
                        {Array.isArray(filteredUsers) && filteredUsers.map((user) => (
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

export default UserTable;

