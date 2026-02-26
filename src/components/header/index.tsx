import { useNavigate } from 'react-router-dom';
import { logout } from '@/hooks/auth';
import { isLogin } from '@/hooks/auth';
import { useState } from 'react';
import HeaderSearchbar from './headerSearchbar';
import { Brain, HelpCircle, User, ChevronDown, Bell } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/dropdown/dropdown';

// temp header

const Header = () => {
  const username = "Username";
  const userRole = "Platform Admin";

  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(isLogin());

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    navigate('/login');
  };

  return (
    <header className="border-b border-gray-200">
      <nav className="bg-white border-gray-200 py-4">
        <div className="flex flex-wrap justify-between items-center mx-auto max-w-full px-4 lg:px-6">
          <div className="flex items-center">
            <div className="flex flex-row gap-2">
              <Brain className="w-6 h-6" />
              <span className="text-xl font-semibold whitespace-nowrap">
                TITLE
              </span>
              <div className="rounded-full px-2 py-1 bg-[#f7f5eb]">
                <span className="text-xs">
                  ADMIN
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <HeaderSearchbar />
            <Bell className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800" />
            <HelpCircle className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800" />
            <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <div className="text-sm font-medium">{username}</div>
                <div className="text-xs text-gray-500">{userRole}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleLogout}>
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};
export default Header;
