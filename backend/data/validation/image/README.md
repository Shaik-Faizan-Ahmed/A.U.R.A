# Image validation dataset

Harness is built. Dataset is empty until you add images.

## How to use

1. Drop real (non-AI) photos into `raw/real/`.
2. Drop AI-generated / deepfake images into `raw/ai/`.
   (Any common format Pillow opens: jpg/png/webp/etc. Flat folders, no
   subfolders needed.)
3. From `backend/`, inside the venv:
   ```powershell
   python validation/build_image_manifest.py
   python validation/run_image_eval.py
   ```

`build_image_manifest.py` scans both folders, labels each file by which
folder it came from, and tags it with `image_detector.py`'s real
`_quality_group()` classification (`low_res_image` / `standard_image`) --
the same grouping the live fairness dashboard uses -- so the validation
breakdown lines up with production, not a separately invented one.

`run_image_eval.py` then runs the real `analyze_image()` on every sample
(same code path `jobs.py` now actually calls) and writes `results.csv` +
`RESULTS.md` with accuracy/precision/recall/FPR/FNR/AUC, overall and
per-quality-group -- same structure as `../text/RESULTS.md`.

## Why this wasn't pre-populated with data

Unlike the text dataset (which could be hand-authored -- one side is
literally AI-generated text, the other hand-written to a human style), an
image dataset needs actual image files. No image-generation tool was
available to produce a synthetic AI-image class, and downloading other
people's photos off the web to fill the "real" class isn't something to do
without knowing the license/rights on each one. This needs actual images
supplied by whoever runs it.

## Note on the flagging threshold

`run_image_eval.py` uses `config.FLAG_THRESHOLD` (0.6) -- the same
threshold `jobs.py` uses for image submissions, which (unlike text's
`TEXT_FLAG_THRESHOLD`) has never been recalibrated against real data.
Once you have real results here, treat a badly-off threshold as an
expected possible finding, not a bug in the harness -- that's exactly what
the text validation caught for text.
