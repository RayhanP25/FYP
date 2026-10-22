import { useState, useEffect, useCallback } from 'react';

export type PanelId = 'left' | 'right' | 'skeleton' | 'angles' | 'position' | 'velocity' | 'distance';
export type RowId = 'stage' | 'graphs' | 'measure' | 'recon';

export const ROWS: { id: RowId; panels: PanelId[] }[] = [
    { id: 'stage', panels: ['left', 'right'] },
    { id: 'graphs', panels: ['angles', 'position', 'velocity'] },
    { id: 'measure', panels: ['distance'] },
    { id: 'recon', panels: ['skeleton'] },
];

interface StudioLayout {
    visible: Record<PanelId, boolean>;
    weights: Record<PanelId, number>;
    heights: Record<RowId, number>;
}

const STORAGE_KEY = 'analysisStudioLayout.v3';

const DEFAULT_LAYOUT: StudioLayout = {
    visible: { left: true, right: true, skeleton: true, angles: true, position: true, velocity: true, distance: true },
    weights: { left: 1, right: 1, skeleton: 1, angles: 1, position: 1, velocity: 1, distance: 1 },
    heights: { stage: 360, graphs: 400, measure: 420, recon: 520 },
};

const load = (): StudioLayout => {
    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return {
            visible: { ...DEFAULT_LAYOUT.visible, ...s?.visible },
            weights: { ...DEFAULT_LAYOUT.weights, ...s?.weights },
            heights: { ...DEFAULT_LAYOUT.heights, ...s?.heights },
        };
    } catch {
        return DEFAULT_LAYOUT;
    }
};

export const useStudioLayout = () => {
    const [layout, setLayout] = useState<StudioLayout>(load);

    useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); }, [layout]);

    const toggleVisible = useCallback((id: PanelId) =>
        setLayout((l) => ({ ...l, visible: { ...l.visible, [id]: !l.visible[id] } })), []);

    const setWeights = useCallback((w: Partial<Record<PanelId, number>>) =>
        setLayout((l) => ({ ...l, weights: { ...l.weights, ...w } })), []);

    const setHeight = useCallback((row: RowId, h: number) =>
        setLayout((l) => ({ ...l, heights: { ...l.heights, [row]: h } })), []);

    const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

    const resetSizes = useCallback(() =>
        setLayout((l) => ({ ...l, weights: DEFAULT_LAYOUT.weights, heights: DEFAULT_LAYOUT.heights })), []);

    return { layout, toggleVisible, setWeights, setHeight, reset, resetSizes };
};
