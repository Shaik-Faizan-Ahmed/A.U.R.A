"""
Builds backend/data/validation/image/samples.jsonl from whatever images are
sitting in backend/data/validation/image/raw/{real,ai}/.

Doesn't score anything itself -- just labels each file by which folder it's
in and tags it with the same quality_group image_detector.py's real
_quality_group() would assign in production, so the validation breakdown
(run_image_eval.py) lines up with how the live fairness dashboard actually
buckets images, not a separately-invented grouping.

Usage (from backend/, inside the project venv):
    python validation/build_image_manifest.py
"""

from __future__ import annotations

import sys
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import env_setup  # noqa: F401 -- see env_setup.py's own docstring on import order

from models.image_detector import _quality_group  # noqa: E402

RAW_DIR = BACKEND_DIR / "data" / "validation" / "image" / "raw"
OUT_PATH = BACKEND_DIR / "data" / "validation" / "image" / "samples.jsonl"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


def _list_images(folder: Path):
    if not folder.exists():
        return []
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and p.name != "README.txt"
    )


def main():
    real_files = _list_images(RAW_DIR / "real")
    ai_files = _list_images(RAW_DIR / "ai")

    if not real_files and not ai_files:
        print(f"No images found under {RAW_DIR}/real/ or {RAW_DIR}/ai/.")
        print("Drop some real photos and some AI-generated images in those "
              "folders (see the README.txt in each), then re-run this.")
        sys.exit(1)

    print(f"Found {len(real_files)} real images and {len(ai_files)} AI images.")
    if min(len(real_files), len(ai_files)) < 5:
        print("Warning: fewer than 5 samples in one class -- metrics from "
              "this few samples will be noisy. Fine for a first smoke test, "
              "not for a real accuracy claim.")

    samples = []
    for path in real_files:
        samples.append({
            "id": path.stem,
            "path": str(path),
            "ground_truth": "real",
            "proxy_group": _quality_group(str(path)),
        })
    for path in ai_files:
        samples.append({
            "id": path.stem,
            "path": str(path),
            "ground_truth": "ai",
            "proxy_group": _quality_group(str(path)),
        })

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")

    print(f"Wrote {len(samples)} labeled samples to {OUT_PATH}")
    print("Next: python validation/run_image_eval.py")


if __name__ == "__main__":
    main()
