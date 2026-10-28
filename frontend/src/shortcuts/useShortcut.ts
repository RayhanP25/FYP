import { useEffect, useRef } from 'react';
import { SHORTCUT_IDS, type ShortcutId } from './registry';
import { bindingOf, useShortcutSettings } from './store';
import { comboOf, isTypingTarget, RESERVED } from './keys';

type Handler = (e: KeyboardEvent) => void;

const handlers = new Map<ShortcutId, Handler>();
const SEQUENCE_TIMEOUT_MS = 1000;
let sequence: string[] = [];
let sequenceTimer: number | undefined;

const resetSequence = () => {
    sequence = [];
    window.clearTimeout(sequenceTimer);
};

const dialogOpen = () => !!document.querySelector('[role="dialog"][data-state="open"]');

const dispatch = (e: KeyboardEvent) => {
    const combo = comboOf(e);
    if (!combo || !useShortcutSettings.getState().enabled || e.defaultPrevented || dialogOpen()) return;
    if (isTypingTarget(e.target) && !/ctrl\+|alt\+/.test(combo) && combo !== 'escape') return;

    const run = (binding: string) => {
        if (RESERVED.has(binding)) return false;
        for (const [id, handler] of handlers) {
            if (bindingOf(id) !== binding) continue;
            handler(e);
            e.preventDefault();
            if (binding === 'space' && e.target instanceof HTMLButtonElement) e.target.blur();
            return true;
        }
        return false;
    };

    const next = [...sequence, combo].join(' ');
    if (run(next)) return resetSequence();

    const startsSequence = SHORTCUT_IDS.some((id) => handlers.has(id) && bindingOf(id)?.startsWith(`${next} `));
    if (startsSequence) {
        sequence = [...sequence, combo];
        window.clearTimeout(sequenceTimer);
        sequenceTimer = window.setTimeout(resetSequence, SEQUENCE_TIMEOUT_MS);
        return;
    }

    resetSequence();
    if (next !== combo) run(combo);
};

export const ShortcutListener = () => {
    useEffect(() => {
        window.addEventListener('keydown', dispatch);
        return () => window.removeEventListener('keydown', dispatch);
    }, []);
    return null;
};

export const useShortcut = (id: ShortcutId, handler: Handler, active = true) => {
    const latest = useRef(handler);
    useEffect(() => { latest.current = handler; });

    useEffect(() => {
        if (!active) return;
        const fn: Handler = (e) => latest.current(e);
        handlers.set(id, fn);
        return () => {
            if (handlers.get(id) === fn) handlers.delete(id);
        };
    }, [id, active]);
};
