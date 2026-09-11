const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "SportPose";
p.title = "SportPose — Markerless 3D Motion Capture";

const C = {
  navy: "17233D", blue: "2563EB", blueDk: "1D4ED8", tint: "EAF1FB",
  ink: "0F172A", body: "334155", mute: "64748B", border: "CBD5E1",
  white: "FFFFFF", bg: "FFFFFF", green: "0E7C55", amber: "B45309", red: "C0392B",
  grid: "F1F5F9", magenta: "BE1E7A", cyan: "0E7490", card2: "F8FAFC"
};
const F = { head: "Cambria", body: "Calibri" };
let PAGE = 0;

function sh() { return { type: "outer", color: "94A3B8", opacity: 0.28, blur: 7, offset: 2, angle: 90 }; }

function pageFooter(s) {
  PAGE++;
  s.addText("SportPose  ·  3D Stereo Motion Capture", { x: 0.5, y: 7.08, w: 6, h: 0.3, fontSize: 9, color: C.mute, fontFace: F.body });
  s.addText(String(PAGE), { x: 12.5, y: 7.08, w: 0.5, h: 0.3, fontSize: 10, color: C.mute, align: "right", fontFace: F.body });
}
function header(s, kicker, title) {
  s.background = { color: C.bg };
  s.addText(kicker.toUpperCase(), { x: 0.5, y: 0.34, w: 12.3, h: 0.3, fontSize: 12, bold: true, color: C.blue, fontFace: F.body, charSpacing: 2 });
  s.addText(title, { x: 0.5, y: 0.6, w: 12.3, h: 0.72, fontSize: 30, bold: true, color: C.navy, fontFace: F.head });
}
function card(s, x, y, w, h, fill, line) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: fill || C.card2 }, line: { color: line || C.border, width: 1 }, shadow: sh() });
}
function badge(s, x, y, d, txt, fill) {
  s.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || C.blue }, line: { color: fill || C.blue, width: 1 } });
  s.addText(txt, { x, y, w: d, h: d, align: "center", valign: "middle", fontSize: d > 0.5 ? 15 : 11, bold: true, color: C.white, fontFace: F.body });
}
function arrow(s, x, y, w, h, color, width) {
  s.addShape(p.ShapeType.line, { x, y, w, h, line: { color: color || C.blue, width: width || 2, endArrowType: "triangle" } });
}
function bullets(s, x, y, w, h, items, opts) {
  opts = opts || {};
  const arr = items.map((t) => ({
    text: t.t !== undefined ? t.t : t,
    options: {
      bullet: { code: "2022", indent: 14 },
      color: t.c || opts.color || C.body, bold: !!t.b, fontSize: t.fs || opts.fontSize || 13,
      fontFace: F.body, paraSpaceAfter: opts.gap !== undefined ? opts.gap : 7, breakLine: true
    }
  }));
  s.addText(arr, { x, y, w, h, valign: "top", fontFace: F.body });
}
function chip(s, x, y, w, h, txt, fill, tcolor, fs) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: fill || C.tint }, line: { color: C.blue, width: 1 } });
  s.addText(txt, { x: x + 0.03, y, w: w - 0.06, h, align: "center", valign: "middle", fontSize: fs || 11, bold: true, color: tcolor || C.navy, fontFace: F.body });
}

const KP = {
  0:[.50,.06],1:[.50,.17],2:[.38,.19],3:[.62,.19],4:[.31,.34],5:[.69,.34],
  6:[.27,.48],7:[.73,.48],8:[.25,.55],9:[.75,.55],10:[.43,.53],11:[.57,.53],
  12:[.41,.71],13:[.59,.71],14:[.40,.89],15:[.60,.89],16:[.36,.95],17:[.64,.95]
};
const LEFTB=[[1,2],[2,4],[4,6],[6,8],[2,10],[10,12],[12,14],[14,16]];
const RIGHTB=[[1,3],[3,5],[5,7],[7,9],[3,11],[11,13],[13,15],[15,17]];
const CENTERB=[[0,1],[10,11]];
function skeleton(s, x0, y0, w, h, showIdx) {
  const P0 = (i) => [x0 + KP[i][0]*w, y0 + KP[i][1]*h];
  const line = (a,b,col) => { const A=P0(a),B=P0(b); s.addShape(p.ShapeType.line,{x:A[0],y:A[1],w:B[0]-A[0],h:B[1]-A[1],line:{color:col,width:2.5}}); };
  CENTERB.forEach(([a,b])=>line(a,b,C.mute));
  LEFTB.forEach(([a,b])=>line(a,b,C.blue));
  RIGHTB.forEach(([a,b])=>line(a,b,C.magenta));
  for (let i=0;i<18;i++){ const q=P0(i); s.addShape(p.ShapeType.ellipse,{x:q[0]-0.045,y:q[1]-0.045,w:0.09,h:0.09,fill:{color:C.navy},line:{color:C.white,width:1}});
    if(showIdx){ s.addText(String(i),{x:q[0]+0.07,y:q[1]-0.1,w:0.5,h:0.2,fontSize:8,color:C.mute,fontFace:F.body}); } }
}

// SLIDE 1 TITLE
(() => {
  const s = p.addSlide(); s.background = { color: C.navy };
  const mo = (x,y,w,h)=>s.addShape(p.ShapeType.line,{x,y,w,h,line:{color:"2E3E63",width:1.5}});
  mo(9.8,1.0,2.2,3.2); mo(9.8,6.2,2.2,-3.2); mo(9.8,1.0,0,5.2);
  s.addShape(p.ShapeType.ellipse,{x:9.72,y:0.92,w:0.16,h:0.16,fill:{color:C.blue}});
  s.addShape(p.ShapeType.ellipse,{x:9.72,y:6.12,w:0.16,h:0.16,fill:{color:C.blue}});
  s.addShape(p.ShapeType.ellipse,{x:11.9,y:3.52,w:0.2,h:0.2,fill:{color:"38BDF8"}});
  s.addText("SportPose", { x: 0.8, y: 2.0, w: 9, h: 1.0, fontSize: 54, bold: true, color: C.white, fontFace: F.head });
  s.addText("Markerless 3D Human Motion Capture via Stereo Vision", { x: 0.8, y: 3.05, w: 8.6, h: 0.7, fontSize: 22, color: "CFE0FF", fontFace: F.body });
  s.addText("An end-to-end technical walkthrough: camera capture -> synchronization -> calibration -> triangulation -> 3D kinematics",
    { x: 0.82, y: 3.85, w: 8.4, h: 0.8, fontSize: 13, color: "9FB4DC", fontFace: F.body });
  s.addText([
    {text:"Stereo capture  ·  ",options:{color:"7FA0D8"}},{text:"OpenCV calibration  ·  ",options:{color:"7FA0D8"}},
    {text:"MediaPipe pose  ·  ",options:{color:"7FA0D8"}},{text:"Metric triangulation",options:{color:"7FA0D8"}}
  ], { x: 0.82, y: 5.6, w: 9, h: 0.4, fontSize: 12, bold:true, fontFace: F.body });
  s.addNotes("Open by scoping honestly: the pose model is off-the-shelf MediaPipe; our contribution is the classical stereo pipeline (calibration, synchronization, triangulation, leveling) and the full-stack app. We reconstruct TRUE metric 3D, not a monocular depth guess.");
})();

// SLIDE 2 EXEC SUMMARY
(() => {
  const s = p.addSlide(); header(s, "Executive Summary", "What SportPose is");
  card(s, 0.5, 1.7, 7.0, 5.2, C.card2);
  s.addText("The system in one paragraph", { x: 0.8, y: 1.9, w: 6.4, h: 0.4, fontSize: 15, bold: true, color: C.navy, fontFace: F.body });
  bullets(s, 0.85, 2.4, 6.4, 4.4, [
    {t:"Two cameras record an athlete from two angles (a stereo pair)."},
    {t:"A pre-trained pose model finds 2D body joints in each view."},
    {t:"Classical stereo geometry - calibration + triangulation - lifts the paired 2D joints into true 3D positions (millimetres)."},
    {t:"3D joint angles are computed per frame and shown in a synchronized web UI: overlay video + rotatable 3D skeleton + angle graphs."},
    {t:"Scope of the ML: pose estimation = MediaPipe (inference only). Our engineering = the stereo reconstruction pipeline + application.", b:true, c:C.navy}
  ], {gap:11});
  const stat = (y, big, lab) => { card(s, 7.8, y, 5.0, 1.15, C.tint, C.blue);
    s.addText(big, { x: 8.0, y: y+0.12, w: 2.1, h: 0.9, fontSize: 30, bold: true, color: C.blue, fontFace: F.head, valign:"middle" });
    s.addText(lab, { x: 10.0, y: y+0.12, w: 2.7, h: 0.9, fontSize: 12, color: C.body, fontFace: F.body, valign:"middle" }); };
  stat(1.7, "2 cams", "Stereo pair -> metric depth via triangulation");
  stat(3.0, "18 pts", "Custom skeleton (from MediaPipe's 33 landmarks)");
  stat(4.3, "12", "Joint angles tracked per frame, in 3D");
  stat(5.6, "3D mm", "Real-world units, not relative monocular depth");
  pageFooter(s);
  s.addNotes("Lead with the framing sentence in the bottom bullet. If they think you trained a network, that gets dismantled fast - own the real scope; the stereo geometry IS the substance.");
})();

// SLIDE 3 PROBLEM
(() => {
  const s = p.addSlide(); header(s, "Motivation", "Why markerless 3D?");
  const col = (x, title, items, fill, lc) => {
    card(s, x, 1.75, 3.95, 5.1, fill, lc);
    s.addText(title, { x: x+0.25, y: 1.95, w: 3.5, h: 0.5, fontSize: 16, bold: true, color: C.navy, fontFace: F.body });
    bullets(s, x+0.28, 2.55, 3.5, 4.1, items, {gap:9, fontSize:12.5});
  };
  col(0.5, "The problem", [
    "Marker-based mocap (Vicon, OptiTrack) is accurate but costly, lab-bound, needs suits + many cameras.",
    "Single-camera 2D analysis can't measure true 3D joint angles - depth is lost.",
    "Coaches want quantitative kinematics from ordinary hardware."], C.card2);
  col(4.65, "Our approach", [
    "Two consumer cameras form a calibrated stereo rig.",
    "Markerless: pose model finds joints - no suit.",
    "Triangulation recovers metric 3D from the two views.",
    "Delivered as a web app: upload/record -> analyze -> visualize."], C.tint, C.blue);
  col(8.85, "Why it's hard", [
    "Two cameras must be synchronized in time.",
    "A wide baseline must be accurately calibrated.",
    "2D detection noise propagates into 3D.",
    "Left/right joint correspondence must be correct."], C.card2);
  pageFooter(s);
  s.addNotes("Frame the value (cheap, markerless, 3D) and immediately signal you understand the hard parts - sync, calibration, noise, correspondence. This pre-empts his first questions.");
})();

function divider(kicker, title, sub) {
  const s = p.addSlide(); s.background = { color: C.navy };
  s.addShape(p.ShapeType.ellipse,{x:11.4,y:-0.9,w:3.2,h:3.2,fill:{color:"1F2F52"},line:{color:"1F2F52",width:1}});
  s.addShape(p.ShapeType.ellipse,{x:-1.0,y:5.4,w:3.0,h:3.0,fill:{color:"1F2F52"},line:{color:"1F2F52",width:1}});
  s.addText(kicker.toUpperCase(), { x: 0.9, y: 2.7, w: 10, h: 0.4, fontSize: 14, bold: true, color: "5B7FD0", fontFace: F.body, charSpacing: 3 });
  s.addText(title, { x: 0.9, y: 3.1, w: 11.4, h: 1.0, fontSize: 40, bold: true, color: C.white, fontFace: F.head });
  if (sub) s.addText(sub, { x: 0.92, y: 4.15, w: 10.5, h: 0.6, fontSize: 15, color: "AEC2E8", fontFace: F.body });
}
divider("Part 1", "System & Setup", "Architecture, technology stack, camera rig, capture & synchronization");

// ARCHITECTURE
(() => {
  const s = p.addSlide(); header(s, "Architecture", "System architecture");
  card(s, 0.5, 1.75, 3.4, 1.5, C.tint, C.blue);
  s.addText("Client - React 19 SPA", {x:0.65,y:1.85,w:3.1,h:0.35,fontSize:13,bold:true,color:C.navy,fontFace:F.body});
  s.addText("Vite - TypeScript - Tailwind\nReact Router - TanStack Query\nECharts - Canvas 3D viewer", {x:0.65,y:2.2,w:3.1,h:1.0,fontSize:10.5,color:C.body,fontFace:F.body});
  card(s, 5.0, 1.75, 3.4, 1.5, C.navy, C.navy);
  s.addText("API - FastAPI (Uvicorn)", {x:5.15,y:1.85,w:3.1,h:0.35,fontSize:13,bold:true,color:C.white,fontFace:F.body});
  s.addText("Routers: users - upload - pose\ncamera - obs - ping\nJWT auth (HttpOnly cookie) - CORS", {x:5.15,y:2.2,w:3.1,h:1.0,fontSize:10.5,color:"D6E2F8",fontFace:F.body});
  arrow(s, 3.95, 2.5, 1.0, 0, C.blue, 2.5);
  s.addText("HTTPS - cookie", {x:3.75,y:2.15,w:1.35,h:0.3,fontSize:8.5,italic:true,color:C.mute,align:"center",fontFace:F.body});
  card(s, 9.5, 1.75, 3.35, 1.5, C.card2);
  s.addText("Vision Engine (Python)", {x:9.65,y:1.85,w:3.0,h:0.35,fontSize:13,bold:true,color:C.navy,fontFace:F.body});
  s.addText("MediaPipe Pose Landmarker\nOpenCV - NumPy\nCalibration - Triangulation", {x:9.65,y:2.2,w:3.0,h:1.0,fontSize:10.5,color:C.body,fontFace:F.body});
  arrow(s, 8.45, 2.5, 1.0, 0, C.blue, 2.5);
  card(s, 3.2, 4.4, 3.2, 1.5, C.card2);
  s.addText("MongoDB", {x:3.35,y:4.5,w:2.9,h:0.35,fontSize:13,bold:true,color:C.green,fontFace:F.body});
  s.addText("Collections: users, videos,\npose_analysis (keypoints,\n3D frames, angles, status)", {x:3.35,y:4.85,w:2.9,h:1.0,fontSize:10.5,color:C.body,fontFace:F.body});
  card(s, 6.9, 4.4, 3.2, 1.5, C.card2);
  s.addText("MinIO (S3 object store)", {x:7.05,y:4.5,w:2.9,h:0.35,fontSize:13,bold:true,color:C.amber,fontFace:F.body});
  s.addText("Raw + processed videos.\nAccessed by clients via\n1-hour presigned URLs.", {x:7.05,y:4.85,w:2.9,h:1.0,fontSize:10.5,color:C.body,fontFace:F.body});
  arrow(s, 5.6, 3.25, -0.6, 1.15, C.mute, 2);
  arrow(s, 7.6, 3.25, 0.6, 1.15, C.mute, 2);
  s.addText("Keyword recap:  SPA - REST - JWT/HttpOnly cookie - object storage - presigned URL - document DB - synchronous processing",
    {x:0.5,y:6.35,w:12.3,h:0.4,fontSize:11,italic:true,color:C.navy,fontFace:F.body,align:"center"});
  pageFooter(s);
  s.addNotes("The browser never touches MinIO credentials - it gets short-lived presigned URLs. Processing currently runs synchronously inside the FastAPI request (flag this; it's a scalability limit you'll revisit).");
})();

// TECH STACK
(() => {
  const s = p.addSlide(); header(s, "Technology", "Technology stack & keywords");
  const group = (x, y, title, color, items) => {
    card(s, x, y, 3.95, 2.35, C.card2);
    badge(s, x+0.22, y+0.22, 0.42, "", color);
    s.addText(title, { x: x+0.8, y: y+0.2, w: 3.0, h: 0.45, fontSize: 15, bold: true, color: C.navy, fontFace: F.body, valign:"middle" });
    bullets(s, x+0.28, y+0.78, 3.5, 1.5, items, {gap:5, fontSize:11.5});
  };
  group(0.5, 1.75, "Frontend", C.blue, ["React 19 + TypeScript, Vite","Tailwind CSS v4, Framer Motion","TanStack Query (server cache)","ECharts + HTML Canvas (3D)"]);
  group(4.65, 1.75, "Backend", C.navy, ["FastAPI + Uvicorn (ASGI)","Pydantic models, CORS","PyMongo, python-dotenv","JWT (PyJWT) + bcrypt auth"]);
  group(8.8, 1.75, "Computer vision", C.cyan, ["MediaPipe Tasks - Pose Landmarker","OpenCV (calibrate, triangulate)","NumPy linear algebra","obsws / DroidCam capture"]);
  group(0.5, 4.3, "Storage", C.amber, ["MongoDB - metadata & results","MinIO - S3-compatible objects","Presigned URLs for playback","Temp files during processing"]);
  group(4.65, 4.3, "Capture", C.green, ["USB webcams (DirectShow)","Phone IP-cams over WiFi","MJPEG live preview stream","cv2.VideoWriter (avc1/mp4v)"]);
  group(8.8, 4.3, "Calibration math", C.magenta, ["Checkerboard detection","Intrinsics + distortion model","Stereo extrinsics (R, T)","DLT triangulation, plane fit"]);
  pageFooter(s);
  s.addNotes("Be ready to justify each choice. MediaPipe = fast, robust, per-point confidence, tiny footprint. FastAPI = async, typed. MinIO = self-hosted S3 so we never ship blobs through the DB.");
})();

// PIPELINE OVERVIEW
(() => {
  const s = p.addSlide(); header(s, "Pipeline", "End-to-end pipeline at a glance");
  const stages = [
    ["0","Calibrate","One-time: intrinsics, distortion, R, T from a checkerboard", C.magenta],
    ["1","Capture","Two synchronized views -> live preview", C.blue],
    ["2","Record + store","Side-by-side MP4 -> MinIO + MongoDB", C.blue],
    ["3","Trigger + route","Stereo vs 2D path decided by metadata", C.navy],
    ["4","2D pose","MediaPipe on each view -> 18 keypoints", C.cyan],
    ["5","Triangulate","Paired 2D -> metric 3D (mm), left-cam frame", C.cyan],
    ["6","3D angles","12 joint angles per frame + floor leveling", C.green],
    ["7","Persist + show","Results stored -> synchronized web visualization", C.amber]
  ];
  let y = 1.75;
  stages.forEach((st, i) => {
    const h = 0.6, x = 0.6;
    badge(s, x, y, 0.5, st[0], st[3]);
    card(s, x+0.75, y-0.03, 11.4, h, i%2? C.card2 : C.tint, i%2? C.border : C.blue);
    s.addText(st[1], { x: x+0.95, y: y-0.03, w: 2.7, h: h, valign:"middle", fontSize: 14, bold: true, color: C.navy, fontFace: F.body });
    s.addText(st[2], { x: x+3.7, y: y-0.03, w: 8.3, h: h, valign:"middle", fontSize: 12, color: C.body, fontFace: F.body });
    if (i < stages.length-1) arrow(s, x+0.25, y+0.55, 0, 0.1, st[3], 2);
    y += 0.66;
  });
  pageFooter(s);
  s.addNotes("This is the spine of the talk. Everything after is a zoom-in on one of these stages. If asked to walk through it, follow these eight rows in order.");
})();

// CAMERA SETUP ROOM
(() => {
  const s = p.addSlide(); header(s, "Camera Setup", "Physical camera rig (top-down)");
  const rx=1.4, ry=1.9, rw=4.6, rh=4.8;
  s.addShape(p.ShapeType.rect, { x:rx, y:ry, w:rw, h:rh, fill:{color:C.grid}, line:{color:C.navy,width:2.5} });
  s.addText("305 cm", {x:rx,y:ry-0.4,w:rw,h:0.3,align:"center",fontSize:11,bold:true,color:C.red,fontFace:F.body});
  s.addText("381 cm", {x:rx+rw+0.05,y:ry,w:0.9,h:rh,align:"center",valign:"middle",fontSize:11,bold:true,color:C.red,fontFace:F.body,rotate:90});
  const camL=[rx+rw-0.35, ry+0.55], camR=[rx+rw-0.35, ry+rh-0.85];
  const drawCam=(cx,cy,lab)=>{ s.addShape(p.ShapeType.rect,{x:cx,y:cy,w:0.34,h:0.24,fill:{color:C.navy},line:{color:C.navy,width:1}});
    s.addShape(p.ShapeType.triangle,{x:cx-0.16,y:cy+0.02,w:0.18,h:0.2,fill:{color:C.navy},rotate:270});
    s.addText(lab,{x:cx-0.55,y:cy-0.28,w:0.9,h:0.24,fontSize:9,bold:true,color:C.navy,fontFace:F.body,align:"center"}); };
  drawCam(camL[0],camL[1],"Cam L");
  drawCam(camR[0],camR[1],"Cam R");
  const wv=[rx+0.6, ry+rh/2-0.65, 1.5, 1.5];
  s.addShape(p.ShapeType.rect,{x:wv[0],y:wv[1],w:wv[2],h:wv[3],fill:{color:"FBE3E3"},line:{color:C.red,width:2}});
  s.addText("Capture\nvolume\n(athlete)",{x:wv[0],y:wv[1],w:wv[2],h:wv[3],align:"center",valign:"middle",fontSize:10,bold:true,color:C.red,fontFace:F.body});
  const wvCtr=[wv[0]+wv[2], wv[1]+wv[3]/2];
  s.addShape(p.ShapeType.line,{x:camL[0],y:camL[1]+0.12,w:wvCtr[0]-camL[0],h:wvCtr[1]-(camL[1]+0.12),line:{color:C.blue,width:1.5,dashType:"dash"}});
  s.addShape(p.ShapeType.line,{x:camR[0],y:camR[1]+0.12,w:wvCtr[0]-camR[0],h:wvCtr[1]-(camR[1]+0.12),line:{color:C.blue,width:1.5,dashType:"dash"}});
  s.addShape(p.ShapeType.line,{x:camL[0]+0.17,y:camL[1]+0.12,w:0,h:(camR[1]-camL[1]),line:{color:C.magenta,width:2,dashType:"sysDot"}});
  s.addText("baseline\n~ 3.6 m",{x:camL[0]-1.35,y:(camL[1]+camR[1])/2-0.2,w:1.15,h:0.5,fontSize:9,bold:true,color:C.magenta,align:"right",fontFace:F.body});
  card(s, 7.0, 1.75, 5.85, 5.05, C.card2);
  s.addText("Rig parameters", {x:7.25,y:1.9,w:5.4,h:0.4,fontSize:15,bold:true,color:C.navy,fontFace:F.body});
  bullets(s, 7.3, 2.4, 5.35, 4.3, [
    {t:"Two cameras fixed on the same wall, ~3.6 m apart (wide baseline).", b:true, c:C.navy},
    {t:"Mounted ~2 m high, both tilted down toward the capture volume."},
    {t:"Convergent (verged) setup - optical axes meet in the shared volume, not parallel."},
    {t:"Athlete performs inside the overlapping field of view (the red box) - the only region both cameras see well."},
    {t:"Trade-off: a wide baseline gives better depth precision but makes calibration & correspondence harder.", c:C.body},
    {t:"Consequence: the 3D is reconstructed in the LEFT camera's coordinate frame; a floor-leveling step re-orients it upright.", c:C.body}
  ], {gap:10, fontSize:12.5});
  pageFooter(s);
  s.addNotes("This mirrors your real room (305x381 cm). Key terms: baseline, convergent/verged rig, overlapping field of view, capture volume. Wide baseline = the reason calibration is hard and why depth precision is good.");
})();

// CAPTURE MODES
(() => {
  const s = p.addSlide(); header(s, "Camera Setup", "Capture modes & signal path");
  const col=(x,title,items,fill,lc)=>{ card(s,x,1.75,3.95,3.0,fill,lc);
    s.addText(title,{x:x+0.25,y:1.9,w:3.5,h:0.4,fontSize:15,bold:true,color:C.navy,fontFace:F.body});
    bullets(s,x+0.28,2.4,3.5,2.3,items,{gap:7,fontSize:12}); };
  col(0.5,"USB mode",[ "Two USB webcams via OpenCV + DirectShow","MJPG @ 1280x720, buffer size 1","Fails if a cam is held by OBS/Zoom","Config: CAMERA_LEFT/RIGHT_INDEX"], C.tint, C.blue);
  col(4.65,"WEB (phone) mode",[ "Two phones as IP cameras (DroidCam)","Each on its own WiFi stream","Avoids shared USB-bus contention","Config: PHONE_1_IP / PHONE_2_IP"], C.card2);
  col(8.8,"Also available",[ "OBS Studio start/stop via WebSocket","Nikon DSLR (offline) for clean 2D + validation reference","Any uploaded MP4/MOV/AVI -> 2D path"], C.card2);
  card(s, 0.5, 5.05, 12.35, 1.75, C.card2);
  s.addText("Signal path", {x:0.72,y:5.15,w:4,h:0.35,fontSize:13,bold:true,color:C.navy,fontFace:F.body});
  const steps=["Cameras","Grab thread\n(L then R)","Compose\nside-by-side","MJPEG\nlive preview","VideoWriter\nMP4","Upload ->\nMinIO"];
  let x=0.9; const w=1.75, y=5.55, gap=0.28;
  steps.forEach((t,i)=>{ chip(s,x,y,w,0.95,t,i<2?C.tint:C.card2,C.navy,10.5);
    if(i<steps.length-1) arrow(s,x+w,y+0.47,gap,0,C.blue,2); x+=w+gap; });
  pageFooter(s);
  s.addNotes("Two live modes: USB and phone-IP. Phones avoid USB-bus contention - a real practical reason. The DSLR can't live-stream/sync, so it's for clean single-camera 2D and as an accuracy reference.");
})();

// CAPTURE & SYNC
(() => {
  const s = p.addSlide(); header(s, "Stage 1 · Capture", "Capture & synchronization");
  card(s, 0.5, 1.75, 6.0, 5.05, C.card2);
  s.addText("How a synchronized pair is formed", {x:0.72,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s, 0.78, 2.4, 5.5, 2.4, [
    {t:"One background thread reads both cameras sequentially: read(L) then read(R)."},
    {t:"Buffer size = 1 to keep only the freshest frame (low latency)."},
    {t:"Last-good frame from each side is cached; newest (L, R, timestamp) is published."},
    {t:"Live preview served as an MJPEG multipart stream."},
    {t:"Calibration capture uses the tighter grab()+grab() -> retrieve() pattern.", c:C.body}
  ], {gap:8, fontSize:12.5});
  s.addText("Timeline (one capture cycle)", {x:0.78,y:4.95,w:5.5,h:0.35,fontSize:12.5,bold:true,color:C.navy,fontFace:F.body});
  const ty=5.5;
  s.addShape(p.ShapeType.line,{x:0.9,y:ty,w:5.2,h:0,line:{color:C.mute,width:1.5}});
  s.addShape(p.ShapeType.rect,{x:1.1,y:ty-0.18,w:0.6,h:0.36,fill:{color:C.blue}});
  s.addText("read L",{x:1.05,y:ty+0.22,w:0.9,h:0.25,fontSize:9,color:C.blue,bold:true,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:2.3,y:ty-0.18,w:0.6,h:0.36,fill:{color:C.magenta}});
  s.addText("read R",{x:2.25,y:ty+0.22,w:0.9,h:0.25,fontSize:9,color:C.magenta,bold:true,fontFace:F.body});
  s.addShape(p.ShapeType.line,{x:1.7,y:ty-0.5,w:0.6,h:0,line:{color:C.red,width:1.5,endArrowType:"triangle",beginArrowType:"triangle"}});
  s.addText("dt offset (a few ms)",{x:1.4,y:ty-0.82,w:2.6,h:0.25,fontSize:9,bold:true,color:C.red,fontFace:F.body});
  card(s, 6.7, 1.75, 6.15, 5.05, "FDEEE9", C.red);
  s.addText("! Software sync - the key limitation", {x:6.95,y:1.92,w:5.7,h:0.4,fontSize:14,bold:true,color:C.red,fontFace:F.body});
  bullets(s, 6.98, 2.45, 5.65, 4.2, [
    {t:"Not hardware-genlocked. The L/R frames are a few ms-tens of ms apart, and the offset varies under load."},
    {t:"Triangulation error ~ motion_speed x dt. Worst on fast limbs; negligible on slow/still motion.", b:true, c:C.navy},
    {t:"Example: 20 ms offset, wrist at 2 m/s -> ~4 cm apparent displacement between views."},
    {t:"Recording uses read()/read() - looser than the grab()/retrieve() used in calibration (an easy internal fix)."},
    {t:"Proper fixes: hardware genlock / external trigger, or timestamp each stream and interpolate to a common clock.", c:C.body}
  ], {gap:9, fontSize:12});
  pageFooter(s);
  s.addNotes("THIS is the question he opens with. Say not hardware-synced first, then quantify the error and give the fix. Never let him extract this - volunteer it.");
})();

// RECORDING & STORAGE
(() => {
  const s = p.addSlide(); header(s, "Stage 2 · Record", "Recording & storage");
  card(s, 0.5, 1.85, 5.6, 2.6, C.card2);
  s.addText("Side-by-side composite frame (one file)", {x:0.72,y:1.98,w:5.2,h:0.35,fontSize:12.5,bold:true,color:C.navy,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:0.85,y:2.5,w:2.45,h:1.75,fill:{color:C.tint},line:{color:C.blue,width:1.5}});
  s.addText("LEFT view",{x:0.85,y:3.25,w:2.45,h:0.3,align:"center",fontSize:12,bold:true,color:C.blue,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:3.3,y:2.5,w:2.45,h:1.75,fill:{color:"FBEAF3"},line:{color:C.magenta,width:1.5}});
  s.addText("RIGHT view",{x:3.3,y:3.25,w:2.45,h:0.3,align:"center",fontSize:12,bold:true,color:C.magenta,fontFace:F.body});
  s.addText("cv2.hconcat  ->  one MP4",{x:0.85,y:4.28,w:4.9,h:0.25,align:"center",fontSize:10,italic:true,color:C.mute,fontFace:F.body});
  card(s, 0.5, 4.65, 5.6, 2.15, C.card2);
  s.addText("Frame pacing", {x:0.72,y:4.77,w:5,h:0.32,fontSize:12.5,bold:true,color:C.navy,fontFace:F.body});
  bullets(s, 0.78, 5.15, 5.1, 1.55, [
    {t:"Writer paced to the wall clock: expected = elapsed x fps."},
    {t:"Duplicates the latest frame to catch up so duration is correct."},
    {t:"Caveat: fps is nominal - under-delivery -> repeated frames (zero-velocity artifacts).", c:C.body}
  ], {gap:6, fontSize:11.5});
  card(s, 6.35, 1.85, 6.5, 4.95, C.card2);
  s.addText("What gets stored, and where", {x:6.6,y:2.0,w:6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  s.addText("MinIO (object store)", {x:6.6,y:2.5,w:6,h:0.32,fontSize:12.5,bold:true,color:C.amber,fontFace:F.body});
  bullets(s, 6.66, 2.85, 6.0, 0.9, [ {t:"Raw recording, then the processed overlay video."},{t:"Unique UUID object names; retrieved via 1-hour presigned URLs."}], {gap:5, fontSize:11.5});
  s.addText("MongoDB - videos document", {x:6.6,y:3.85,w:6,h:0.32,fontSize:12.5,bold:true,color:C.green,fontFace:F.body});
  bullets(s, 6.66, 4.2, 6.0, 1.05, [ {t:"user_id, bucket, object_name, filename, size, uploaded_at."},{t:"Stereo tags: source='stereo_camera', layout='side_by_side', fps, frames."},{t:"These tags later route the clip to the 3D pipeline."}], {gap:5, fontSize:11.5});
  s.addText("Keywords: composite frame - wall-clock pacing - object storage - presigned URL - metadata tagging",
    {x:6.66,y:5.6,w:6.0,h:0.9,fontSize:11,italic:true,color:C.navy,fontFace:F.body});
  pageFooter(s);
  s.addNotes("The layout/source tags written here are what Stage 3 reads to choose stereo-vs-2D. Mention the frame-duplication caveat before he finds it.");
})();

divider("Part 2", "Calibration", "Teaching the system the geometry of the two cameras");

// CALIB CONCEPT
(() => {
  const s = p.addSlide(); header(s, "Calibration · Concept", "What calibration recovers");
  const g=(x,y,t,sub,items,color)=>{ card(s,x,y,6.0,2.4,C.card2);
    badge(s,x+0.22,y+0.22,0.44,"",color);
    s.addText(t,{x:x+0.82,y:y+0.2,w:5.0,h:0.4,fontSize:15,bold:true,color:C.navy,fontFace:F.body,valign:"middle"});
    s.addText(sub,{x:x+0.82,y:y+0.6,w:5.0,h:0.3,fontSize:10.5,italic:true,color:C.mute,fontFace:F.body});
    bullets(s,x+0.28,y+0.95,5.4,1.35,items,{gap:6,fontSize:12}); };
  g(0.5,1.75,"Intrinsics (K)","per camera",[ "Focal length + optical/principal point.","How this lens maps the world onto pixels."],C.blue);
  g(6.85,1.75,"Distortion (D)","per camera",[ "Radial + tangential lens bending.","Mathematically undone before triangulating."],C.cyan);
  g(0.5,4.3,"Extrinsics (R, T)","between cameras",[ "Rotation R and translation T of the right camera relative to the left.","T is in millimetres (set by square size)."],C.magenta);
  g(6.85,4.3,"Why it matters","the payoff",[ "Only with K, D, R, T can two 2D points be intersected into one correct 3D point.","Errors here tilt/skew the whole skeleton."],C.green);
  pageFooter(s);
  s.addNotes("Define these four crisply - a definitions question is a trap to check you understand your own system. Intrinsics vs extrinsics is the classic one.");
})();

// CALIB PROCESS
(() => {
  const s = p.addSlide(); header(s, "Calibration · Process", "Calibration procedure (offline, one-time)");
  const steps=[
    ["1","Print target","9x6 inner-corner checkerboard, 40 mm squares. Known geometry sets the metric scale."],
    ["2","Detect corners","findChessboardCorners + sub-pixel cornerSubPix, in BOTH views simultaneously."],
    ["3","Capture ~20 pairs","SPACE stores a pair only if the board is found in both views; vary pose/tilt/distance."],
    ["4","Per-camera solve","cv2.calibrateCamera -> K, D and a left/right RMS for each camera."],
    ["5","Stereo solve","cv2.stereoCalibrateExtended (FIX_INTRINSIC) -> R, T + per-pair errors."],
    ["6","Reject + refit","Drop outlier pairs, recalibrate on survivors (next slide)."],
    ["7","Save","calibration.npz: K1,D1,K2,D2,R,T, sizes, RMS, square size (+ floor R_level)."]
  ];
  let y=1.72;
  steps.forEach((st,i)=>{ badge(s,0.6,y,0.46,st[0],i<5?C.blue:C.green);
    card(s,1.25,y-0.02,11.6,0.62,i%2?C.card2:C.tint,i%2?C.border:C.blue);
    s.addText(st[1],{x:1.45,y:y-0.02,w:2.7,h:0.62,valign:"middle",fontSize:13,bold:true,color:C.navy,fontFace:F.body});
    s.addText(st[2],{x:4.2,y:y-0.02,w:8.5,h:0.62,valign:"middle",fontSize:11.5,color:C.body,fontFace:F.body});
    if(i<steps.length-1) arrow(s,0.83,y+0.58,0,0.1,C.mute,1.5);
    y+=0.71; });
  pageFooter(s);
  s.addNotes("Emphasize step 3's gate (board must be in BOTH views) and that the square size is what makes everything metric. Quality is judged by reprojection RMS.");
})();

// BAD PAIR REJECTION
(() => {
  const s = p.addSlide(); header(s, "Calibration · Quality Control", "How bad image pairs are removed");
  card(s, 0.5, 1.75, 6.1, 5.05, C.card2);
  badge(s,0.72,1.95,0.44,"1",C.blue);
  s.addText("Gate 1 - at capture (prevention)", {x:1.3,y:1.95,w:5.1,h:0.44,fontSize:14,bold:true,color:C.navy,fontFace:F.body,valign:"middle"});
  bullets(s,0.8,2.55,5.5,1.5,[ {t:"A pair is stored only if the checkerboard is detected in BOTH views on a fresh synced grab."},{t:"If the board isn't cleanly visible in both -> the pair is never added."}],{gap:7,fontSize:12});
  badge(s,0.72,4.15,0.44,"2",C.green);
  s.addText("Gate 2 - at calibration (outliers)", {x:1.3,y:4.15,w:5.1,h:0.44,fontSize:14,bold:true,color:C.navy,fontFace:F.body,valign:"middle"});
  bullets(s,0.8,4.75,5.5,2.0,[ {t:"stereoCalibrateExtended returns a per-pair reprojection error."},{t:"threshold = max(1.0 px, 1.5 x median error).", b:true, c:C.navy},{t:"Pairs above threshold are dropped; recalibrate on the rest - only if >= 8 good pairs remain."}],{gap:8,fontSize:12});
  card(s, 6.8, 1.75, 6.05, 2.75, C.tint, C.blue);
  s.addText("Reprojection error (the metric)", {x:7.05,y:1.9,w:5.6,h:0.35,fontSize:13.5,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.1,2.35,5.55,2.0,[ {t:"Project the reconstructed 3D board points back into the image."},{t:"Measure pixel distance to the actually-detected corners."},{t:"RMS of those distances summarizes the fit - lower is better; target < 1.0 px.", b:true, c:C.navy}],{gap:7,fontSize:12});
  card(s, 6.8, 4.65, 6.05, 2.15, "FDEEE9", C.red);
  s.addText("Honest caveat", {x:7.05,y:4.78,w:5.6,h:0.35,fontSize:13,bold:true,color:C.red,fontFace:F.body});
  bullets(s,7.1,5.2,5.55,1.5,[ {t:"The median x 1.5 rule is a practical filter, not a formal robust estimator (MAD/z-score would be stronger)."},{t:"Currently evaluated on the same pairs used to fit - no held-out set yet."}],{gap:7,fontSize:11.5});
  pageFooter(s);
  s.addNotes("This is the exact question your client already asked. Know both gates and the median x 1.5 rule. Volunteering the two caveats reads as maturity, not weakness.");
})();

// CALIB QUALITY
(() => {
  const s = p.addSlide(); header(s, "Calibration · Reality Check", "Quality metrics & the wide-baseline challenge");
  const stat=(x,big,lab,col)=>{ card(s,x,1.8,2.9,1.5,C.card2,col);
    s.addText(big,{x:x+0.1,y:1.95,w:2.7,h:0.7,align:"center",fontSize:26,bold:true,color:col,fontFace:F.head});
    s.addText(lab,{x:x+0.1,y:2.62,w:2.7,h:0.6,align:"center",fontSize:10.5,color:C.body,fontFace:F.body}); };
  stat(0.5,"< 1.0 px","Target stereo RMS",C.green);
  stat(3.55,"~4.2 px","Current stereo RMS (to fix)",C.red);
  stat(6.6,"3.6 m","Real baseline (measured)",C.navy);
  stat(9.7,"+-15%","Baseline sanity-check band",C.blue);
  card(s, 0.5, 3.55, 6.1, 3.25, C.card2);
  s.addText("Why our RMS is high right now", {x:0.72,y:3.68,w:5.6,h:0.35,fontSize:13.5,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.78,4.1,5.6,2.6,[ {t:"3.6 m baseline calibrated with a small 40 cm board -> few pixels per corner."},{t:"Steep convergence angle -> the board is foreshortened in at least one view."},{t:"Per-camera RMS was fine (1.6 / 0.27 px) but stereo RMS was ~4.2 -> a synchronization / correspondence issue, not a lens issue.", b:true,c:C.navy},{t:"A per-pair median of 5.6 px meant most pairs were bad, not just outliers."}],{gap:8,fontSize:12});
  card(s, 6.8, 3.55, 6.05, 3.25, C.tint, C.blue);
  s.addText("Fixes in progress", {x:7.05,y:3.68,w:5.6,h:0.35,fontSize:13.5,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.1,4.1,5.6,2.6,[ {t:"Larger / higher-resolution calibration target."},{t:"Hold the board perfectly still; keep both cameras rigid."},{t:"Added baseline sanity check: |T| vs measured 3.6 m, warns if >15% off."},{t:"Added floor-leveling to fix orientation independently."},{t:"Realistic goal for this rig: ~1-1.5 px.", b:true,c:C.navy}],{gap:8,fontSize:12});
  pageFooter(s);
  s.addNotes("Don't hide the 4.2 px. Explain WHY (wide baseline + small board + sync), what it tells you (per-camera good, stereo bad = sync), and the concrete fixes. This is exactly the diagnostic reasoning a senior engineer wants to see.");
})();

// FLOOR LEVELING
(() => {
  const s = p.addSlide(); header(s, "Calibration · Leveling", "Floor leveling - standing the skeleton upright");
  card(s, 0.5, 1.85, 6.0, 4.95, C.card2);
  s.addShape(p.ShapeType.line,{x:0.9,y:4.6,w:2.0,h:-0.7,line:{color:C.mute,width:2,dashType:"dash"}});
  s.addShape(p.ShapeType.rect,{x:1.55,y:2.7,w:0.5,h:1.4,fill:{color:C.blue},rotate:20});
  s.addText("Camera tilted down ->\nskeleton appears tilted",{x:0.8,y:4.75,w:2.5,h:0.7,fontSize:10,bold:true,color:C.red,fontFace:F.body});
  arrow(s,3.2,3.4,0.9,0,C.green,3);
  s.addText("R_level",{x:3.1,y:3.05,w:1.1,h:0.3,fontSize:11,bold:true,italic:true,color:C.green,fontFace:F.body,align:"center"});
  s.addShape(p.ShapeType.line,{x:4.4,y:4.2,w:1.9,h:0,line:{color:C.green,width:2}});
  s.addShape(p.ShapeType.rect,{x:5.1,y:2.7,w:0.5,h:1.45,fill:{color:C.green}});
  s.addText("Leveled &\nupright",{x:4.5,y:4.35,w:1.8,h:0.6,fontSize:10,bold:true,color:C.green,fontFace:F.body,align:"center"});
  card(s, 6.8, 1.85, 6.05, 4.95, C.tint, C.blue);
  s.addText("How it works", {x:7.05,y:2.0,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.1,2.55,5.6,4.0,[ {t:"Lay the checkerboard flat on the floor; capture it in both cameras (press 'f')."},{t:"Triangulate its corners -> fit a plane -> the plane normal is 'up'."},{t:"Compute a rotation R_level that maps that normal to the vertical axis."},{t:"Store R_level in calibration.npz; apply it to every 3D frame at analysis time."},{t:"Joint ANGLES are rotation-invariant, so leveling changes only the display orientation - never the measured numbers.", b:true,c:C.navy}],{gap:11,fontSize:12.5});
  pageFooter(s);
  s.addNotes("Two separate causes of tilt: (1) calibration error in R, fixed by better calibration; (2) output is in the tilted left-camera frame - fixed by R_level. Stress that leveling is cosmetic: angles don't change.");
})();

divider("Part 3", "The 3D Pipeline", "From pixels to metric 3D joint angles, then to the screen");

// 2D POSE
(() => {
  const s = p.addSlide(); header(s, "Stage 4 · 2D Pose", "2D pose estimation (per view)");
  card(s, 0.5, 1.75, 6.1, 5.05, C.card2);
  s.addText("MediaPipe Pose Landmarker", {x:0.72,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.78,2.42,5.6,4.3,[ {t:"Tasks API, VIDEO running mode, model file pose_landmarker.task."},{t:"Per frame: BGR->RGB -> detect_for_video with a 30 fps-locked timestamp."},{t:"Returns 33 landmarks; we remap to a custom 18-point skeleton and synthesize a NECK = midpoint of the two shoulders."},{t:"Keypoints stored NORMALIZED [x, y, presence] in 0-1."},{t:"For stereo, this runs twice - left half and right half - with temporal healing OFF.", b:true,c:C.navy},{t:"We do NOT use MediaPipe's z (monocular, relative). Real depth comes from triangulation.", c:C.body}],{gap:9,fontSize:12});
  card(s, 6.8, 1.75, 6.05, 5.05, C.tint, C.blue);
  s.addText("33 landmarks -> 18-point skeleton", {x:7.05,y:1.9,w:5.6,h:0.4,fontSize:13.5,bold:true,color:C.navy,fontFace:F.body});
  chip(s, 7.15, 2.5, 2.2, 0.7, "MediaPipe\n33 landmarks", C.card2, C.navy, 11);
  arrow(s, 9.45, 2.85, 0.55, 0, C.blue, 2.5);
  chip(s, 10.1, 2.5, 2.55, 0.7, "Remap + synth neck\n-> 18 keypoints", C.white, C.navy, 11);
  skeleton(s, 8.4, 3.4, 2.9, 3.2, false);
  s.addText([{text:"● left  ",options:{color:C.blue,bold:true}},{text:"● right  ",options:{color:C.magenta,bold:true}},{text:"● centre",options:{color:C.mute,bold:true}}],
    {x:7.1,y:6.45,w:5.5,h:0.3,fontSize:11,align:"center",fontFace:F.body});
  pageFooter(s);
  s.addNotes("Strong point: we ignore MediaPipe's z because it's a relative monocular guess. Weakness to flag next slide: presence vs visibility, and healing is off on the 3D path.");
})();

// 18 POINT SKELETON
(() => {
  const s = p.addSlide(); header(s, "Representation", "The 18-point skeleton & connections");
  skeleton(s, 0.7, 1.7, 4.6, 5.0, true);
  card(s, 5.7, 1.75, 7.15, 5.05, C.card2);
  s.addText("Keypoint index map", {x:5.95,y:1.9,w:6.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  const left=[ "0  Nose","1  Neck (synthesized)","2  L shoulder   3  R shoulder","4  L elbow      5  R elbow","6  L wrist      7  R wrist","8  L index      9  R index"];
  const right=[ "10 L hip       11 R hip","12 L knee      13 R knee","14 L ankle     15 R ankle","16 L foot      17 R foot","","Bones: 18 connections (arms,","legs, spine, shoulder & pelvis girdles)"];
  s.addText(left.join("\n"),{x:6.0,y:2.45,w:3.4,h:3.5,fontSize:12,color:C.body,fontFace:"Courier New",lineSpacingMultiple:1.25});
  s.addText(right.join("\n"),{x:9.4,y:2.45,w:3.3,h:3.5,fontSize:12,color:C.body,fontFace:"Courier New",lineSpacingMultiple:1.25});
  s.addText("Angles computed: knees, hips, elbows, wrists, shoulders, ankles (left & right = 12).",
    {x:6.0,y:6.15,w:6.6,h:0.5,fontSize:11.5,italic:true,color:C.navy,fontFace:F.body});
  pageFooter(s);
  s.addNotes("The neck is not a MediaPipe landmark - we build it from the shoulder midpoint so the skeleton has a clean spine for angle definitions.");
})();

// TRIANGULATION
(() => {
  const s = p.addSlide(); header(s, "Stage 5 · Triangulation", "Paired 2D -> metric 3D");
  card(s, 0.5, 1.75, 5.9, 5.05, C.card2);
  const CL=[1.5,5.7], CR=[5.4,5.7], P=[3.45,2.6];
  const dot=(q,lab,dx)=>{ s.addShape(p.ShapeType.ellipse,{x:q[0]-0.09,y:q[1]-0.09,w:0.18,h:0.18,fill:{color:C.navy}});
    s.addText(lab,{x:q[0]+(dx||-0.15),y:q[1]+0.12,w:1.6,h:0.25,fontSize:10,bold:true,color:C.navy,fontFace:F.body}); };
  s.addShape(p.ShapeType.line,{x:CL[0],y:CL[1],w:P[0]-CL[0],h:P[1]-CL[1],line:{color:C.blue,width:2}});
  s.addShape(p.ShapeType.line,{x:CR[0],y:CR[1],w:P[0]-CR[0],h:P[1]-CR[1],line:{color:C.magenta,width:2}});
  s.addShape(p.ShapeType.line,{x:CL[0],y:CL[1],w:CR[0]-CL[0],h:0,line:{color:C.green,width:2,dashType:"dash"}});
  dot(CL,"Left cam",-0.1); dot(CR,"Right cam",-0.1);
  s.addShape(p.ShapeType.ellipse,{x:P[0]-0.11,y:P[1]-0.11,w:0.22,h:0.22,fill:{color:C.red}});
  s.addText("P = (X, Y, Z) mm",{x:P[0]-0.9,y:P[1]-0.45,w:2.2,h:0.28,fontSize:11,bold:true,color:C.red,fontFace:F.body,align:"center"});
  s.addText("baseline  R, T",{x:2.3,y:5.78,w:2.3,h:0.3,fontSize:10,bold:true,color:C.green,fontFace:F.body,align:"center"});
  s.addText("Two rays, one intersection -> depth",{x:0.7,y:6.35,w:5.5,h:0.3,fontSize:11,italic:true,color:C.mute,fontFace:F.body,align:"center"});
  card(s, 6.6, 1.75, 6.25, 5.05, C.tint, C.blue);
  s.addText("Method (standard, robust)", {x:6.85,y:1.9,w:5.8,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,6.9,2.45,5.85,3.0,[ {t:"Convert normalized keypoints -> pixels using each view's stored size."},{t:"cv2.undistortPoints - removes distortion + intrinsics -> normalized camera rays."},{t:"Projection matrices: P1 = [ I | 0 ],  P2 = [ R | T ].", b:true,c:C.navy},{t:"cv2.triangulatePoints (linear DLT) -> homogeneous -> divide -> 3D in the LEFT-camera frame, in mm."},{t:"A joint below 0.5 confidence in EITHER view -> NaN (gap), never a wrong point."}],{gap:9,fontSize:12});
  card(s, 6.9, 5.6, 5.65, 1.05, "FDEEE9", C.red);
  s.addText("Limits: linear DLT (algebraic error), no per-joint outlier rejection, no bundle adjustment, no epipolar correspondence check.",
    {x:7.05,y:5.7,w:5.35,h:0.85,fontSize:11,color:C.red,fontFace:F.body,valign:"middle"});
  pageFooter(s);
  s.addNotes("Name the method precisely (DLT via SVD, algebraic error) and its limits (no outlier rejection, no bundle adjustment, no epipolar gating). The epipolar/correspondence gap is the second question he'll dig at.");
})();

// 3D ANGLES
(() => {
  const s = p.addSlide(); header(s, "Stage 6 · Kinematics", "3D joint angles");
  card(s, 0.5, 1.75, 6.1, 5.05, C.card2);
  s.addText("Computation", {x:0.72,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.78,2.42,5.6,2.6,[ {t:"For a joint at B with neighbours A and C: form vectors A-B and C-B."},{t:"Angle = arccos of their normalized dot product - a true 3D angle."},{t:"12 angles per frame: knees, hips, elbows, wrists, shoulders, ankles (L & R)."},{t:"A missing (NaN) endpoint -> that angle is simply skipped for the frame."}],{gap:9,fontSize:12.5});
  card(s, 0.78, 5.25, 5.55, 1.4, C.white, C.border);
  s.addText("theta = arccos( (A-B).(C-B) / |A-B| |C-B| )", {x:0.9,y:5.35,w:5.3,h:0.5,align:"center",valign:"middle",fontSize:15,bold:true,color:C.navy,fontFace:"Cambria"});
  s.addText("in 3D - no camera-facing heuristics needed", {x:0.9,y:5.9,w:5.3,h:0.4,align:"center",fontSize:10.5,italic:true,color:C.mute,fontFace:F.body});
  card(s, 6.8, 1.75, 6.05, 5.05, C.tint, C.blue);
  s.addText("Why this output is robust", {x:7.05,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.1,2.45,5.6,4.0,[ {t:"Angles are INVARIANT to scale - a wrong square size mis-sizes positions but not angles.", b:true,c:C.navy},{t:"Angles are INVARIANT to global rotation - camera tilt / leveling doesn't change them.", b:true,c:C.navy},{t:"So many calibration errors hurt the 3D picture more than the numbers we actually report."},{t:"The 2D path additionally uses a facing-direction normalization + anatomical convention; the 3D path needs none of that.", c:C.body}],{gap:12,fontSize:12.5});
  pageFooter(s);
  s.addNotes("This is your single best defensive slide. The reported deliverable (angles) is invariant to scale and global rotation - exactly the invariances that neutralize the calibration weaknesses he'll probe.");
})();

// PERSISTENCE
(() => {
  const s = p.addSlide(); header(s, "Stage 7 · Persistence", "Storing the results");
  card(s, 0.5, 1.75, 6.1, 5.05, C.card2);
  s.addText("On the process-video request", {x:0.72,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.78,2.42,5.6,4.1,[ {t:"Download clip from MinIO to a temp file."},{t:"Route: layout=='side_by_side' (or source=='stereo_camera') AND calibration.npz exists -> 3D path; else 2D."},{t:"Run pose + triangulation; render the left-view overlay video."},{t:"Re-upload the overlay to MinIO as processed_object_name."},{t:"Runs synchronously inside the HTTP request (a scalability limit).", c:C.body}],{gap:10,fontSize:12.5});
  card(s, 6.8, 1.75, 6.05, 5.05, C.tint, C.blue);
  s.addText("pose_analysis document", {x:7.05,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.1,2.42,5.6,4.1,[ {t:"video_id, user_id, status, created_at."},{t:"result.frames - per-frame 2D keypoints + 2D angles (drives the graph)."},{t:"result.frames_3d - triangulated 3D points + true 3D angles (drives the 3D viewer)."},{t:"result.mode = 'stereo_3d', units = 'mm', fps, total_frames."},{t:"One document per video; upsert on re-processing."}],{gap:10,fontSize:12.5});
  pageFooter(s);
  s.addNotes("Note the dual payload: 2D frames keep the chart working; frames_3d powers the 3D viewer. Flag synchronous processing as the production gap (needs a job queue).");
})();

// FRONTEND / SYNC
(() => {
  const s = p.addSlide(); header(s, "Stage 8 · Visualization", "Frontend & time synchronization");
  card(s, 0.5, 1.85, 6.2, 4.95, C.card2);
  s.addText("Analysis page - 3 synced panels", {x:0.7,y:1.98,w:5.8,h:0.35,fontSize:12.5,bold:true,color:C.navy,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:0.85,y:2.5,w:2.75,h:1.75,fill:{color:C.tint},line:{color:C.blue,width:1.5}});
  s.addText("Overlay video\n(2D skeleton)",{x:0.85,y:2.5,w:2.75,h:1.75,align:"center",valign:"middle",fontSize:11,bold:true,color:C.navy,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:3.75,y:2.5,w:2.7,h:1.75,fill:{color:"FBEAF3"},line:{color:C.magenta,width:1.5}});
  s.addText("Rotatable 3D\nskeleton viewer",{x:3.75,y:2.5,w:2.7,h:1.75,align:"center",valign:"middle",fontSize:11,bold:true,color:C.navy,fontFace:F.body});
  s.addShape(p.ShapeType.rect,{x:0.85,y:4.4,w:5.6,h:1.75,fill:{color:C.white},line:{color:C.border,width:1.5}});
  s.addText("Joint-angle graph (ECharts) - angle vs time",{x:0.85,y:4.4,w:5.6,h:1.75,align:"center",valign:"middle",fontSize:11,bold:true,color:C.navy,fontFace:F.body});
  card(s, 6.9, 1.85, 5.95, 4.95, C.tint, C.blue);
  s.addText("Event-driven time sync", {x:7.15,y:2.0,w:5.5,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.2,2.55,5.5,2.6,[ {t:"On each animation frame the video dispatches a 'sync-time' window event with currentTime."},{t:"The graph moves a vertical marker line to that time (throttled ~20 fps)."},{t:"The 3D viewer jumps to frame = floor(time x fps)."},{t:"'analysis-complete' event invalidates the TanStack Query cache to refetch results."}],{gap:9,fontSize:12});
  s.addText("Keywords: SPA - custom DOM events - requestAnimationFrame - throttling - query invalidation - presigned playback URL",
    {x:7.2,y:5.55,w:5.5,h:1.1,fontSize:11,italic:true,color:C.navy,fontFace:F.body});
  pageFooter(s);
  s.addNotes("The three panels stay locked to the video clock via a lightweight custom-event bus - no heavy state library needed. Playback uses a short-lived presigned MinIO URL.");
})();

// 3D VIEWER
(() => {
  const s = p.addSlide(); header(s, "Visualization", "The 3D skeleton viewer");
  card(s, 0.5, 1.75, 6.1, 5.05, C.card2);
  s.addText("Rendering", {x:0.72,y:1.9,w:5.6,h:0.4,fontSize:14,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.78,2.42,5.6,4.1,[ {t:"Pure HTML Canvas - a hand-written 3D->2D projection (no Three.js)."},{t:"Manual yaw / pitch / zoom via mouse drag + wheel."},{t:"Auto-centers and scales to the reconstructed point cloud."},{t:"Draws bones (left/right/centre coloured), joints, and a floor grid."},{t:"Live HUD lists the current frame's 3D joint angles."}],{gap:10,fontSize:12.5});
  card(s, 6.8, 1.75, 6.05, 5.05, C.tint, C.blue);
  skeleton(s, 8.1, 2.1, 3.5, 4.0, false);
  s.addText("Reads frames_3d for the selected video; rotates with R_level so the athlete stands upright.",
    {x:7.05,y:6.15,w:5.6,h:0.55,fontSize:11.5,italic:true,color:C.navy,fontFace:F.body,align:"center"});
  pageFooter(s);
  s.addNotes("Deliberately lightweight (canvas, not a 3D engine) - fewer dependencies, full control over the projection and the biometrics HUD.");
})();

// DATA FLOW RECAP
(() => {
  const s = p.addSlide(); header(s, "Recap", "End-to-end data flow");
  const chips=[ ["Capture",C.blue],["Side-by-side\nMP4",C.blue],["MinIO +\nMongoDB",C.amber],["Split L / R",C.cyan],["MediaPipe\n2D x 2",C.cyan],["Triangulate\n-> 3D mm",C.cyan],["Angles +\nR_level",C.green],["Store\npose_analysis",C.amber],["Synced\nweb UI",C.navy] ];
  let x=0.55; const w=1.28, y=2.6, gap=0.12;
  chips.forEach((c,i)=>{ chip(s,x,y,w,1.0,c[0],C.card2,C.navy,10.5);
    s.addShape(p.ShapeType.roundRect,{x,y:y,w,h:1.0,rectRadius:0.06,fill:{type:"none"},line:{color:c[1],width:1.5}});
    if(i<chips.length-1) arrow(s,x+w,y+0.5,gap,0,C.blue,2); x+=w+gap; });
  card(s, 0.55, 4.3, 6.0, 2.4, C.tint, C.blue);
  s.addText("Offline, once", {x:0.8,y:4.42,w:5.5,h:0.35,fontSize:13,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,0.85,4.85,5.5,1.7,[ {t:"Stereo calibration -> calibration.npz (K, D, R, T)."},{t:"Floor leveling -> R_level."},{t:"Reused by every subsequent recording."}],{gap:7,fontSize:12});
  card(s, 6.85, 4.3, 6.0, 2.4, C.card2);
  s.addText("Per clip, on demand", {x:7.1,y:4.42,w:5.5,h:0.35,fontSize:13,bold:true,color:C.navy,fontFace:F.body});
  bullets(s,7.15,4.85,5.5,1.7,[ {t:"Triggered by the 'Extract Kinematics' button."},{t:"Everything from split -> 3D -> store runs server-side."},{t:"Results cached; UI refetches on completion."}],{gap:7,fontSize:12});
  pageFooter(s);
  s.addNotes("Use this to answer walk me through it end to end in 30 seconds. Calibration is the one-time offline branch; everything else runs per clip.");
})();

// AUTH/SECURITY
(() => {
  const s = p.addSlide(); header(s, "Cross-cutting", "Authentication & security");
  const g=(x,t,items,color)=>{ card(s,x,1.9,3.95,4.6,C.card2);
    badge(s,x+0.22,2.12,0.44,"",color);
    s.addText(t,{x:x+0.82,y:2.1,w:3.0,h:0.44,fontSize:14,bold:true,color:C.navy,fontFace:F.body,valign:"middle"});
    bullets(s,x+0.28,2.75,3.5,3.6,items,{gap:9,fontSize:12}); };
  g(0.5,"Authentication",[ "Login verifies bcrypt password hash.","Issues a signed JWT (HS256).","Stored in an HttpOnly cookie - not readable by JS (XSS-safer).","/me validates the cookie on load."],C.blue);
  g(4.65,"Authorization",[ "Role claim in the token (admin / user).","FastAPI dependencies: get_current_user, require_admin.","Users see only their own videos; admin can access all."],C.green);
  g(8.8,"Data access",[ "MinIO never exposed to the browser.","Short-lived (1-hour) presigned URLs for playback.","CORS locked to the known frontend origins.","Ownership checked on every video route."],C.amber);
  pageFooter(s);
  s.addNotes("HttpOnly cookie = the token is invisible to JavaScript, reducing XSS token theft. Presigned URLs mean the browser streams video without ever seeing storage credentials.");
})();

divider("Part 4", "Engineering Review", "Known limitations, hard questions, and the roadmap");

// LIMITATIONS
(() => {
  const s = p.addSlide(); header(s, "Maturity", "Known limitations (we volunteer these)");
  const items=[
    ["Synchronization","Software-level sequential reads; no genlock. Recording sync looser than calibration."],
    ["Correspondence","No epipolar check before triangulation - a MediaPipe L/R label flip would mis-pair joints."],
    ["Triangulation","Linear DLT, no per-joint outlier rejection, no bundle adjustment."],
    ["Temporal filtering","3D path runs raw (healing off) - no Kalman / One-Euro smoothing."],
    ["Calibration","~4.2 px RMS now; fit-set evaluation; median x 1.5 outlier rule is heuristic."],
    ["Frame rate","fps hardcoded to 30; nominal fps via frame duplication."],
    ["Confidence","Uses 'presence', not 'visibility'; no cross-view occlusion fallback."],
    ["Scope","Single person; synchronous processing; accuracy not yet quantified."]
  ];
  items.forEach((it,i)=>{ const col=i%2, cx=0.5+col*6.35, yy=1.8+Math.floor(i/2)*1.25;
    card(s,cx,yy,6.05,1.12,C.card2,C.border);
    s.addText(it[0],{x:cx+0.2,y:yy+0.12,w:5.7,h:0.32,fontSize:13,bold:true,color:C.red,fontFace:F.body});
    s.addText(it[1],{x:cx+0.2,y:yy+0.45,w:5.7,h:0.6,fontSize:11,color:C.body,fontFace:F.body}); });
  pageFooter(s);
  s.addNotes("Say these before he digs them out - it flips every one from a gotcha into evidence of self-awareness. Have the fix ready for each (next slides).");
})();

// HARD Q1
(() => {
  const s = p.addSlide(); header(s, "Anticipated Questions I", "The questions he WILL ask (1/2)");
  const qa=[
    ["How are the cameras synchronized? Prove it.","Not hardware-synced - sequential reads, few ms-tens of ms, variable. Error ~ speed x dt, worst on fast limbs. Fix: genlock or timestamp + interpolate."],
    ["How do you know left-joint-j = right-joint-j?","We pair by index and trust MediaPipe labeling. No epipolar check yet - a facing-away label flip would mis-pair. Fix: epipolar / essential-matrix gating."],
    ["What triangulation, and what does it optimize?","Linear DLT (SVD), minimizes algebraic error, no outlier rejection. Improve with optimal triangulation, RANSAC gating, bundle adjustment."],
    ["What's your confidence signal? Occlusion?","MediaPipe 'presence' > 0.5 per view; weak joint -> NaN. 'visibility' may suit occlusion better; no cross-view fallback."]
  ];
  let y=1.75;
  qa.forEach(q=>{ card(s,0.5,y,12.35,1.18,C.card2,C.border);
    s.addText([{text:"Q  ",options:{bold:true,color:C.blue}},{text:q[0],options:{bold:true,color:C.navy}}],{x:0.72,y:y+0.12,w:12,h:0.35,fontSize:13,fontFace:F.body});
    s.addText([{text:"A  ",options:{bold:true,color:C.green}},{text:q[1],options:{color:C.body}}],{x:0.72,y:y+0.5,w:12,h:0.62,fontSize:11.5,fontFace:F.body});
    y+=1.28; });
  pageFooter(s);
  s.addNotes("Rehearse these four out loud. Lead each answer with the honest admission, then the quantification, then the fix.");
})();

// HARD Q2
(() => {
  const s = p.addSlide(); header(s, "Anticipated Questions II", "The questions he WILL ask (2/2)");
  const qa=[
    ["MediaPipe already gives z - why triangulate?","Its z is monocular, relative, hip-anchored - not metric. Stereo gives TRUE mm depth from real geometry."],
    ["Units and scale - what if scale is wrong?","3D in left-cam frame, mm, scale from square size. But our OUTPUT is angles - invariant to scale and global rotation."],
    ["Latency and scale to many users?","process-video is synchronous in the request. Production needs an async job queue + GPU; frame duplication makes fps nominal."],
    ["What is your accuracy, in degrees?","Not yet quantified. Plan: DSLR side-on 2D reference + goniometer on static poses -> report mean absolute error."]
  ];
  let y=1.75;
  qa.forEach(q=>{ card(s,0.5,y,12.35,1.18,C.card2,C.border);
    s.addText([{text:"Q  ",options:{bold:true,color:C.blue}},{text:q[0],options:{bold:true,color:C.navy}}],{x:0.72,y:y+0.12,w:12,h:0.35,fontSize:13,fontFace:F.body});
    s.addText([{text:"A  ",options:{bold:true,color:C.green}},{text:q[1],options:{color:C.body}}],{x:0.72,y:y+0.5,w:12,h:0.62,fontSize:11.5,fontFace:F.body});
    y+=1.28; });
  pageFooter(s);
  s.addNotes("The accuracy in degrees answer must NOT invent a number. Say you haven't measured it and give the exact validation method. That honesty scores higher than a fake figure.");
})();

// FUTURE WORK
(() => {
  const s = p.addSlide(); header(s, "Roadmap", "Future work");
  const g=(x,t,items,color)=>{ card(s,x,1.85,3.95,4.8,C.card2);
    badge(s,x+0.22,2.07,0.44,"",color);
    s.addText(t,{x:x+0.82,y:2.05,w:3.0,h:0.44,fontSize:14,bold:true,color:C.navy,fontFace:F.body,valign:"middle"});
    bullets(s,x+0.28,2.7,3.5,3.8,items,{gap:10,fontSize:12}); };
  g(0.5,"Accuracy",[ "Hardware genlock / trigger sync","Epipolar correspondence gating","Optimal triangulation + RANSAC","Bundle adjustment (n-camera)"],C.blue);
  g(4.65,"Robustness",[ "Kalman / One-Euro temporal filter","Cross-view occlusion recovery","Read true fps (remove 30 hardcode)","Larger calibration target + held-out RMS"],C.green);
  g(8.8,"Product",[ "Async job queue + progress","GPU inference","Multi-person + view association","Quantified accuracy report"],C.amber);
  pageFooter(s);
  s.addNotes("Each future-work item maps 1:1 to a limitation - show that you have a concrete plan, not just a list of problems.");
})();

// VALIDATION
(() => {
  const s = p.addSlide(); header(s, "Validation Plan", "Proving accuracy (what we'll measure)");
  const g=(x,t,items,color)=>{ card(s,x,1.9,3.95,3.6,C.card2);
    s.addText(t,{x:x+0.25,y:2.05,w:3.5,h:0.4,fontSize:14,bold:true,color:color,fontFace:F.body});
    bullets(s,x+0.28,2.55,3.5,2.9,items,{gap:9,fontSize:12}); };
  g(0.5,"Reference: DSLR 2D",[ "Nikon D3400 on tripod, side-on.","Perpendicular to the plane of motion.","Clean planar joint-angle reference.","Record at 30 fps to match pipeline."],C.blue);
  g(4.65,"Reference: goniometer",[ "Physically measure static joint angles.","Compare to the system's 3D angle for the same pose.","Simple, cheap ground truth."],C.green);
  g(8.8,"Metric",[ "Mean absolute error (degrees).","Per joint + overall.","Report across poses and speeds.","Track improvement vs baseline."],C.amber);
  card(s, 0.5, 5.7, 12.35, 1.05, C.tint, C.blue);
  s.addText("Honesty rule: until measured, we state 'not yet quantified' and show the method - never a fabricated number.",
    {x:0.7,y:5.8,w:12,h:0.85,fontSize:12.5,bold:true,italic:true,color:C.navy,fontFace:F.body,valign:"middle"});
  pageFooter(s);
  s.addNotes("Having a concrete validation protocol ready is often worth more than a number - it shows you know how to prove the system, not just build it.");
})();

// GLOSSARY
(() => {
  const s = p.addSlide(); header(s, "Reference", "Key terms glossary");
  const terms=[
    ["Intrinsics / Extrinsics","Internal optics (focal length, principal point) / rotation+translation between the two cameras."],
    ["Epipolar geometry","A point in one view lies on a line in the other (fundamental/essential matrix) - used to validate matches."],
    ["Triangulation (DLT)","Intersecting two back-projected rays to recover a 3D point; Direct Linear Transform solves it linearly."],
    ["Reprojection error / RMS","Pixel gap between detected and reprojected points; RMS summarizes calibration accuracy (< 1 px target)."],
    ["Bundle adjustment","Jointly optimizing 3D points + camera params to minimize total reprojection error (gold standard)."],
    ["Baseline","Distance between the two camera centres (|T|); wider = better depth precision, harder correspondence."],
    ["Genlock","Hardware synchronization of cameras to a common trigger/clock."],
    ["Rolling vs global shutter","Rows exposed sequentially vs all at once; rolling shutter skews fast motion."],
    ["Presence vs visibility","MediaPipe: landmark is in-image vs landmark is visible (not occluded)."],
    ["Kalman / One-Euro filter","Temporal filters that smooth jittery keypoints while tracking real motion."]
  ];
  terms.forEach((t,i)=>{ const col=i%2, cx=0.5+col*6.35, yy=1.7+Math.floor(i/2)*1.02;
    s.addText([{text:t[0]+"  -  ",options:{bold:true,color:C.navy}},{text:t[1],options:{color:C.body}}],
      {x:cx,y:yy,w:6.05,h:0.95,fontSize:10.8,fontFace:F.body,valign:"top"});
  });
  pageFooter(s);
  s.addNotes("A definitions question is a competence test. If asked any of these, answer in one clean sentence - don't ramble.");
})();

// CLOSING
(() => {
  const s = p.addSlide(); s.background = { color: C.navy };
  s.addShape(p.ShapeType.ellipse,{x:10.8,y:-1.2,w:4.0,h:4.0,fill:{color:"1F2F52"}});
  s.addShape(p.ShapeType.ellipse,{x:-1.4,y:5.0,w:3.6,h:3.6,fill:{color:"1F2F52"}});
  s.addText("Thank you", { x: 0.9, y: 2.4, w: 10, h: 1.0, fontSize: 46, bold: true, color: C.white, fontFace: F.head });
  s.addText("Questions & discussion", { x: 0.92, y: 3.5, w: 9, h: 0.6, fontSize: 20, color: "AEC2E8", fontFace: F.body });
  s.addText("Remember: state the mechanism, volunteer the limitation, give the fix. Honesty > a confident wrong answer.",
    { x: 0.92, y: 4.5, w: 9.5, h: 0.6, fontSize: 13, italic: true, color: "8FA6D2", fontFace: F.body });
  s.addNotes("Close calm. Invite the hard questions - you've prepared for them. If cornered: I haven't measured/built that - here's why it matters and how I'd approach it.");
})();

p.writeFile({ fileName: "/sessions/pensive-hopeful-davinci/mnt/FYP/SportPose_Technical_Deck.pptx" }).then(f => console.log("WROTE", f)).catch(e => console.error("ERR", e));
("ERR", e));
