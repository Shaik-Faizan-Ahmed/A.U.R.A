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
