"""Convert 18-keypoint YOLO-pose datasets into one COCO keypoint JSON for MMPose.

    python data/yolo_to_coco.py --datasets datasets/studio_yolo datasets/cocowb_yolo --split train --out coco/train.json
    python data/yolo_to_coco.py --datasets datasets/studio_yolo --split val --out coco/val.json

Image paths are written as absolute paths, so the config uses data_root='' and data_prefix=dict(img='').
"""
import argparse, os, glob, json
import cv2

NKP = 18
KP_NAMES = ["Nose","Neck","L_Shoulder","R_Shoulder","L_Elbow","R_Elbow","L_Wrist",
            "R_Wrist","L_Finger","R_Finger","L_Hip","R_Hip","L_Knee","R_Knee",
            "L_Ankle","R_Ankle","L_Toe","R_Toe"]
SKELETON = [[2,1],[1,3],[1,4],[3,5],[5,7],[7,9],[4,6],[6,8],[8,10],
            [2,11],[2,12],[11,13],[13,15],[15,17],[12,14],[14,16],[16,18]]

def main():
    """Merge YOLO-pose datasets (images/<split>, labels/<split>) into one COCO keypoint JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--datasets", nargs="+", required=True,
                    help="one or more YOLO dataset dirs (each has images/<split>, labels/<split>)")
    ap.add_argument("--split", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    images, annotations = [], []
    img_id = 1; ann_id = 1
    for ds in args.datasets:
        idir = os.path.join(ds, "images", args.split)
        ldir = os.path.join(ds, "labels", args.split)
        imgs = sorted(glob.glob(os.path.join(idir, "*.jpg")) +
                      glob.glob(os.path.join(idir, "*.png")) +
                      glob.glob(os.path.join(idir, "*.jpeg")))
        print(f"{ds} [{args.split}]: {len(imgs)} images")
        for ip in imgs:
            stem = os.path.splitext(os.path.basename(ip))[0]
            lp = os.path.join(ldir, stem + ".txt")
            if not os.path.exists(lp): continue
            im = cv2.imread(ip)
            if im is None: continue
            H, W = im.shape[:2]
            images.append(dict(id=img_id, file_name=os.path.abspath(ip),
                               width=W, height=H))
            for line in open(lp).read().strip().splitlines():
                t = line.split()
                if len(t) < 5 + NKP*3: continue
                cx,cy,w,h = [float(x) for x in t[1:5]]
                bx,by,bw,bh = (cx-w/2)*W,(cy-h/2)*H,w*W,h*H
                kp = []; nk = 0
                for i in range(NKP):
                    x = float(t[5+i*3])*W; y = float(t[5+i*3+1])*H; v = int(float(t[5+i*3+2]))
                    kp += [x, y, v]
                    if v > 0: nk += 1
                annotations.append(dict(id=ann_id, image_id=img_id, category_id=1,
                    bbox=[bx,by,bw,bh], area=float(bw*bh), iscrowd=0,
                    num_keypoints=nk, keypoints=kp))
                ann_id += 1
            img_id += 1

    coco = dict(images=images, annotations=annotations,
        categories=[dict(id=1, name="person", supercategory="person",
                         keypoints=KP_NAMES, skeleton=SKELETON)])
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    json.dump(coco, open(args.out, "w"))
    print(f"WROTE {args.out}: {len(images)} images, {len(annotations)} anns")

if __name__ == "__main__":
    main()
