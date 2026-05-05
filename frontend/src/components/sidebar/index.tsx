import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Home, Video, Camera, BarChart3, User2, Users, Search, ChevronDown, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown/dropdown';
import SidebarItem from './sidebarItem';
import SectionTitle from './sectionTitle';

const Sidebar = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const { user, logout, isAuthenticated } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <aside className="w-64 bg-background-main border-r border-border h-screen flex flex-col fixed left-0 top-0">
            <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <Video className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-semibold text-text-primary">SPORTPOSE</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="p-4">
                    <div className="mb-3">
                        <SectionTitle title="Menu" />
                    </div>
                    <nav>
                        <SidebarItem icon={Home} text="Dashboard" href="/home" />
                        <SidebarItem icon={Video} text="Videos" href="/video-test" />
                        <SidebarItem icon={Camera} text="Camera" href="/camera-capture" />
                        <SidebarItem icon={BarChart3} text="Analysis" href="/kinematic-analysis" />
                        <SidebarItem icon={Users} text="Users" href="/view-users" />
                    </nav>
                </div>
            </div>

            {/* doesnt work for now */}
            <div className="p-4 border-t border-border">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    />
                </div>
            </div>

            {isAuthenticated() && (
                <div className="p-4 border-t border-border">
                    <DropdownMenu>
                        <DropdownMenuTrigger className="w-full">
                            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-background transition-colors cursor-pointer">
                                <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center">
                                    <img
                                        src={user?.profile_picture || "http://dummyimage.com/123x100.png/cc0000/ffffff"}
                                        alt={user?.full_name || 'User'}
                                        className="w-8 h-8 rounded-full object-cover"
                                    />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="text-sm font-medium text-text-primary">{user?.full_name || 'User'}</div>
                                    <div className="text-xs text-text-muted">{user?.role || 'User'}</div>
                                </div>
                                <ChevronDown className="w-4 h-4 text-text-muted" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48 bg-background-main border border-border">
                            <DropdownMenuItem onClick={() => navigate('/user-profile')}>
                                <User2 className="w-4 h-4 mr-2" />
                                Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleLogout}>
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </aside>
    );
};

export default Sidebar