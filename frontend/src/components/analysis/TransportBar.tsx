import { useEffect, useRef, useState, type RefObject } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface TransportBarProps {
    leftRef: RefObject<HTMLVideoElement | null>;
    rightRef: RefObject<HTMLVideoElement | null>;
    layoutKey: string;
    fps: number;
}

const RATES = [0.25, 0.5, 1, 1.5, 2];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const emit = (t: number) => window.dispatchEvent(new CustomEvent('sync-time', { detail: t }));

const TransportBar = ({ leftRef, rightRef, layoutKey, fps }: TransportBarProps) => {
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [rate, setRate] = useState(1);
    const timeRef = useRef(0);
    const rateRef = useRef(1);

    const videos = () => [leftRef.current, rightRef.current].filter(Boolean) as HTMLVideoElement[];

    const seek = (t: number) => {
        const clamped = Math.max(0, Math.min(duration || t, t));
        videos().forEach((v) => { v.currentTime = clamped; });
        timeRef.current = clamped;
        setTime(clamped);
        emit(clamped);
    };

    // Re-bind whenever a video panel is shown/hidden: the first visible video is the clock
    useEffect(() => {
        const [master, ...others] = videos();
        if (!master) return;
        others.forEach((v) => { v.playbackRate = rateRef.current; v.currentTime = timeRef.current; if (!master.paused) v.play().catch(() => {}); });
        master.playbackRate = rateRef.current;

        const onMeta = () => setDuration(master.duration || 0);
        const onPlay = () => setPlaying(true);
        const onPause = () => { setPlaying(false); timeRef.current = master.currentTime; setTime(master.currentTime); emit(master.currentTime); };
        master.addEventListener('loadedmetadata', onMeta);
        master.addEventListener('durationchange', onMeta);
        master.addEventListener('play', onPlay);
        master.addEventListener('pause', onPause);

        let raf = 0;
        const loop = () => {
            if (!master.paused) {
                timeRef.current = master.currentTime;
                setTime(master.currentTime);
                emit(master.currentTime);
                others.forEach((v) => { if (Math.abs(v.currentTime - master.currentTime) > 0.08) v.currentTime = master.currentTime; });
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            master.removeEventListener('loadedmetadata', onMeta);
            master.removeEventListener('durationchange', onMeta);
            master.removeEventListener('play', onPlay);
            master.removeEventListener('pause', onPause);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutKey]);

    useEffect(() => {
        const onSeek = (e: Event) => seek((e as CustomEvent).detail as number);
        window.addEventListener('seek-time', onSeek);
        return () => window.removeEventListener('seek-time', onSeek);
    });

    const togglePlay = () => {
        const vs = videos();
        if (!vs.length) return;
        if (vs[0].paused) {
            const from = vs[0].ended ? 0 : timeRef.current;
            vs.forEach((v) => { v.currentTime = from; v.play().catch(() => {}); });
        }
        else vs.forEach((v) => v.pause());
    };

    const step = (dir: number) => { videos().forEach((v) => v.pause()); seek(timeRef.current + dir / fps); };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('input:not([type=range]), textarea, select, [contenteditable], [role=menu]')) return;
            if (e.code === 'Space') { e.preventDefault(); if (t.tagName === 'BUTTON') t.blur(); togglePlay(); }
            else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) { videos().forEach((v) => v.pause()); seek(0); }
            else if (e.code === 'ArrowLeft') { e.preventDefault(); step(-1); }
            else if (e.code === 'ArrowRight') { e.preventDefault(); step(1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const changeRate = (r: number) => { setRate(r); rateRef.current = r; videos().forEach((v) => { v.playbackRate = r; }); };

    const btn = 'p-1.5 rounded-md text-text-muted hover:text-text hover:bg-border transition-colors';

    return (
        <div className="fixed bottom-0 left-64 right-0 z-30 px-6 py-3 bg-background-main/90 backdrop-blur border-t border-border">
            <div className="flex items-center gap-3">
                <button onClick={() => step(-1)} className={btn} title="Previous frame"><SkipBack className="w-4 h-4" /></button>
                <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-text text-background-main flex items-center justify-center hover:bg-white transition-colors" title={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <button onClick={() => step(1)} className={btn} title="Next frame"><SkipForward className="w-4 h-4" /></button>
                <span className="ml-2 text-xs tabular-nums text-text-secondary w-28">{fmt(time)} <span className="text-text-muted">/ {fmt(duration)}</span></span>
                <input
                    type="range" min={0} max={duration || 1} step={0.01} value={time}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="flex-1 h-1 accent-primary cursor-pointer"
                />
                <select value={rate} onChange={(e) => changeRate(Number(e.target.value))} className="bg-transparent border border-border rounded-md px-2 py-1 text-xs text-text-secondary hover:text-text cursor-pointer">
                    {RATES.map((r) => <option key={r} value={r} className="bg-background">{r}x</option>)}
                </select>
            </div>
        </div>
    );
};

export default TransportBar;
