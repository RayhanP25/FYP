import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { allowedFor } from './registry';
import { useShortcut } from './useShortcut';

export const useGlobalShortcuts = () => {
    const navigate = useNavigate();
    const role = useAuth().user?.role;

    useShortcut('search.focus', () => {
        const input = document.querySelector<HTMLInputElement>('[data-search]');
        input?.focus();
        input?.select();
    });
    useShortcut('nav.home', () => navigate('/home'), allowedFor('nav.home', role));
    useShortcut('nav.videos', () => navigate('/video-test'), allowedFor('nav.videos', role));
    useShortcut('nav.analysis', () => navigate('/analysis'), allowedFor('nav.analysis', role));
    useShortcut('nav.camera', () => navigate('/camera-capture'), allowedFor('nav.camera', role));
    useShortcut('nav.groups', () => navigate('/groups'), allowedFor('nav.groups', role));
    useShortcut('nav.calibration', () => navigate('/calibration'), allowedFor('nav.calibration', role));
    useShortcut('nav.users', () => navigate('/view-users'), allowedFor('nav.users', role));
    useShortcut('nav.settings', () => navigate('/settings'), allowedFor('nav.settings', role));
    useShortcut('nav.manual', () => navigate('/user-manual'), allowedFor('nav.manual', role));
};
