"""
AURA text-detector accuracy validation harness.

Runs the REAL text detector (models/text_detector.py -> analyze_text) --
same code path jobs.py uses in production -- against a hand-built, labeled
dataset (data/validation/text/samples.jsonl), and reports real accuracy,
precision/recall, false-positive/false-negative rates, and ROC-AUC, plus a
per-written-language breakdown so we can see whether the ESL threshold
calibration in text_detector.py is actually doing anything.

This is deliberately NOT a pytest file: it makes real gpt2 forward passes
(slow, and on first run needs internet access to download gpt2 weights
from HuggingFace) and is meant to be run by a human on demand, not on
every commit. See README.md in this folder for how to run it and what the
numbers mean.

Usage (from backend/, inside the project venv):
    python validation/run_text_eval.py
"""

from __future__ import annotations

import sys
import os
import json
import csv
from pathlib import Path

# --- path setup: this file lives in backend/validation/, one level below
# backend/ itself, so we need backend/ on sys.path to import env_setup,
# models.text_detector, and config the same way main.py / conftest.py do.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import env_setup  # noqa: F401 -- MUST be imported before anything that pulls in torch/transformers, see env_setup.py's own docstring

from models.text_detector import analyze_text  # noqa: E402
import config  # noqa: E402

DATASET_PATH = BACKEND_DIR / "data" / "validation" / "text" / "samples.jsonl"
RESULTS_CSV = BACKEND_DIR / "data" / "validation" / "text" / "results.csv"
RESULTS_MD = BACKEND_DIR / "data" / "validation" / "text" / "RESULTS.md"


def load_dataset(path: Path):
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def run(samples):
    """Runs the real detector on every sample. Returns a list of result dicts."""
    results = []
    total = len(samples)
    for i, sample in enumerate(samples, 1):
        print(f"[{i}/{total}] {sample['id']} ({sample['written_language']}, "
              f"ground truth={sample['ground_truth']}) ...", flush=True)
        signals, meta = analyze_text(sample["text"])
        doc_signal = next(
            s for s in signals if s["signal_name"] == "ai_ensemble_document"
        )
        score = doc_signal["raw_score"]
        predicted = "ai" if score >= config.FLAG_THRESHOLD else "human"
        results.append({
            "id": sample["id"],
            "topic": sample["topic"],
            "written_language": sample["written_language"],
            "ground_truth": sample["ground_truth"],
            "predicted": predicted,
            "score": score,
            "confidence": doc_signal["confidence"],
            "detected_language": meta["detected_language"],
            "calibration_applied": meta["calibration_applied"],
            "correct": predicted == sample["ground_truth"],
        })
        print(f"    -> score={score:.3f}  predicted={predicted}  "
              f"detected_lang={meta['detected_language']}  "
              f"calibration_applied={meta['calibration_applied']}", flush=True)
    return results


def write_csv(results, path: Path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)


def compute_group_metrics(rows):
    """rows: list of result dicts (already filtered to the group of interest)."""
    from sklearn.metrics import confusion_matrix, roc_auc_score

    if not rows:
        return None

    y_true = [1 if r["ground_truth"] == "ai" else 0 for r in rows]
    y_pred = [1 if r["predicted"] == "ai" else 0 for r in rows]
    y_score = [r["score"] for r in rows]

    n = len(rows)
    correct = sum(1 for r in rows if r["correct"])
    accuracy = correct / n

    tn = fp = fn = tp = 0
    labels_present = set(y_true) | set(y_pred)
    if len(labels_present) >= 1:
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

    precision = tp / (tp + fp) if (tp + fp) > 0 else float("nan")
    recall = tp / (tp + fn) if (tp + fn) > 0 else float("nan")  # a.k.a. true positive rate
    fpr = fp / (fp + tn) if (fp + tn) > 0 else float("nan")
    fnr = fn / (fn + tp) if (fn + tp) > 0 else float("nan")
    f1 = (2 * precision * recall / (precision + recall)
          if (precision == precision and recall == recall and (precision + recall) > 0)
          else float("nan"))

    auc = float("nan")
    if len(set(y_true)) == 2:  # AUC undefined with only one class present
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
    return "n/a" if x != x else f"{x:.3f}"  # x != x catches NaN


def write_markdown(results, path: Path):
    overall = compute_group_metrics(results)

    languages = sorted(set(r["written_language"] for r in results))
    per_lang = {lang: compute_group_metrics([r for r in results if r["written_language"] == lang])
                for lang in languages}

    calibration_count = sum(1 for r in results if r["calibration_applied"])
    lang_mismatches = [r for r in results if r["detected_language"] != r["written_language"]]

    lines = []
    lines.append("# AURA text-detector accuracy validation results\n")
    lines.append(f"Run against `data/validation/text/samples.jsonl` "
                 f"({len(results)} labeled samples: 18 human-written-style, "
                 f"18 AI-generated, balanced across 12 topics; 24 English, "
                 f"6 Spanish, 6 French) using the real `analyze_text()` "
                 f"detector at `config.FLAG_THRESHOLD = {config.FLAG_THRESHOLD}`.\n")

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

    lines.append("## By written language (proxy group for the ESL calibration)\n")
    lines.append("| Language | N | Accuracy | FPR | FNR | AUC |")
    lines.append("|---|---|---|---|---|---|")
    for lang in languages:
        m = per_lang[lang]
        lines.append(f"| {lang} | {m['n']} | {fmt(m['accuracy'])} | "
                     f"{fmt(m['fpr'])} | {fmt(m['fnr'])} | {fmt(m['auc'])} |")
    lines.append("")

    lines.append("## Calibration diagnostics\n")
    lines.append(f"- ESL threshold calibration (`calibration_applied=True`) fired on "
                 f"{calibration_count}/{len(results)} samples.")
    lines.append(f"- `langdetect` vs. our own `written_language` label disagreed on "
                 f"{len(lang_mismatches)}/{len(results)} samples"
                 + (": " + ", ".join(f"{r['id']} (labeled {r['written_language']}, "
                                      f"detected {r['detected_language']})"
                                      for r in lang_mismatches) if lang_mismatches else "."))
    lines.append("")
    lines.append("**Reading this**: the ESL multiplier in `text_detector.py` is keyed off "
                 "`langdetect`'s guess of the *submission's own language*, not the "
                 "writer's native-language background. That only matters here if the "
                 "es/fr samples show `calibration_applied=True` while the en samples "
                 "don't -- if so, the mechanism works as coded, but note that it only "
                 "protects submissions actually written in another language. Real ERP "
                 "submissions are overwhelmingly written in English regardless of the "
                 "student's background (an ESL student writing an English-language "
                 "essay), so this safeguard may see near-zero real-world activation "
                 "even though it tests correctly here -- worth flagging as a design "
                 "gap, not just a bug, if the numbers bear it out.\n")

    lines.append("## Per-sample results\n")
    lines.append("See `results.csv` in this folder for the full per-sample breakdown "
                 "(score, predicted label, detected language, calibration flag).\n")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    if not DATASET_PATH.exists():
        print(f"Dataset not found at {DATASET_PATH}")
        sys.exit(1)

    samples = load_dataset(DATASET_PATH)
    print(f"Loaded {len(samples)} labeled samples from {DATASET_PATH}")
    print("Running the real text detector on each sample -- first run will be slow "
          "(gpt2 self-downloads via HuggingFace if not already cached under "
          "backend/.hf_cache). Subsequent runs are fast.\n")

    results = run(samples)
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
