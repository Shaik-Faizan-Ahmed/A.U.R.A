import threading
from typing import Dict, Optional
import config

_lock = threading.Lock()

# institution_id -> group -> {"flags": int, "total": int}
# Seeded with synthetic baseline data (Phase 0 dataset) so the fairness
# endpoint has something meaningful to show before any live submissions
# come in. Replace/extend with the real synthetic dataset from Phase 0.
_stats: Dict[str, Dict[str, Dict[str, int]]] = {
    "college_a": {
        "native_english": {"flags": 4, "total": 100},
        "esl": {"flags": 11, "total": 100},
        "low_bandwidth_video": {"flags": 9, "total": 100},
        "standard_video": {"flags": 5, "total": 100},
    },
    "college_b": {
        "native_english": {"flags": 3, "total": 100},
        "esl": {"flags": 8, "total": 100},
        "low_bandwidth_video": {"flags": 7, "total": 100},
        "standard_video": {"flags": 6, "total": 100},
    },
}

DEFAULT_GROUP = "unspecified"


def record_outcome(institution_id: str, group: Optional[str], overall_score: float):
    """Called after every job completes to keep per-group FPR stats live."""
    group = group or DEFAULT_GROUP
    with _lock:
        inst = _stats.setdefault(institution_id, {})
        bucket = inst.setdefault(group, {"flags": 0, "total": 0})
        bucket["total"] += 1
        if overall_score >= config.FLAG_THRESHOLD:
            bucket["flags"] += 1


def get_fairness_stats(institution_id: str):
    with _lock:
        inst = _stats.get(institution_id, {})
        groups = []
        for group, bucket in inst.items():
            total = bucket["total"] or 1
            fpr = bucket["flags"] / total
            groups.append({"group": group, "fpr": round(fpr, 3), "fnr": 0.0, "sample_size": bucket["total"]})

        if groups:
            fprs = [g["fpr"] for g in groups if g["fpr"] > 0]
            ratio = round(max(fprs) / min(fprs), 2) if len(fprs) >= 2 and min(fprs) > 0 else 1.0
        else:
            ratio = 1.0

        return groups, ratio


def get_fairness_banner(institution_id: str, group: Optional[str]) -> Optional[str]:
    """Attached to a live flag when its group's FPR is disproportionate at this institution."""
    group = group or DEFAULT_GROUP
    groups, _ = get_fairness_stats(institution_id)
    this_group = next((g for g in groups if g["group"] == group), None)
    if this_group is None or this_group["fpr"] == 0:
        return None
    other_fprs = [g["fpr"] for g in groups if g["group"] != group and g["fpr"] > 0]
    if not other_fprs:
        return None
    min_other = min(other_fprs)
    relative = this_group["fpr"] / min_other if min_other > 0 else 1.0
    if relative >= config.FAIRNESS_ALERT_RATIO:
        return (
            f"Note: the '{group}' group has a {relative:.1f}x higher false-positive rate "
            f"than the best-performing group at this institution — review with extra scrutiny."
        )
    return None
