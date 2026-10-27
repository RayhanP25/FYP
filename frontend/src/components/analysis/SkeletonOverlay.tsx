import { useEffect, useMemo, useRef, type RefObject } from 'react';

/** One frame's 2D keypoints: [x, y, confidence] per joint, x / y from 0 to 1 (or null when missing). */
export type Keypoints2D = (number[] | null)[] | null;

interface SkeletonOverlayProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    frames: Keypoints2D[];
    fps: number;
    minConf: number;
    sureConf: number;
    /** Steady the sure / unsure state over a few frames (processed view); raw shows each frame as detected. */
    stabilize: boolean;
}

// Same skeleton and drawing rules as the overlay videos (backend/pose_estimator.py).
const CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [1, 3], [2, 4], [4, 6], [6, 8], [3, 5], [5, 7], [7, 9],
    [2, 10], [3, 11], [10, 11], [10, 12], [12, 14], [14, 16], [11, 13], [13, 15], [15, 17],
];
const LINE = '#00ff00';
const POINT = '#ff0000';
const UNSURE = '#ffd700';
const NONE = 0;
const UNSURE_LEVEL = 1;
const SURE_LEVEL = 2;

/** Per frame and joint: 0 hidden, 1 unsure, 2 sure. Mirrors _overlay_confidences when `stabilize` is set:
 *  5-frame median of the confidence, then hysteresis (+/- 0.05) so joints don't flicker at the threshold. */
const displayLevels = (frames: Keypoints2D[], minConf: number, sureConf: number, stabilize: boolean): Uint8Array[] => {
    const conf = frames.map((kp) => Array.from({ length: 18 }, (_, j) => kp?.[j]?.[2] ?? 0));
    if (!stabilize) {
        return conf.map((row) => Uint8Array.from(row, (c) => (c >= sureConf ? SURE_LEVEL : c >= minConf ? UNSURE_LEVEL : NONE)));
    }
    const n = conf.length;
    const visible = new Array(18).fill(false);
    const sure = new Array(18).fill(false);
    return conf.map((row, i) => {
        const out = new Uint8Array(18);
        for (let j = 0; j < 18; j++) {
            const win = [-2, -1, 0, 1, 2].map((d) => conf[Math.min(n - 1, Math.max(0, i + d))][j]).sort((a, b) => a - b);
            const m = win[2];
            visible[j] = visible[j] ? m >= minConf - 0.05 : m >= minConf + 0.05;
            sure[j] = visible[j] && (sure[j] ? m >= sureConf - 0.05 : m >= sureConf + 0.05);
            out[j] = row[j] > 0 ? (sure[j] ? SURE_LEVEL : visible[j] ? UNSURE_LEVEL : NONE) : NONE;
        }
        return out;
    });
};

const SkeletonOverlay = ({ videoRef, frames, fps, minConf, sureConf, stabilize }: SkeletonOverlayProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const levels = useMemo(() => displayLevels(frames, minConf, sureConf, stabilize), [frames, minConf, sureConf, stabilize]);

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        let lastKey = '';
        const draw = (mediaTime: number, force = false) => {
            const box = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const idx = Math.min(frames.length - 1, Math.max(0, Math.round(mediaTime * fps)));
            const key = `${idx}|${box.width}x${box.height}`;
            if (!force && key === lastKey) return;
            lastKey = key;
            if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
                canvas.width = Math.round(box.width * dpr);
                canvas.height = Math.round(box.height * dpr);
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, box.width, box.height);
            const kp = frames[idx];
            if (!kp || !video.videoWidth) return;

            // The picture inside the element (object-contain leaves bars on two sides).
            const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
            const w = video.videoWidth * scale;
            const h = video.videoHeight * scale;
            const ox = (box.width - w) / 2;
            const oy = (box.height - h) / 2;
            const px = (j: number): [number, number] => [ox + kp[j]![0] * w, oy + kp[j]![1] * h];
            const s = Math.max(0.6, scale);              // keep the videos' line widths at their size
            const lv = levels[idx];

            for (const [a, b] of CONNECTIONS) {
                if (!kp[a] || !kp[b] || !lv[a] || !lv[b]) continue;
                const isSure = lv[a] === SURE_LEVEL && lv[b] === SURE_LEVEL;
                ctx.strokeStyle = isSure ? LINE : UNSURE;
                ctx.lineWidth = (isSure ? 2 : 1) * s;
                ctx.beginPath();
                ctx.moveTo(...px(a));
                ctx.lineTo(...px(b));
                ctx.stroke();
            }
            kp.forEach((p, j) => {
                if (!p || !lv[j]) return;
                ctx.beginPath();
                ctx.arc(...px(j), 4 * s, 0, Math.PI * 2);
                if (lv[j] === SURE_LEVEL) {
                    ctx.fillStyle = POINT;
                    ctx.fill();
                } else {
                    ctx.strokeStyle = UNSURE;               // hollow = uncertain
                    ctx.lineWidth = 1 * s;
                    ctx.stroke();
                }
            });
        };

        // Follow the frame actually on screen (requestVideoFrameCallback), else poll every animation frame.
        let handle = 0;
        let raf = 0;
        type FrameVideo = HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
            cancelVideoFrameCallback?: (h: number) => void;
        };
        const v = video as FrameVideo;
        if (v.requestVideoFrameCallback) {
            const onFrame = (_: number, meta: { mediaTime: number }) => {
                draw(meta.mediaTime);
                handle = v.requestVideoFrameCallback!(onFrame);
            };
            handle = v.requestVideoFrameCallback(onFrame);
        }
        const poll = () => {
            if (!v.requestVideoFrameCallback || video.paused) draw(video.currentTime);
            raf = requestAnimationFrame(poll);
        };
        raf = requestAnimationFrame(poll);
        const redraw = () => draw(video.currentTime, true);
        const resize = new ResizeObserver(redraw);
        resize.observe(canvas);
        video.addEventListener('seeked', redraw);
        video.addEventListener('loadeddata', redraw);
        redraw();

        return () => {
            if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
            cancelAnimationFrame(raf);
            resize.disconnect();
            video.removeEventListener('seeked', redraw);
            video.removeEventListener('loadeddata', redraw);
        };
    }, [videoRef, frames, fps, levels]);

    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};

export default SkeletonOverlay;
