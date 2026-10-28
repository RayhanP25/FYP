const NAMES: Record<string, string> = {
    ' ': 'space', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Escape: 'escape', Enter: 'enter', Tab: 'tab', Backspace: 'backspace', Delete: 'delete',
    PageUp: 'pageup', PageDown: 'pagedown', Home: 'home', End: 'end',
};

const LABELS: Record<string, string> = {
    space: 'Space', up: '↑', down: '↓', left: '←', right: '→', escape: 'Esc', enter: 'Enter', tab: 'Tab',
    backspace: 'Backspace', delete: 'Delete', pageup: 'Page Up', pagedown: 'Page Down', home: 'Home', end: 'End',
    ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift',
};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export const RESERVED = new Set([
    'ctrl+r', 'ctrl+t', 'ctrl+w', 'ctrl+n', 'ctrl+p', 'ctrl+l', 'ctrl+s', 'ctrl+shift+r', 'ctrl+shift+i',
    'ctrl+shift+t', 'ctrl+shift+n', 'f5', 'f12', 'alt+f4', 'alt+d', 'alt+e', 'alt+f', 'alt+left', 'alt+right',
    'alt+home',
]);

export const comboOf = (e: KeyboardEvent): string | null => {
    if (MODIFIER_KEYS.has(e.key)) return null;
    const key = NAMES[e.key] ?? e.key.toLowerCase();
    const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
    const mods = [
        e.ctrlKey || e.metaKey ? 'ctrl' : null,
        e.altKey ? 'alt' : null,
        e.shiftKey && !symbol ? 'shift' : null,
    ].filter(Boolean);
    return [...mods, key].join('+');
};

export const formatBinding = (binding: string) =>
    binding.split(' ').map((step) => step.split('+').map((k) => LABELS[k] ?? k.toUpperCase()).join(' + ')).join(' then ');

export const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
