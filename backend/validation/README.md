# AURA accuracy validation

This is the Phase 0 "labeled validation set" gap the build plan called for
and the README's "What's next" flagged as the #1 open item: nobody had ever
checked detector output against ground truth. This folder starts closing
that gap for the **text** modality.

## What's here

- `run_text_eval.py` -- calls the real `analyze_text()` detector (the exact
  code path `jobs.py` uses in production) against every sample in
  `../data/validation/text/samples.jsonl`, and computes accuracy,
  precision/recall, FPR/FNR, and ROC-AUC, both overall and broken down by
  the text's written language (the proxy group the ESL calibration in
  `text_detector.py` keys off).
- `../data/validation/text/samples.jsonl` -- 36 hand-built, labeled samples:
  18 written in a deliberately human, informal, bursty-sentence-length
  style, and 18 genuinely AI-generated (formal register, hedging language,
  the exact lexical tells `text_detector.py`'s `GPT_TELL_PHRASES_*` lists
  look for). Paired by topic (12 topics, one human/one AI version each in
  English) so topic itself isn't a confound. 6 of the 36 are in Spanish, 6
  in French, specifically to exercise the ESL-calibration code path, since
  `langdetect` needs to actually detect a non-English language for the
  multiplier to apply.
- This dataset is **synthetic and hand-authored**, exactly as Phase 0
  originally specified ("build the synthetic labeled dataset") -- it is
  not scraped from real student submissions. Treat it as a first-pass
  sanity check on detector behavior, not a substitute for eventually
  validating against real (anonymized, consented) submissions.

## How to run it

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
`config.FLAG_THRESHOLD = 0.6` actually separates this dataset's human vs.
AI samples, and whether accuracy holds up on non-English submissions where
the ESL multiplier is supposed to kick in.

Does NOT confirm: robustness to paraphrasing attacks, performance on
lightly-AI-edited (not fully AI-written) text, or how this generalizes
to real student writing at scale -- 36 samples is enough to catch a badly
miscalibrated threshold, not enough to certify production accuracy.

## Image and video

Not built yet -- `../data/validation/image/` and `../data/validation/video/`
are scaffolded but empty. Same approach applies: labeled real/AI-generated
samples, a harness calling `analyze_image()` / `analyze_video()` directly,
metrics via `sklearn.metrics`. Video is the lowest priority of the three
given how slow the pipeline is per submission (see main README's "Why
quick_detector" section).
