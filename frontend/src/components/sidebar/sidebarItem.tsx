import type { LucideIcon } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';

interface SidebarElementProps {
    icon: LucideIcon;
    text: string;
    href: string;
}

const SidebarItem = ({ icon: Icon, text, href }: SidebarElementProps) => {
    const location = useLocation();
    const isActive = location.pathname === href;

    return (
        <Link
            to={href}
            className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-sm transition-colors ${isActive ? 'text-primary' : 'text-text-primary hover:bg-background'}`}
        >
            <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-text-primary'}`} />
            <span className="font-light">{text}</span>
            {isActive && (<div className="ml-auto w-1 h-5 bg-white rounded-full" />)}
        </Link>
    )
}

export default SidebarItem;