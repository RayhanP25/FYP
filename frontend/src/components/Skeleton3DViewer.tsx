import React, { useState, useRef, useEffect, useMemo } from "react";
import { JOINT_NAMES, LIMB_BONES } from "@/utils/skeleton";

type Pt = [number, number, number] | null;
/** edited: joint -> "edit" (corrected here) | "blend" (eased toward a nearby correction) | "pending" (unsaved). */
interface Frame3D { frame_index: number; keypoints_3d: Pt[]; angles_3d: Record<string, number>; edited?: Record<string, string>; }
interface Props {
  videoId?: string;
  apiBase?: string;
  analysis?: { fps?: number; frames_3d?: Frame3D[] };
  // framing: frames to centre and zoom the view on (default: the ones shown). Lets raw and processed data
  // share one framing, so switching between them doesn't move the camera.
  framing?: Frame3D[];
  /** Edit mode: click a joint to select it and drag it (parallel to the screen); empty space still rotates. */
  editing?: boolean;
  onEditJoint?: (frame: number, joint: number, value: [number, number, number]) => void;
  onSelectJoint?: (frame: number, joint: number | null) => void;
  selectedJoint?: number | null;
  /** Usual bone lengths (mm) by "parent-child" joint key, shown while editing. */
  boneLengths?: Record<string, number>;
  /** Keep the dragged joint's bone to its parent at its usual length. */
  lockBones?: boolean;
}

const PARENT: Record<number, number> = Object.fromEntries(LIMB_BONES.map(([a, b]) => [b, a]));
const HIT_PX = 14;

/** Floor height: where the body's lowest point is most often (a 30 mm histogram's busiest bin, refined by
 *  the median of the frames near it). The single lowest point would let one wrong joint - a hidden foot
 *  triangulated half a metre too low - drop the floor away from the body. Jumps don't move it: the feet
 *  are on the ground in most frames. */
const floorLevel = (lows: number[], bin = 30): number => {
  if (!lows.length) return 1;
  const lo = Math.min(...lows);
  const counts = new Map<number, number>();
  lows.forEach((y) => { const k = Math.floor((y - lo) / bin); counts.set(k, (counts.get(k) ?? 0) + 1); });
  let best = 0;
  let bestCount = -1;
  counts.forEach((n, k) => { if (n > bestCount) { best = k; bestCount = n; } });
  const mid = lo + (best + 0.5) * bin;
  const near = lows.filter((y) => Math.abs(y - mid) <= bin).sort((a, b) => a - b);
  return near.length ? near[Math.floor(near.length / 2)] : mid;
};

const BONES_LEFT: [number, number][] = [[1, 2], [2, 4], [4, 6], [6, 8], [2, 10], [10, 12], [12, 14], [14, 16]];
const BONES_RIGHT: [number, number][] = [[1, 3], [3, 5], [5, 7], [7, 9], [3, 11], [11, 13], [13, 15], [15, 17]];
const BONES_CENTER: [number, number][] = [[0, 1], [10, 11]];

export default function Skeleton3DViewer({
  videoId, apiBase = "", analysis, framing, editing = false, onEditJoint, onSelectJoint, selectedJoint = null,
  boneLengths, lockBones = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Frame3D[]>([]);
  const [fps, setFps] = useState(30);
  const [idx, setIdx] = useState(0);
  const [yaw, setYaw] = useState(0.5);
  const [pitch, setPitch] = useState(0.15);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Joint being dragged in edit mode: where the pointer and the joint started.
  const jointDrag = useRef<{ joint: number; x: number; y: number; start: [number, number, number] } | null>(null);
  // Screen projection of the last drawn frame, for picking and dragging joints.
  const view = useRef<{ S: number; cyaw: number; syaw: number; cp: number; sp: number; P: ({ sx: number; sy: number } | null)[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Keep the canvas backing store matched to its displayed size, otherwise the
  // fixed 800x600 buffer gets stretched to fit and the skeleton looks squashed.
  useEffect(() => {
    const cv = canvasRef.current;
    const host = cv?.parentElement;
    if (!cv || !host) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (analysis?.frames_3d?.length) { setFrames(analysis.frames_3d); setFps(analysis.fps || 30); return; }
    if (videoId) {
      fetch(`${apiBase}/api/get-analysis/${videoId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setFrames(d.result?.frames_3d || []); setFps(d.result?.fps || 30); })
        .catch(() => {});
    }
  }, [videoId, apiBase, analysis]);

  const COL = useMemo(() => {
    const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return {
      left: v('--color-primary'),
      right: '#EE6983',
      center: v('--color-text-muted'),
      joint: v('--color-text'),
    };
  }, []);

  const { center, radius, floorY } = useMemo(() => {
    const source = framing?.length ? framing : frames;
    const pts: number[][] = [];
    const lows: number[] = [];               // each frame's lowest point ("up" is -Y, so its largest Y)
    source.forEach((f) => {
      let low = -Infinity;
      f.keypoints_3d?.forEach((p) => { if (p) { pts.push(p); if (p[1] > low) low = p[1]; } });
      if (low > -Infinity) lows.push(low);
    });
    if (!pts.length) return { center: [0, 0, 0], radius: 1, floorY: 1 };
    const c = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length);
    let r = 1;
    pts.forEach((p) => {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      if (d > r) r = d;
    });
    return { center: c, radius: r, floorY: floorLevel(lows) };
  }, [frames, framing]);

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
    const W = size.w, H = size.h;
    if (!W || !H) return;

    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== W * dpr || cv.height !== H * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const f = frames[idx]; if (!f?.keypoints_3d) return;

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
    view.current = { S, cyaw, syaw, cp, sp, P };

    // Floor grid, sized from the scene instead of fixed millimetres so it fills
    // the view at any capture scale. Lines fade out toward the edges.
    const DIV = 8;
    const step = radius / 2;
    const extent = step * DIV;
    ctx.strokeStyle = COL.center;
    ctx.lineWidth = 1;
    for (let g = -DIV; g <= DIV; g++) {
      const t = Math.abs(g) / DIV;
      ctx.globalAlpha = 0.22 * (1 - t * 0.8);
      const off = g * step;
      const a = project([off + center[0], floorY, -extent + center[2]]);
      const b = project([off + center[0], floorY, extent + center[2]]);
      const c = project([-extent + center[0], floorY, off + center[2]]);
      const d = project([extent + center[0], floorY, off + center[2]]);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
      if (c && d) { ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;

    // Back and side walls, same spacing as the floor, so rotation has a
    // fixed frame of reference to read against.
    const WALL_DIV = 4;
    const wallH = step * WALL_DIV;
    const line = (p1: Pt, p2: Pt) => {
      const a = project(p1), b = project(p2);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    };
    ctx.lineWidth = 1;
    for (let g = -DIV; g <= DIV; g++) {
      const off = g * step;
      ctx.globalAlpha = 0.1;
      // back wall (far -Z): verticals
      line([off + center[0], floorY, -extent + center[2]],
           [off + center[0], floorY - wallH, -extent + center[2]]);
      // side wall (far -X): verticals
      line([-extent + center[0], floorY, off + center[2]],
           [-extent + center[0], floorY - wallH, off + center[2]]);
    }
    for (let k = 1; k <= WALL_DIV; k++) {
      const y = floorY - k * step;
      ctx.globalAlpha = 0.1 * (1 - (k / WALL_DIV) * 0.6);
      // back wall horizontals
      line([-extent + center[0], y, -extent + center[2]],
           [extent + center[0], y, -extent + center[2]]);
      // side wall horizontals
      line([-extent + center[0], y, -extent + center[2]],
           [-extent + center[0], y, extent + center[2]]);
    }
    ctx.globalAlpha = 1;

    const drawBones = (bones: [number, number][], col: string) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round";
      bones.forEach(([i, j]) => {
        const a = P[i], b = P[j];
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
      });
    };
    drawBones(BONES_CENTER, COL.center);
    drawBones(BONES_LEFT, COL.left);
    drawBones(BONES_RIGHT, COL.right);

    P.forEach((p) => {
      if (!p) return;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = COL.joint; ctx.fill();
    });

    // Corrected joints: solid ring = edited here, faint = eased toward a nearby edit, accent = unsaved.
    Object.entries(f.edited ?? {}).forEach(([j, kind]) => {
      const p = P[Number(j)];
      if (!p) return;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2);
      ctx.lineWidth = kind === "blend" ? 1 : 2;
      ctx.globalAlpha = kind === "blend" ? 0.45 : 1;
      ctx.strokeStyle = kind === "pending" ? COL.left : COL.joint;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (editing && selectedJoint != null && P[selectedJoint]) {
      const p = P[selectedJoint]!;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 10, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = COL.left; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
  }, [frames, idx, yaw, pitch, zoom, center, radius, floorY, COL, size, editing, selectedJoint]);

  /** Joint under a pointer position (canvas pixels), or null. */
  const pick = (x: number, y: number): number | null => {
    const P = view.current?.P ?? [];
    let best: number | null = null;
    let bestD = HIT_PX;
    P.forEach((p, j) => {
      if (!p) return;
      const d = Math.hypot(p.sx - x, p.sy - y);
      if (d < bestD) { best = j; bestD = d; }
    });
    return best;
  };

  /** A drag on screen (px) as a 3D offset parallel to the screen: the inverse of the view rotation. */
  const screenToWorld = (dx: number, dy: number): [number, number, number] => {
    const v = view.current!;
    const xr = dx / v.S, yr2 = dy / v.S, zr2 = 0;
    const y = yr2 * v.cp + zr2 * v.sp;
    const zr = -yr2 * v.sp + zr2 * v.cp;
    return [xr * v.cyaw - zr * v.syaw, y, xr * v.syaw + zr * v.cyaw];
  };

  const onDown = (e: React.MouseEvent) => {
    if (editing) {
      const box = canvasRef.current!.getBoundingClientRect();
      const j = pick(e.clientX - box.left, e.clientY - box.top);
      const p = j != null ? frames[idx]?.keypoints_3d?.[j] : null;
      onSelectJoint?.(idx, j);
      if (j != null && p) {
        jointDrag.current = { joint: j, x: e.clientX, y: e.clientY, start: [p[0], p[1], p[2]] };
        setDragging(true);
        return;
      }
    }
    drag.current = { x: e.clientX, y: e.clientY }; setDragging(true);
  };
  const onMove = (e: React.MouseEvent) => {
    const jd = jointDrag.current;
    if (jd && view.current) {
      const d = screenToWorld(e.clientX - jd.x, e.clientY - jd.y);
      let next: [number, number, number] = [jd.start[0] + d[0], jd.start[1] + d[1], jd.start[2] + d[2]];
      const parent = PARENT[jd.joint];
      const pp = parent != null ? frames[idx]?.keypoints_3d?.[parent] : null;
      const L = parent != null ? boneLengths?.[`${parent}-${jd.joint}`] : undefined;
      if (lockBones && pp && L) {                       // slide on a sphere around the parent joint
        const v = [next[0] - pp[0], next[1] - pp[1], next[2] - pp[2]];
        const n = Math.hypot(v[0], v[1], v[2]) || 1;
        next = [pp[0] + (v[0] * L) / n, pp[1] + (v[1] * L) / n, pp[2] + (v[2] * L) / n];
      }
      onEditJoint?.(idx, jd.joint, next);
      return;
    }
    const start = drag.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setYaw((y) => y + dx * 0.01);
    setPitch((p) => Math.max(-1.4, Math.min(1.4, p + dy * 0.01)));
  };
  const onUp = () => { drag.current = null; jointDrag.current = null; setDragging(false); };

  // Lengths of the bones at the selected joint, against this person's usual length.
  const boneReadout = useMemo(() => {
    if (!editing || selectedJoint == null) return [];
    const kp = frames[idx]?.keypoints_3d;
    return LIMB_BONES.filter(([a, b]) => a === selectedJoint || b === selectedJoint).map(([a, b, name]) => {
      const pa = kp?.[a], pb = kp?.[b];
      const now = pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) : null;
      return { name: name.replace(/^(left|right)_/, "").replace("_", " "), now, usual: boneLengths?.[`${a}-${b}`] ?? null };
    });
  }, [editing, selectedJoint, frames, idx, boneLengths]);
  // Wheel = zoom. A native, non-passive listener: React's onWheel is passive, so it can't stop the page
  // from scrolling at the same time. Only while the pointer is over the view; the page scrolls elsewhere.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.3, Math.min(4, z - e.deltaY * 0.001)));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="w-full h-full relative bg-background-main font-sans overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: dragging ? "grabbing" : "grab", touchAction: "none", overscrollBehavior: "contain" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      />
      
      <div className="absolute top-4 right-4 flex items-center gap-3 px-3 py-1.5 bg-background/90 backdrop-blur-sm border border-border rounded-full text-[10px] text-text-muted shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COL.left }} />Left
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COL.right }} />Right
        </span>
        <span className="w-[1px] h-3 bg-border" />
        <span>FR {idx}</span>
      </div>

      {editing && (
        <div className="absolute top-4 left-4 max-w-[60%] px-3 py-2 bg-background/90 backdrop-blur-sm border border-border rounded-lg text-xs shadow-sm">
          {selectedJoint == null ? (
            <span className="text-text-muted">Click a joint to select it</span>
          ) : (
            <>
              <p className="font-medium text-text">{JOINT_NAMES[selectedJoint]}</p>
              {boneReadout.map((b) => (
                <p key={b.name} className="text-text-muted tabular-nums">
                  {b.name} {b.now != null ? `${(b.now / 10).toFixed(1)} cm` : "-"}
                  {b.usual != null && <> (usual {(b.usual / 10).toFixed(1)})</>}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex items-center gap-4 text-[10px] text-text-muted bg-background/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border shadow-sm pointer-events-auto">
            <span>{editing ? "Drag a joint to move it • ←/→ change frame • Drag empty space to rotate" : "Drag to rotate • Scroll to zoom"}</span>
            <div className="w-[1px] h-3 bg-border"></div>
            <button onClick={() => { setYaw(0.5); setPitch(0.15); setZoom(1); }} className="text-primary hover:brightness-110 font-semibold transition-all">Reset</button>
        </div>
      </div>
    </div>
  );
}