"""Remove recordings from the validation JSON (by default split_27, which was set aside).

    python data/make_clean_val_json.py --src coco/val.json --out coco/val_clean.json
"""
import argparse, json, os


def main():
    """Drop every image (and its annotations) whose file name contains one of the excluded splits."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="coco/val.json")
    ap.add_argument("--out", default="coco/val_clean.json")
    ap.add_argument("--exclude", nargs="+", default=["split_27"])
    args = ap.parse_args()

    d = json.load(open(args.src))
    keep = [im for im in d["images"]
            if not any(s.lower() in os.path.basename(im["file_name"]).lower() for s in args.exclude)]
    ids = {im["id"] for im in keep}
    dropped = len(d["images"]) - len(keep)
    d["images"] = keep
    d["annotations"] = [a for a in d["annotations"] if a["image_id"] in ids]
    json.dump(d, open(args.out, "w"))
    print(f"kept {len(keep)} images / {len(d['annotations'])} annotations; dropped {dropped} ({', '.join(args.exclude)})")
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
