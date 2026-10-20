import type { LucideIcon } from 'lucide-react';
import { ChevronDown, LayoutPanelLeft, RotateCcw } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/dropdown/dropdown';
import type { PanelId } from './useStudioLayout';

export interface ViewPanel { id: PanelId; label: string; icon: LucideIcon; available: boolean; }

interface ViewMenuProps {
    panels: ViewPanel[];
    visible: Record<PanelId, boolean>;
    onToggle: (id: PanelId) => void;
    onReset: () => void;
}

const ViewMenu = ({ panels, visible, onToggle, onReset }: ViewMenuProps) => (
    <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:bg-background transition-colors">
            <LayoutPanelLeft className="w-4 h-4" /> View <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-background border-border text-text rounded-lg p-1">
            {panels.map(({ id, label, icon: Icon, available }) => (
                <DropdownMenuCheckboxItem key={id} checked={available && visible[id]} disabled={!available} onCheckedChange={() => onToggle(id)} className="hover:bg-border rounded-md cursor-pointer">
                    <span className="flex items-center gap-2.5 text-sm">
                        <Icon className="w-4 h-4 text-text-muted" />
                        {label}
                        {!available && <span className="ml-auto text-[10px] uppercase tracking-wider text-text-muted">stereo only</span>}
                    </span>
                </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset} className="hover:bg-border rounded-md cursor-pointer text-text-secondary">
                <RotateCcw className="w-4 h-4" /> Reset layout
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);

export default ViewMenu;
