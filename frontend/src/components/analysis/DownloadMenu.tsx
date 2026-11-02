import { ChevronDown, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/dropdown/dropdown';

export type DownloadView = 'left' | 'right';
export type DownloadVariant = 'overlay' | 'plain';

interface DownloadMenuProps {
    hasRight: boolean;
    onDownload: (view: DownloadView, variant: DownloadVariant) => void;
}

const DownloadMenu = ({ hasRight, onDownload }: DownloadMenuProps) => {
    const views: DownloadView[] = hasRight ? ['left', 'right'] : ['left'];
    const label = (view: DownloadView, variant: DownloadVariant) => {
        const plain = variant === 'plain';
        if (!hasRight) return plain ? 'Without skeleton' : 'With skeleton';
        return `${view === 'left' ? 'Left' : 'Right'} camera${plain ? ' (no skeleton)' : ''}`;
    };
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors">
                <Download className="w-4 h-4" /> Download <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-background border-border text-text rounded-lg p-1">
                {views.map((v) => (
                    <DropdownMenuItem key={`${v}-overlay`} onClick={() => onDownload(v, 'overlay')} className="hover:bg-border rounded-md cursor-pointer text-sm">
                        {label(v, 'overlay')}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {views.map((v) => (
                    <DropdownMenuItem key={`${v}-plain`} onClick={() => onDownload(v, 'plain')} className="hover:bg-border rounded-md cursor-pointer text-sm text-text-secondary">
                        {label(v, 'plain')}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default DownloadMenu;
