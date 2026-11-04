import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Settings, Menu } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const BREADCRUMB_MAP: Record<string, string> = {
    '/home': 'Dashboard',
    '/video-test': 'Videos',
    '/camera-capture': 'Camera',
    '/kinematic-analysis': 'Analysis',
    '/analysis': 'Analysis',
    '/view-users': 'Users',
    '/groups': 'Groups',
    '/calibration': 'Calibration',
    '/settings': 'Settings',
    '/user-manual': 'User manual',
  };

  // the User manual button opens the manual at the section for the page you are on
  const MANUAL_SECTION: Record<string, string> = {
    '/home': 'start-here',
    '/video-test': 'videos',
    '/camera-capture': 'camera',
    '/kinematic-analysis': 'analysis',
    '/analysis': 'analysis',
    '/groups': 'groups',
    '/calibration': 'calibration',
    '/settings': 'getting-around',
  };
  const manualSection = MANUAL_SECTION[Object.keys(MANUAL_SECTION).find((p) => location.pathname === p || location.pathname.startsWith(p + '/')) ?? ''];

  const getBreadcrumb = () => BREADCRUMB_MAP[Object.keys(BREADCRUMB_MAP).find((p) => location.pathname === p || location.pathname.startsWith(p + '/')) ?? ''] || 'Dashboard';

  return (
    <header className="h-16 bg-background-main border-b border-border">
      <div className="h-full flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Menu className="w-5 h-5 text-text-muted" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Menu</span>
            <span className="text-text-muted">/</span>
            <span className="text-text font-medium">{getBreadcrumb()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="inline-flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-background rounded-lg transition-colors" onClick={() => navigate(manualSection ? `/user-manual#${manualSection}` : '/user-manual')} title="Help for this page">
            <BookOpen className="w-5 h-5" />
            User manual
          </button>
          <button className="p-2 text-text-muted hover:text-text hover:bg-background rounded-lg transition-colors" onClick={() => navigate('/settings')} title="Settings">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
