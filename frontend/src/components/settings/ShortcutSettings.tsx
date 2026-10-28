import { useEffect, useState } from 'react';
import { Pencil, RotateCcw, Search } from 'lucide-react';
import { SHORTCUTS, SHORTCUT_GROUPS, groupOf, type ShortcutId } from '@/shortcuts/registry';
import { bindingOf, useShortcutSettings } from '@/shortcuts/store';
import { comboOf, formatBinding, RESERVED } from '@/shortcuts/keys';
import Toggle from '@/components/ui/toggle';

const MAX_STEPS = 2;

const overlaps = (existing: string | null, binding: string) =>
    existing !== null && (existing === binding || existing.startsWith(`${binding} `) || binding.startsWith(`${existing} `));

const conflictOf = (id: ShortcutId, binding: string): string | null => {
    if (binding.split(' ').some((step) => RESERVED.has(step))) return 'The browser uses one of these keys.';
    const group = groupOf(id);
    const other = SHORTCUTS.find((s) => s.id !== id
        && overlaps(bindingOf(s.id), binding)
        && (s.group === group || s.group === 'Global' || group === 'Global'));
    return other ? `Already used by "${other.label}".` : null;
};

const ShortcutSettings = () => {
    const enabled = useShortcutSettings((s) => s.enabled);
    const custom = useShortcutSettings((s) => s.custom);
    const setEnabled = useShortcutSettings((s) => s.setEnabled);
    const setBinding = useShortcutSettings((s) => s.setBinding);
    const resetBinding = useShortcutSettings((s) => s.resetBinding);
    const resetAll = useShortcutSettings((s) => s.resetAll);

    const [query, setQuery] = useState('');
    const [capturing, setCapturing] = useState<ShortcutId | null>(null);
    const [draft, setDraft] = useState<string[]>([]);
    const [error, setError] = useState<{ id: ShortcutId; message: string } | null>(null);

    const stopCapture = () => {
        setCapturing(null);
        setDraft([]);
        setError(null);
    };

    useEffect(() => {
        if (!capturing) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === 'Escape') { setCapturing(null); setDraft([]); setError(null); return; }
            const combo = comboOf(e);
            if (combo) setDraft((d) => (d.length < MAX_STEPS ? [...d, combo] : d));
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [capturing]);

    const save = (id: ShortcutId) => {
        const binding = draft.join(' ');
        const message = conflictOf(id, binding);
        if (message) { setError({ id, message }); return; }
        setBinding(id, binding);
        stopCapture();
    };

    const search = query.trim().toLowerCase();
    const matches = (s: (typeof SHORTCUTS)[number]) =>
        !search || s.label.toLowerCase().includes(search) || formatBinding(bindingOf(s.id) ?? s.binding).toLowerCase().includes(search);

    const iconButton = 'rounded-md p-1.5 text-text-muted transition-colors hover:bg-background hover:text-text disabled:opacity-30';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background-main px-5 py-4">
                <p className="text-sm font-medium text-text">Enable keyboard shortcuts</p>
                <div className="flex items-center gap-4">
                    <button
                        onClick={resetAll}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-background hover:text-text"
                    >
                        <RotateCcw className="h-4 w-4" /> Restore defaults
                    </button>
                    <Toggle checked={enabled} onChange={setEnabled} label="Enable keyboard shortcuts" />
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                    type="text"
                    placeholder="Search shortcuts"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </div>

            <div className={`flex flex-col gap-4 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                {SHORTCUT_GROUPS.map((group) => {
                    const items = SHORTCUTS.filter((s) => s.group === group && matches(s));
                    if (!items.length) return null;
                    return (
                        <div key={group} className="overflow-hidden rounded-xl border border-border bg-background-main">
                            <div className="border-b border-border px-5 py-2.5 text-xs font-medium text-text-muted">{group}</div>
                            {items.map((s) => {
                                const binding = bindingOf(s.id);
                                const isCapturing = capturing === s.id;
                                return (
                                    <div key={s.id} className="border-t border-border first:border-t-0">
                                        <div className="flex items-center gap-4 px-5 py-3">
                                            <p className={`min-w-0 flex-1 text-sm ${binding === null ? 'text-text-muted line-through' : 'text-text'}`}>{s.label}</p>

                                            {isCapturing ? (
                                                <>
                                                    <span className="text-xs text-text-muted">
                                                        {draft.length ? <kbd className="rounded-md border border-primary/60 bg-background px-2 py-0.5 font-medium text-text">{formatBinding(draft.join(' '))}</kbd> : `Press up to ${MAX_STEPS} keys, then Save`}
                                                    </span>
                                                    <button onClick={() => save(s.id)} disabled={!draft.length} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-text-inverse transition-opacity disabled:opacity-40">Save</button>
                                                    <button onClick={stopCapture} className="h-8 rounded-md border border-border px-3 text-sm text-text-secondary transition-colors hover:text-text">Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    {binding === null ? (
                                                        <span className="text-xs text-text-muted">Off</span>
                                                    ) : (
                                                        <kbd className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-text-secondary">{formatBinding(binding)}</kbd>
                                                    )}
                                                    <button
                                                        onClick={() => { setError(null); setDraft([]); setCapturing(s.id); }}
                                                        disabled={binding === null}
                                                        title="Change key"
                                                        aria-label={`Change key for ${s.label}`}
                                                        className={iconButton}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => resetBinding(s.id)}
                                                        disabled={!(s.id in custom)}
                                                        title="Reset to default"
                                                        aria-label={`Reset ${s.label}`}
                                                        className={iconButton}
                                                    >
                                                        <RotateCcw className="h-4 w-4" />
                                                    </button>
                                                    <Toggle
                                                        checked={binding !== null}
                                                        onChange={(on) => (on ? resetBinding(s.id) : setBinding(s.id, null))}
                                                        label={`Turn on ${s.label}`}
                                                    />
                                                </>
                                            )}
                                        </div>
                                        {error?.id === s.id && <p className="px-5 pb-3 text-xs text-red-500">{error.message}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
                {!SHORTCUTS.some(matches) && <p className="py-10 text-center text-sm text-text-muted">No shortcuts match "{query.trim()}".</p>}
            </div>
        </div>
    );
};

export default ShortcutSettings;
