import { useNavigate } from 'react-router-dom';
import { useShortcut } from './useShortcut';

export const useGlobalShortcuts = () => {
    const navigate = useNavigate();

    useShortcut('search.focus', () => {
        const input = document.querySelector<HTMLInputElement>('[data-search]');
        input?.focus();
        input?.select();
    });
    useShortcut('nav.home', () => navigate('/home'));
    useShortcut('nav.videos', () => navigate('/video-test'));
    useShortcut('nav.analysis', () => navigate('/analysis'));
    useShortcut('nav.camera', () => navigate('/camera-capture'));
    useShortcut('nav.groups', () => navigate('/groups'));
    useShortcut('nav.calibration', () => navigate('/calibration'));
    useShortcut('nav.users', () => navigate('/view-users'));
    useShortcut('nav.settings', () => navigate('/settings'));
};
