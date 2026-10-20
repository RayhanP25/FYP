import { Fragment, useRef, type PointerEvent, type ReactNode } from 'react';
import type { PanelId } from './useStudioLayout';

interface RowItem { id: PanelId; weight: number; node: ReactNode; }

interface ResizableRowProps {
    items: RowItem[];
    height: number;
    onHeight: (h: number) => void;
    onWeights: (w: Partial<Record<PanelId, number>>) => void;
}

const GUTTER = 12;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1400;

const ResizableRow = ({ items, height, onHeight, onWeights }: ResizableRowProps) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ i: number; x: number; a: number; b: number } | null>(null);
    const hDrag = useRef<{ y: number; h: number } | null>(null);

    const startSplit = (e: PointerEvent<HTMLDivElement>, i: number) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { i, x: e.clientX, a: items[i].weight, b: items[i + 1].weight };
    };

    const moveSplit = (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        const row = rowRef.current;
        if (!d || !row) return;
        const total = items.reduce((s, it) => s + it.weight, 0);
        const usable = row.clientWidth - GUTTER * (items.length - 1);
        const min = total * 0.12;
        const pair = d.a + d.b;
        const a = Math.max(min, Math.min(pair - min, d.a + ((e.clientX - d.x) * total) / usable));
        onWeights({ [items[d.i].id]: a, [items[d.i + 1].id]: pair - a });
    };

    const startHeight = (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        hDrag.current = { y: e.clientY, h: height };
    };

    const moveHeight = (e: PointerEvent<HTMLDivElement>) => {
        if (hDrag.current) onHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, hDrag.current.h + e.clientY - hDrag.current.y)));
    };

    const endDrag = () => { drag.current = null; hDrag.current = null; };

    return (
        <div>
            <div ref={rowRef} className="flex" style={{ height }}>
                {items.map((it, i) => (
                    <Fragment key={it.id}>
                        {i > 0 && (
                            <div
                                onPointerDown={(e) => startSplit(e, i - 1)} onPointerMove={moveSplit} onPointerUp={endDrag} onPointerCancel={endDrag}
                                className="group/split flex-none flex justify-center cursor-col-resize touch-none select-none"
                                style={{ width: GUTTER }}
                                title="Drag to resize"
                            >
                                <div className="w-0.5 h-full rounded-full bg-transparent group-hover/split:bg-primary/70 group-active/split:bg-primary transition-colors" />
                            </div>
                        )}
                        <div className="min-w-0 h-full" style={{ flex: `${it.weight} 1 0%` }}>{it.node}</div>
                    </Fragment>
                ))}
            </div>
            <div
                onPointerDown={startHeight} onPointerMove={moveHeight} onPointerUp={endDrag} onPointerCancel={endDrag}
                className="group/row flex items-center cursor-row-resize touch-none select-none"
                style={{ height: GUTTER }}
                title="Drag to resize"
            >
                <div className="h-0.5 w-full rounded-full bg-transparent group-hover/row:bg-primary/70 group-active/row:bg-primary transition-colors" />
            </div>
        </div>
    );
};

export default ResizableRow;
