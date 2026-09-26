# Image validation dataset -- not built yet

Next step for closing the accuracy-validation gap on the image modality.
Same pattern as `../text/`:

1. Collect ~30-40 images, balanced real vs. AI-generated/deepfake, ideally
   stratified by a lighting/resolution-tier proxy group (per
   `AURA_BUILD_PLAN.md` Phase 0's original spec) so `analyze_image()`'s
   fairness properties can be checked, not just raw accuracy.
2. A `labels.csv` or `samples.jsonl` with `id, path, ground_truth, proxy_group`.
3. A harness (`backend/validation/run_image_eval.py`) calling the real
   `analyze_image()` from `models/image_detector.py` on each file and
   computing accuracy/FPR/FNR/AUC via `sklearn.metrics`, same as
   `run_text_eval.py` does for text.

Not attempted in this pass: sourcing real vs. AI-generated images needs
either a real image dataset or access to image-generation tooling, neither
of which was available in the environment this round of work was done in.
