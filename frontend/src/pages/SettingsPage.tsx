import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Keyboard, type LucideIcon } from 'lucide-react';
import AppLayout from '@/layout/AppLayout';
import ShortcutSettings from '@/components/settings/ShortcutSettings';

const SECTIONS: { id: string; label: string; icon: LucideIcon; Component: () => ReactNode }[] = [
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, Component: ShortcutSettings },
];

const SettingsPage = () => {
    const [activeId, setActiveId] = useState(SECTIONS[0].id);
    const section = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
    const Active = section.Component;
    const navigate = useNavigate();

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-text-muted hover:text-text transition-colors self-start">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>

                <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-8">
                    <nav className="flex flex-col gap-1">
                        {SECTIONS.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActiveId(s.id)}
                                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${s.id === section.id
                                    ? 'border border-border bg-background-main font-medium text-text'
                                    : 'text-text-secondary hover:bg-background-main hover:text-text'}`}
                            >
                                <s.icon className="h-4 w-4" />
                                {s.label}
                            </button>
                        ))}
                    </nav>

                    <section className="flex min-w-0 flex-col gap-4">
                        <h2 className="text-lg font-semibold text-text">{section.label}</h2>
                        <Active />
                    </section>
                </div>
            </div>
        </AppLayout>
    );
};

export default SettingsPage;
