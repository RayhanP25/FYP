import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SHORTCUTS, type ShortcutId } from './registry';

interface ShortcutSettings {
    enabled: boolean;
    custom: Partial<Record<ShortcutId, string | null>>;
    setEnabled: (enabled: boolean) => void;
    setBinding: (id: ShortcutId, binding: string | null) => void;
    resetBinding: (id: ShortcutId) => void;
    resetAll: () => void;
}

export const useShortcutSettings = create<ShortcutSettings>()(
    persist(
        (set) => ({
            enabled: true,
            custom: {},
            setEnabled: (enabled) => set({ enabled }),
            setBinding: (id, binding) => set((s) => ({ custom: { ...s.custom, [id]: binding } })),
            resetBinding: (id) => set((s) => {
                const custom = { ...s.custom };
                delete custom[id];
                return { custom };
            }),
            resetAll: () => set({ enabled: true, custom: {} }),
        }),
        { name: 'sportpose.shortcuts' },
    ),
);

export const bindingOf = (id: ShortcutId): string | null => {
    const { custom } = useShortcutSettings.getState();
    if (id in custom) return custom[id] ?? null;
    return SHORTCUTS.find((s) => s.id === id)!.binding;
};
