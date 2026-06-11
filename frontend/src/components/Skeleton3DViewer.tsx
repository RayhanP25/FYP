import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";

type Pt = [number, number, number] | null;
interface Frame3D { frame_index: number; keypoints_3d: Pt[]; angles_3d: Record<string, number>; }

// NEW: currentTime prop added here
interface Props { videoId?: string; apiBase?: string; analysis?: { fps?: number; frames_3d?: Frame3D[] }; currentTime?: number; }

const BONES_LEFT: [number, number][] = [[1, 2], [2, 4], [4, 6], [6, 8], [2, 10], [10, 12], [12, 14], [14, 16]];
const BONES_RIGHT: [number, number][] = [[1, 3], [3, 5], [5, 7], [7, 9], [3, 11], [11, 13], [13, 15], [15, 17]];
const BONES_CENTER: [number, number][] = [[0, 1], [10, 11]];

const COL_LEFT = "#4F9CFF";
const COL_RIGHT = "#FF7A3D";
const COL_CENTER = "#8892A6";
const COL_JOINT = "#EAEEF7";

function generateSample(): { fps: number; frames_3d: Frame3D[] } {
  // ... (keeping sample generator short for brevity, leave yours intact if you prefer)
  return { fps: 30, frames_3d: [] };
}

export default function Skeleton3DViewer({ videoId, apiBase = "", analysis, currentTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Frame3D[]>([]);
  const [fps, setFps] = useState(30);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [yaw, setYaw] = useState(0.5);
  const [pitch, setPitch] = useState(0.15);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (analysis?.frames_3d?.length) {
      setFrames(analysis.frames_3d); setFps(analysis.fps || 30); return;
    }
    if (videoId) {
      fetch(`${apiBase}/api/get-analysis/${videoId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setFrames(d.result?.frames_3d || []); setFps(d.result?.fps || 30); })
        .catch(() => {});
      return;
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

  // NEW: Sync with Master Video Time
  useEffect(() => {
    if (currentTime !== undefined && frames.length > 0) {
        setPlaying(false); // Stop internal loop when bound to a video
        const targetIdx = Math.floor(currentTime * fps);
        setIdx(Math.max(0, Math.min(frames.length - 1, targetIdx)));
    }
  }, [currentTime, fps, frames.length]);

  useEffect(() => {
    if (!playing || frames.length === 0 || currentTime !== undefined) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length, currentTime]);

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

    ctx.strokeStyle = "rgba(136,146,166,0.12)";
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
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
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
    // Updated container rules to allow it to fit nicely inside the grid parent
    <div className="flex w-full h-full text-white font-sans">
      <div className="flex-1 bg-[#121826] flex flex-col p-3 border-r border-[#222B3D]">
        <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden border border-[#222B3D] bg-[#0A0E17]">
            <canvas
            ref={canvasRef}
            // By making it 100% width/height and scaling via CSS, it fills the grid cell dynamically
            style={{ width: "100%", height: "100%", objectFit: "contain", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
            width={600} height={400} 
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
            />
        </div>
        <div className="text-xs text-[#5C6680] mt-3 flex justify-between items-center px-1">
          <span>Drag to rotate • Scroll to zoom</span>
          <button onClick={() => { setYaw(0.5); setPitch(0.15); setZoom(1); }} className="text-[#4F9CFF] hover:text-white transition-colors">Reset View</button>
        </div>
      </div>

      <div className="w-[200px] bg-[#121826] p-4 overflow-y-auto no-scrollbar">
        <div className="font-bold mb-1">3D joint angles</div>
        <div className="text-xs text-[#9AA4BC] mb-4">frame {idx}</div>
        {Object.entries(curAngles).map(([k, v]) => (
          <div key={k} className="flex justify-between py-1 text-sm border-b border-[#222B3D]/50 last:border-0">
            <span className="text-[#9AA4BC]">{k.replace(/_/g, " ")}</span>
            <span className="font-semibold tabular-nums">{Math.round(v)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}