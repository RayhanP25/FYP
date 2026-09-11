import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";

type Pt = [number, number, number] | null;
interface Frame3D { frame_index: number; keypoints_3d: Pt[]; angles_3d: Record<string, number>; }
interface Props { videoId?: string; apiBase?: string; analysis?: { fps?: number; frames_3d?: Frame3D[] }; }

const BONES_LEFT: [number, number][] = [[1, 2], [2, 4], [4, 6], [6, 8], [2, 10], [10, 12], [12, 14], [14, 16]];
const BONES_RIGHT: [number, number][] = [[1, 3], [3, 5], [5, 7], [7, 9], [3, 11], [11, 13], [13, 15], [15, 17]];
const BONES_CENTER: [number, number][] = [[0, 1], [10, 11]];

const COL_LEFT = "#22D3EE"; // Bright Cyan
const COL_RIGHT = "#F472B6"; // Hot Pink
const COL_CENTER = "#94A3B8"; // Slate
const COL_JOINT = "#FFFFFF";

export default function Skeleton3DViewer({ videoId, apiBase = "", analysis }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Frame3D[]>([]);
  const [fps, setFps] = useState(30);
  const [idx, setIdx] = useState(0);
  const [yaw, setYaw] = useState(0.5);
  const [pitch, setPitch] = useState(0.15);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (analysis?.frames_3d?.length) { setFrames(analysis.frames_3d); setFps(analysis.fps || 30); return; }
    if (videoId) {
      fetch(`${apiBase}/api/get-analysis/${videoId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setFrames(d.result?.frames_3d || []); setFps(d.result?.fps || 30); })
        .catch(() => {});
    }
  }, [videoId, apiBase, analysis]);

  const { center, radius } = useMemo(() => {
    const pts: number[][] = [];
    frames.forEach((f) => f.keypoints_3d?.forEach((p) => { if (p) pts.push(p); }));
    if (!pts.length) return { center: [0, 0, 0], radius: 1 };
    const c = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length);
    let r = 1;
    pts.forEach((p) => { const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); if (d > r) r = d; });
    return { center: c, radius: r };
  }, [frames]);

  useEffect(() => {
    const handleSync = (e: Event) => {
        const time = (e as CustomEvent).detail as number;
        if (frames.length > 0) {
            const targetIdx = Math.floor(time * fps);
            setIdx(Math.max(0, Math.min(frames.length - 1, targetIdx)));
        }
    };
    window.addEventListener('sync-time', handleSync);
    return () => window.removeEventListener('sync-time', handleSync);
  }, [fps, frames.length]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const f = frames[idx]; if (!f) return;

    const S = ((Math.min(W, H) * 0.42) / radius) * zoom;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (p: Pt) => {
      if (!p) return null;
      const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
      const xr = x * cyaw + z * syaw;
      const zr = -x * syaw + z * cyaw;
      const yr2 = y * cp - zr * sp;
      const zr2 = y * sp + zr * cp;
      return { sx: W / 2 + xr * S, sy: H / 2 + yr2 * S, depth: zr2 };
    };
    const P = f.keypoints_3d.map(project);

    // Glowing tech floor grid
    ctx.strokeStyle = "rgba(34, 211, 238, 0.1)"; 
    ctx.lineWidth = 1;
    for (let g = -2; g <= 2; g++) {
      const a = project([g * 300 + center[0], radius + center[1], -600 + center[2]]);
      const b = project([g * 300 + center[0], radius + center[1], 600 + center[2]]);
      const c = project([-600 + center[0], radius + center[1], g * 300 + center[2]]);
      const d = project([600 + center[0], radius + center[1], g * 300 + center[2]]);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
      if (c && d) { ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke(); }
    }

    const drawBones = (bones: [number, number][], col: string) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round";
      bones.forEach(([i, j]) => {
        const a = P[i], b = P[j];
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
      });
    };
    drawBones(BONES_CENTER, COL_CENTER);
    drawBones(BONES_LEFT, COL_LEFT);
    drawBones(BONES_RIGHT, COL_RIGHT);

    P.forEach((p) => {
      if (!p) return;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = COL_JOINT; ctx.fill();
    });
  }, [frames, idx, yaw, pitch, zoom, center, radius]);

  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setYaw((y) => y + (e.clientX - drag.current!.x) * 0.01);
    setPitch((p) => Math.max(-1.4, Math.min(1.4, p + (e.clientY - drag.current!.y) * 0.01)));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { drag.current = null; };
  const onWheel = useCallback((e: React.WheelEvent) => setZoom((z) => Math.max(0.3, Math.min(4, z - e.deltaY * 0.001))), []);

  const curAngles = frames[idx]?.angles_3d || {};

  return (
    <div className="w-full h-full relative bg-[#060B14] font-sans overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
        width={800} height={600}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
      />
      
      {/* High-tech floating HUD with native CSS custom scrollbars */}
      <div className="absolute top-4 right-4 w-52 bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3D Biometrics</span>
          <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2.5 py-0.5 rounded-full font-mono border border-cyan-500/20">FR {idx}</span>
        </div>
        
        <div className="h-56 overflow-y-auto pr-2 space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
          {Object.entries(curAngles).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs items-center">
              <span className="text-slate-300 capitalize text-[11px] font-medium tracking-wide">{k.replace(/_/g, " ")}</span>
              <span className="text-slate-50 font-mono font-semibold">{Math.round(v)}°</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex items-center gap-6 text-[10px] text-slate-400 font-mono bg-slate-900/60 backdrop-blur-md px-5 py-2 rounded-full border border-slate-800 shadow-lg pointer-events-auto">
            <span className="tracking-widest">DRAG TO ROTATE • SCROLL TO ZOOM</span>
            <div className="w-[1px] h-3 bg-slate-700"></div>
            <button onClick={() => { setYaw(0.5); setPitch(0.15); setZoom(1); }} className="text-cyan-400 hover:text-cyan-300 font-bold tracking-widest transition-colors">RESET</button>
        </div>
      </div>
    </div>
  );
}