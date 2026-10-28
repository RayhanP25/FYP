import { useEffect, useState } from 'react';
import { useShortcut } from './useShortcut';

export const useListNav = (count: number, resetKey: string, onOpen: (index: number) => void) => {
    const [index, setIndex] = useState(-1);
    useEffect(() => setIndex(-1), [count, resetKey]);

    const active = index < count ? index : -1;

    useShortcut('list.next', () => setIndex((i) => Math.min(i + 1, count - 1)), count > 0);
    useShortcut('list.prev', () => setIndex((i) => Math.max(i - 1, 0)), count > 0);
    useShortcut('list.open', () => { if (active >= 0) onOpen(active); }, active >= 0);

    useEffect(() => {
        if (active >= 0) document.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    return active;
};
