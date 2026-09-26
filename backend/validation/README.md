# AURA accuracy validation

This started as the Phase 0 "labeled validation set" gap and has since grown
to cover the wiring gap it uncovered: `jobs.py` was never actually calling
any of the three real detectors -- see "The jobs.py wiring fix" below.

## What's here now

- **Text**: `run_text_eval.py` + `../data/validation/text/samples.jsonl` --
  36 labeled samples (EN/ES/FR). Already run once -- see `RESULTS.md` in
  that folder. Found: English AUC 1.000 (threshold was miscalibrated, now
  fixed via `config.TEXT_FLAG_THRESHOLD`); Spanish AUC ~0.556 (near
  chance); French AUC 0.000 (exactly inverted). Non-English text is now
  routed to human review unconditionally in `jobs.py` rather than trusted.
- **Image**: `run_image_eval.py` + `build_image_manifest.py` -- harness
  built, dataset empty (needs real image files; see
  `../data/validation/image/README.md`).
- **Video**: not started. Same pattern would apply; see
  `../data/validation/video/README.md`.

## The jobs.py wiring fix

Separately from the accuracy numbers above, `jobs.py`'s `_run_analysis()`
was found to be calling a Phase-1-stub fixture function
(`_fixture_signals()`, a fake score derived from `len(content_ref)`)
instead of `analyze_text()` / `analyze_image()` / `analyze_video()` --
meaning no real submission through the live API was ever scored by any of
the actual detectors, regardless of how good the detectors themselves
were. This has been fixed: `jobs.py` now calls the real detectors, uses
each detector's own suggested proxy group (`suggested_demographic_group`
for text, `quality_group` for image/video) when the caller doesn't supply
`demographic_group` explicitly, and passes the real flag/no-flag decision
to `bias_audit.record_outcome()` instead of letting that module recompute
its own (previously divergent) threshold check.

**If you already have `backend/data/aura.db` from before this fix**, its
`group_stats` table was seeded with the old two-bucket scheme
(`native_english`/`esl`, no image buckets at all). The seed dict in `db.py`
has been updated to the new per-language scheme, but seeding only runs
once on an empty table -- delete `backend/data/aura.db` (or just
`DELETE FROM group_stats` and restart) to pick up the new seed baseline.

## How to run the text eval

```powershell
cd backend
venv\Scripts\activate
python validation/run_text_eval.py
```

First run needs internet access (gpt2 self-downloads to `backend/.hf_cache`,
same as any other first run per the main README). Takes a few minutes on
CPU for 36 samples. Subsequent runs are fast since the model is cached.

## What it produces

- `../data/validation/text/results.csv` -- one row per sample: predicted
  score, predicted label, detected language, whether ESL calibration fired.
- `../data/validation/text/RESULTS.md` -- the same data rolled up into
  overall + per-language accuracy/FPR/FNR/AUC tables, plus a short
  diagnostic on whether the ESL calibration mechanism actually activated
  and how often `langdetect`'s guess matched the sample's real language.

## What this does and doesn't prove

Confirms (once run): whether the ensemble score at the current
`config.TEXT_FLAG_THRESHOLD` actually separates this dataset's human vs.
AI samples, and whether accuracy holds up on non-English submissions where
the ESL multiplier is supposed to kick in.

Does NOT confirm: robustness to paraphrasing attacks, performance on
lightly-AI-edited (not fully AI-written) text, or how this generalizes
to real student writing at scale -- 36 samples is enough to catch a badly
miscalibrated threshold, not enough to certify production accuracy.

## Image

Harness built (`run_image_eval.py`, `build_image_manifest.py`) but the
dataset is empty -- needs real image files. See
`../data/validation/image/README.md` for how to populate it.

## Video

Not built yet -- lowest priority given how slow the pipeline already is
per submission (see main README's "Why quick_detector" section).
