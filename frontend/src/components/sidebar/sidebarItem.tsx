import type { LucideIcon } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';

interface SidebarElementProps {
    icon: LucideIcon;
    text: string;
    href: string;
    onClick?: () => void;
    badge?: string;
}

const SidebarItem = ({ icon: Icon, text, href, onClick, badge }: SidebarElementProps) => {
    const location = useLocation();
    const isActive = location.pathname === href;

    return (
        <Link
            to={href}
            onClick={onClick}
            className={`flex items-center justify-between px-4 py-3 text-text-primary cursor-pointer transition-colors hover:bg-background-main/80! ${isActive ? 'bg-primary/10! border-b border-gray-200' : ''
                }`}
        >
            <div className="flex items-center">
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-text-muted'}`} />
                <span className={`ml-3 ${isActive ? 'font-medium' : ''}`}>{text}</span>
            </div>
            {badge && (
                <div className={`rounded-full px-2 py-1 ${isActive ? 'bg-primary/50' : 'bg-text-muted/20'}`}>
                    <span className="text-xs font-light">{badge}</span>
                </div>
            )}
        </Link>
    )
}

export default SidebarItem;