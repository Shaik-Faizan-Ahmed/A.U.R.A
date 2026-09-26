import os

# API key -> institution_id lookup (hardcoded for hackathon demo).
# In production this would be a database table issued during ERP onboarding.
INSTITUTIONS = {
    "demo-key-college-a": "college_a",
    "demo-key-college-b": "college_b",
}

# Overall score at/above which a submission is routed to the human review queue.
FLAG_THRESHOLD = float(os.getenv("FLAG_THRESHOLD", "0.6"))

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
