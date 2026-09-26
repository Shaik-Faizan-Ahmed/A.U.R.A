import os

# API key -> institution_id lookup (hardcoded for hackathon demo).
# In production this would be a database table issued during ERP onboarding.
INSTITUTIONS = {
    "demo-key-college-a": "college_a",
    "demo-key-college-b": "college_b",
}

# Overall score at/above which an IMAGE or VIDEO submission is routed to the
# human review queue. Still the original guessed value -- no labeled
# validation set exists yet for these two modalities (see
# backend/data/validation/{image,video}/), so this hasn't been recalibrated
# against real data the way TEXT_FLAG_THRESHOLD below has. Treat 0.6 here as
# provisional, not evidence-backed.
FLAG_THRESHOLD = float(os.getenv("FLAG_THRESHOLD", "0.6"))

# Overall score at/above which a TEXT submission is flagged. Recalibrated
# from 0.6 to 0.30 based on backend/data/validation/text/RESULTS.md: on 24
# labeled English samples, every human sample scored <= 0.102 and every
# AI-generated sample scored >= 0.454 (ROC-AUC = 1.000), so any threshold in
# that gap gives perfect separation on this dataset. 0.30 sits with margin on
# both sides. This does NOT apply to non-English text -- see jobs.py, which
# routes non-English text submissions to human review unconditionally
# instead of trusting this threshold, because the same validation found the
# underlying signal unreliable (Spanish AUC ~0.56, French AUC 0.00 -- exactly
# inverted) for languages other than English.
TEXT_FLAG_THRESHOLD = float(os.getenv("TEXT_FLAG_THRESHOLD", "0.30"))

# Disparate-impact ratio (worst-group FPR / best-group FPR) at/above which the
# fairness banner is attached to a flagged submission.
FAIRNESS_ALERT_RATIO = float(os.getenv("FAIRNESS_ALERT_RATIO", "1.25"))

CORS_ORIGINS = ["*"]  # tighten to real frontend origin(s) before sharing outside the demo

# Where uploaded image/video files are saved server-side before analysis.
# content_ref for image/video submissions is a server-side file path (see
# README's known limitations) -- this endpoint/dir is what makes that path
# come from an actual browser upload instead of requiring the caller to
# already have a file sitting on the same machine as the API.
UPLOAD_DIR = os.getenv("AURA_UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB, matches the frontend's own limit
