import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface SidebarElementProps {
    icon: LucideIcon;
    text: string;
    href?: string;
    onClick?: () => void;
    badge?: string;
}

const SidebarItem = ({ icon: Icon, text, href = "#", onClick, badge }: SidebarElementProps) => {
    const location = useLocation();
    const isActive = location.pathname === href;
    const Component = href === "#" ? "div" : "a";

    return (
        <Component
            href={href}
            onClick={onClick}
            className={`flex items-center justify-between px-4 py-3 text-gray-700 cursor-pointer transition-colors hover:!bg-gray-100 ${isActive ? '!bg-[#FAF9F5] border-b border-gray-200' : ''
                }`}
        >
            <div className="flex items-center">
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#D1C49F]' : 'text-gray-400'}`} />
                <span className={`ml-3 ${isActive ? 'font-medium' : ''}`}>{text}</span>
            </div>
            {badge && (
                <div className={`rounded-full px-2 py-1 ${isActive ? 'bg-[#f7f5eb]' : 'bg-gray-100'}`}>
                    <span className="text-xs font-light">{badge}</span>
                </div>
            )}
        </Component>
    )
}

export default SidebarItem;