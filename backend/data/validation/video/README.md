# Video validation dataset -- not built yet

Lowest priority of the three modalities (per main README's "Why
quick_detector, not comprehensive_detector" section -- video submissions
are already the slowest to process). Same pattern as `../text/` once
prioritized:

1. ~15-20 clips, balanced real vs. AI-generated/deepfake.
2. A harness (`backend/validation/run_video_eval.py`) calling the real
   `analyze_video()` from `models/video_detector.py` and computing
   accuracy/FPR/FNR/AUC via `sklearn.metrics`.
3. Specifically worth checking: whether the `temporal_consistency` signal's
   known histogram-based fallback (no `facenet-pytorch`, see main README's
   "Known limitations") produces a measurably higher false-positive rate on
   heavily-edited clips (jump cuts, zooms, text overlays) than on plain
   footage -- that's the concrete risk the fallback creates, and this is
   the dataset that would confirm or rule it out.

Not attempted in this pass: needs either real deepfake video samples or
video-generation tooling, neither available in the environment this round
of work was done in.
