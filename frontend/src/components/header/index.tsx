import { useLocation, useNavigate } from 'react-router-dom';
import { Settings, Menu } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const BREADCRUMB_MAP: Record<string, string> = {
    '/home': 'Dashboard',
    '/video-test': 'Videos',
    '/camera-capture': 'Camera',
    '/kinematic-analysis': 'Analysis',
    '/view-users': 'Users',
    '/user-profile': 'Profile',
    '/settings': 'Settings',
  };

  const getBreadcrumb = () => BREADCRUMB_MAP[location.pathname] || 'Dashboard';

  return (
    <header className="bg-background-main border-b border-border">
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-3">
          <Menu className="w-5 h-5 text-text-muted" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Menu</span>
            <span className="text-text-muted">/</span>
            <span className="text-text-primary font-medium">{getBreadcrumb()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 text-text-muted hover:text-text-primary hover:bg-background rounded-lg transition-colors" onClick={() => navigate('/settings')}>
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
