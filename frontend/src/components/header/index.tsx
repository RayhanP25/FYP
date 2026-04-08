import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import HeaderSearchbar from './headerSearchbar';
import { Brain, HelpCircle, User, ChevronDown, Bell } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/dropdown/dropdown';

// temp header

const Header = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="border-b border-gray-200">
      <nav className="bg-background border-gray-200 py-4">
        <div className="flex flex-wrap justify-between items-center mx-auto max-w-full px-4 lg:px-6">
          <div className="flex items-center">
            <div className="flex flex-row gap-2">
              <Brain className="w-6 h-6 text-text-primary" />
              <span className="text-xl font-semibold text-text-primary whitespace-nowrap">
                SPORTPOSE
              </span>
              <div className="rounded-full px-2 py-1 bg-primary/30">
                <span className="text-xs text-text-primary">
                  {user?.role?.toUpperCase() || 'USER'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <HeaderSearchbar />
            <Bell className="w-5 h-5 text-text-secondary cursor-pointer hover:text-text-primary" />
            <HelpCircle className="w-5 h-5 text-text-secondary cursor-pointer hover:text-text-primary" />
            {isAuthenticated() && (
              <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <img
                    src={user?.profile_picture || "http://dummyimage.com/123x100.png/cc0000/ffffff"}
                    alt={user?.full_name || 'User'}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary">{user?.full_name || 'User'}</div>
                  <div className="text-xs text-text-secondary">{user?.role || 'User'}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleLogout}>
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
