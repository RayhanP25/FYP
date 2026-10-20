import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface PanelCardProps {
    title: string;
    onHide: () => void;
    children: ReactNode;
}

const PanelCard = ({ title, onHide, children }: PanelCardProps) => (
    <section className="group/tile flex flex-col h-full min-w-0 rounded-xl bg-background-main border border-border overflow-hidden">
        <header className="flex items-center justify-between h-9 pl-4 pr-2 border-b border-border flex-none">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">{title}</h3>
            <button onClick={onHide} className="p-1 rounded text-text-muted opacity-0 group-hover/tile:opacity-100 hover:text-text hover:bg-border transition" title="Hide panel">
                <X className="w-3.5 h-3.5" />
            </button>
        </header>
        <div className="relative flex-1 min-h-0">{children}</div>
    </section>
);

export default PanelCard;
