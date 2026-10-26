"""Build the 18-keypoint YOLO-pose dataset from the studio recordings.

    python data/prepare_studio.py --studio path/to/studio_dataset

Reads studio_dataset/annotations/{train,val}/<split>/Camera_<L|R>.xml (CVAT) and the matching
videos in studio_dataset/videos/, and writes datasets/studio_yolo/{images,labels}/{train,val}.
"""
import argparse, os, glob
import xml.etree.ElementTree as ET
from collections import Counter
import cv2

DEF_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NKP = 18
FLIP_IDX = [0,1,3,2,5,4,7,6,9,8,11,10,13,12,15,14,17,16]
BOX_PAD = 0.08
DENSE_SUBSAMPLE = 5

def parse_keyframes(path):
    """Hand-annotated frames of a CVAT track file -> {frame: {kp: (x, y, visibility)}}.
    Visibility: 2 = visible, 1 = occluded, 0 = outside the image."""
    root = ET.parse(path).getroot()
    frames = {}
    for tr in root.findall(".//track"):
        for sk in tr.findall("skeleton"):
            f = int(sk.get("frame")); kf = False; pts = {}
            for p in sk.findall("points"):
                try: idx = int(p.get("label").split("_")[0])
                except (ValueError, AttributeError): continue
                x, y = map(float, p.get("points").split(","))
                out = p.get("outside") == "1"; occ = p.get("occluded") == "1"
                if p.get("keyframe") == "1": kf = True
                pts[idx] = (x, y, 0 if out else (1 if occ else 2))
            if kf: frames.setdefault(f, {}).update(pts)
    return frames

def is_dense(frames):
    """True for tracks annotated on every frame (these are sub-sampled to every 5th)."""
    ks = sorted(frames)
    if len(ks) < 5: return False
    return Counter(b-a for a,b in zip(ks,ks[1:])).most_common(1)[0][0] == 1

def yolo_line(pts, W, H):
    """One YOLO-pose label line: person box from the keypoints (+8% padding), then 18 x/y/v."""
    xs=[pts[i][0] for i in pts if pts[i][2]>0]; ys=[pts[i][1] for i in pts if pts[i][2]>0]
    if not xs: return None
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); bw,bh=x1-x0,y1-y0
    x0-=bw*BOX_PAD; x1+=bw*BOX_PAD; y0-=bh*BOX_PAD; y1+=bh*BOX_PAD
    x0,y0=max(0,x0),max(0,y0); x1,y1=min(W,x1),min(H,y1)
    cx,cy=(x0+x1)/2/W,(y0+y1)/2/H; ww,hh=(x1-x0)/W,(y1-y0)/H
    parts=[f"0 {cx:.6f} {cy:.6f} {ww:.6f} {hh:.6f}"]
    for i in range(NKP):
        if i in pts: x,y,v=pts[i]; parts.append(f"{x/W:.6f} {y/H:.6f} {v}")
        else: parts.append("0 0 0")
    return " ".join(parts)

def find_video(root, split_rel, cam):
    """videos/<subset>/<split>/Camera_<cam>.<ext> for an annotation file. Folder and file names are
    matched ignoring upper/lower case, so it behaves the same on Windows and Linux."""
    for ext in (".mp4",".MP4",".mov",".avi"):
        p=os.path.join(root,"videos",split_rel,f"Camera_{cam}{ext}")
        if os.path.exists(p): return p
    d=os.path.join(root,"videos")
    for part in split_rel.split("/"):
        if not os.path.isdir(d): return None
        match=[n for n in os.listdir(d) if n.lower()==part.lower()]
        if not match: return None
        d=os.path.join(d,match[0])
    if not os.path.isdir(d): return None
    want={f"camera_{cam}{e}".lower() for e in (".mp4",".mov",".avi")}
    for n in sorted(os.listdir(d)):
        if n.lower() in want: return os.path.join(d,n)
    return None

def process(xml_path, studio, out, subset, stats):
    """Extract the annotated frames of one recording/camera as JPG + label files."""
    rel = os.path.relpath(xml_path, os.path.join(studio,"annotations"))
    parts = rel.replace("\\","/").split("/")
    split_rel = "/".join(parts[:-1]); cam = parts[-1].split("_")[1].split(".")[0]
    tag = f"{split_rel.replace('/','_')}_{cam}"
    frames = parse_keyframes(xml_path)
    if not frames: print(f"  [skip] {rel}"); return
    if is_dense(frames):
        keep=sorted(f for f in frames if f%DENSE_SUBSAMPLE==0); note=f"dense->every {DENSE_SUBSAMPLE}th"
    else:
        keep=sorted(frames); note="manual keyframes"
    video=find_video(studio, split_rel, cam)
    if not video: print(f"  [WARN] no video {split_rel} {cam}"); return
    cap=cv2.VideoCapture(video); nfr=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    W=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920; H=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
    idir=os.path.join(out,"images",subset); ldir=os.path.join(out,"labels",subset)
    os.makedirs(idir,exist_ok=True); os.makedirs(ldir,exist_ok=True)
    wrote=0
    for f in keep:
        if f>=nfr: continue
        line=yolo_line(frames[f],W,H)
        if line is None: continue
        cap.set(cv2.CAP_PROP_POS_FRAMES,f); ok,img=cap.read()
        if not ok or img is None: continue
        stem=f"{tag}_f{f:05d}"
        cv2.imwrite(os.path.join(idir,stem+".jpg"),img,[cv2.IMWRITE_JPEG_QUALITY,95])
        open(os.path.join(ldir,stem+".txt"),"w").write(line+"\n"); wrote+=1
    cap.release(); stats[subset]+=wrote
    print(f"  {rel:32s} {note:20s} kept {len(keep):>3} -> {wrote:>3} imgs")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base", default=DEF_BASE)
    ap.add_argument("--studio", default=None, help="studio_dataset (default: <base>/studio_dataset)")
    args=ap.parse_args()
    base=os.path.abspath(args.base)
    studio=os.path.abspath(args.studio) if args.studio else os.path.join(base,"studio_dataset")
    out=os.path.join(base,"datasets","studio_yolo")
    os.makedirs(out,exist_ok=True)
    print(f"studio_dataset: {studio}\noutput        : {out}")
    stats=Counter()
    for subset in ("train","val"):
        xmls=sorted(glob.glob(os.path.join(studio,"annotations",subset,"*","Camera_*.xml")))
        print(f"\n=== {subset.upper()} ({len(xmls)} files) ===")
        for x in xmls: process(x,studio,out,subset,stats)
    yaml_path=os.path.join(out,"studio_pose.yaml")
    with open(yaml_path,"w") as fh:
        fh.write(f"path: {out}\ntrain: images/train\nval: images/val\n\n")
        fh.write(f"kpt_shape: [{NKP}, 3]\nflip_idx: {FLIP_IDX}\n\nnames:\n  0: person\n")
    print(f"\nDONE. train={stats['train']} val={stats['val']}\nyaml -> {yaml_path}")

if __name__=="__main__": main()
