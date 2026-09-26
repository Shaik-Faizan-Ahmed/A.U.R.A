"""
AURA image-detector accuracy validation harness. Same pattern as
run_text_eval.py, for the image modality.

Requires backend/data/validation/image/samples.jsonl to already exist --
run build_image_manifest.py first (it builds that file from whatever's in
data/validation/image/raw/{real,ai}/).

Usage (from backend/, inside the project venv):
    python validation/build_image_manifest.py   # once, after adding images
    python validation/run_image_eval.py
"""

from __future__ import annotations

import sys
import json
import csv
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import env_setup  # noqa: F401

from models.image_detector import analyze_image  # noqa: E402
import config  # noqa: E402

DATASET_PATH = BACKEND_DIR / "data" / "validation" / "image" / "samples.jsonl"
RESULTS_CSV = BACKEND_DIR / "data" / "validation" / "image" / "results.csv"
RESULTS_MD = BACKEND_DIR / "data" / "validation" / "image" / "RESULTS.md"


def load_dataset(path: Path):
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def run(samples):
    results = []
    total = len(samples)
    for i, sample in enumerate(samples, 1):
        print(f"[{i}/{total}] {sample['id']} (ground truth={sample['ground_truth']}, "
              f"proxy_group={sample['proxy_group']}) ...", flush=True)
        try:
            signals, meta = analyze_image(sample["path"])
        except Exception as e:
            print(f"    -> FAILED to analyze: {e}")
            continue
        score = meta["fused_score"]
        predicted = "ai" if score >= config.FLAG_THRESHOLD else "real"
        results.append({
            "id": sample["id"],
            "proxy_group": sample["proxy_group"],
            "ground_truth": sample["ground_truth"],
            "predicted": predicted,
            "score": score,
            "confidence": meta.get("fused_confidence"),
            "correct": predicted == sample["ground_truth"],
        })
        print(f"    -> score={score:.3f}  predicted={predicted}", flush=True)
    return results


def write_csv(results, path: Path):
    if not results:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)


def compute_group_metrics(rows):
    from sklearn.metrics import confusion_matrix, roc_auc_score

    if not rows:
        return None

    y_true = [1 if r["ground_truth"] == "ai" else 0 for r in rows]
    y_pred = [1 if r["predicted"] == "ai" else 0 for r in rows]
    y_score = [r["score"] for r in rows]

    n = len(rows)
    correct = sum(1 for r in rows if r["correct"])
    accuracy = correct / n

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    precision = tp / (tp + fp) if (tp + fp) > 0 else float("nan")
    recall = tp / (tp + fn) if (tp + fn) > 0 else float("nan")
    fpr = fp / (fp + tn) if (fp + tn) > 0 else float("nan")
    fnr = fn / (fn + tp) if (fn + tp) > 0 else float("nan")
    f1 = (2 * precision * recall / (precision + recall)
          if (precision == precision and recall == recall and (precision + recall) > 0)
          else float("nan"))

    auc = float("nan")
    if len(set(y_true)) == 2:
        try:
            auc = roc_auc_score(y_true, y_score)
        except Exception:
            pass

    return {
        "n": n, "accuracy": accuracy, "precision": precision, "recall": recall,
        "fpr": fpr, "fnr": fnr, "f1": f1, "auc": auc,
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
    }


def fmt(x):
    return "n/a" if x != x else f"{x:.3f}"


def write_markdown(results, path: Path):
    overall = compute_group_metrics(results)
    groups = sorted(set(r["proxy_group"] for r in results))
    per_group = {g: compute_group_metrics([r for r in results if r["proxy_group"] == g])
                 for g in groups}

    lines = []
    lines.append("# AURA image-detector accuracy validation results\n")
    lines.append(f"Run against `data/validation/image/samples.jsonl` ({len(results)} "
                 f"labeled samples) using the real `analyze_image()` detector at "
                 f"`config.FLAG_THRESHOLD = {config.FLAG_THRESHOLD}` (image/video "
                 f"still share the original, unvalidated threshold -- see config.py).\n")

    lines.append("## Overall\n")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Samples | {overall['n']} |")
    lines.append(f"| Accuracy | {fmt(overall['accuracy'])} |")
    lines.append(f"| Precision | {fmt(overall['precision'])} |")
    lines.append(f"| Recall (TPR) | {fmt(overall['recall'])} |")
    lines.append(f"| False positive rate | {fmt(overall['fpr'])} |")
    lines.append(f"| False negative rate | {fmt(overall['fnr'])} |")
    lines.append(f"| F1 | {fmt(overall['f1'])} |")
    lines.append(f"| ROC-AUC | {fmt(overall['auc'])} |")
    lines.append(f"| Confusion matrix | TP={overall['tp']} FP={overall['fp']} "
                 f"TN={overall['tn']} FN={overall['fn']} |\n")

    lines.append("## By quality group (image_detector.py's real _quality_group())\n")
    lines.append("| Group | N | Accuracy | FPR | FNR | AUC |")
    lines.append("|---|---|---|---|---|---|")
    for g in groups:
        m = per_group[g]
        lines.append(f"| {g} | {m['n']} | {fmt(m['accuracy'])} | "
                     f"{fmt(m['fpr'])} | {fmt(m['fnr'])} | {fmt(m['auc'])} |")
    lines.append("")

    lines.append("## Per-sample results\n")
    lines.append("See `results.csv` in this folder for the full per-sample breakdown.\n")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    if not DATASET_PATH.exists():
        print(f"No dataset found at {DATASET_PATH}.")
        print("Run: python validation/build_image_manifest.py first "
              "(after dropping images into data/validation/image/raw/{real,ai}/).")
        sys.exit(1)

    samples = load_dataset(DATASET_PATH)
    print(f"Loaded {len(samples)} labeled samples from {DATASET_PATH}")
    print("Running the real image detector on each sample (neural ensemble + "
          "frequency + face + metadata forensics) -- first run may download "
          "the HuggingFace classifiers used by the neural ensemble.\n")

    results = run(samples)
    if not results:
        print("No samples were successfully analyzed.")
        sys.exit(1)

    write_csv(results, RESULTS_CSV)
    write_markdown(results, RESULTS_MD)

    overall = compute_group_metrics(results)
    print("\n=== SUMMARY ===")
    print(f"Accuracy: {fmt(overall['accuracy'])}  "
          f"FPR: {fmt(overall['fpr'])}  FNR: {fmt(overall['fnr'])}  "
          f"AUC: {fmt(overall['auc'])}")
    print(f"Full results written to:\n  {RESULTS_CSV}\n  {RESULTS_MD}")


if __name__ == "__main__":
    main()
