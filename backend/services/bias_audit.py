from typing import Optional
import config
import db


def record_outcome(institution_id: str, group: Optional[str], flagged: bool):
    """
    Called after every job completes to keep per-group flag-rate stats live
    in SQLite. `flagged` must be the exact flag/no-flag decision jobs.py
    actually acted on for this submission -- this function must NOT
    recompute its own threshold check from overall_score, because that
    decision is no longer a single global comparison (see jobs.py: text
    uses config.TEXT_FLAG_THRESHOLD and routes non-English text to review
    unconditionally, while image/video still use config.FLAG_THRESHOLD).
    Recomputing it here independently would let the audit stats disagree
    with what was actually flagged.

    Note on the "fpr" field this feeds (see get_fairness_stats below): it's
    really a flag RATE (flags / total), not a true false-positive rate --
    production has no ground truth to know whether a flag was correct. The
    accuracy validation in backend/data/validation/ is what checks
    correctness; this module only checks whether groups are flagged at
    disparate rates.
    """
    group = group or "unspecified"
    flagged_count = 1 if flagged else 0
    conn = db.get_connection()
    try:
        with db.WRITE_LOCK:
            conn.execute(
                """
                INSERT INTO group_stats (institution_id, group_name, flagged_count, total_count)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(institution_id, group_name) DO UPDATE SET
                    total_count = total_count + 1,
                    flagged_count = flagged_count + excluded.flagged_count
                """,
                (institution_id, group, flagged_count),
            )
            conn.commit()
    finally:
        conn.close()


def get_fairness_stats(institution_id: str):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            "SELECT group_name, flagged_count, total_count FROM group_stats WHERE institution_id=?",
            (institution_id,),
        ).fetchall()
    finally:
        conn.close()

    groups = []
    for r in rows:
        total = r["total_count"] or 1
        fpr = r["flagged_count"] / total
        groups.append({
            "group": r["group_name"],
            "fpr": round(fpr, 3),
            "fnr": 0.0,
            "sample_size": r["total_count"],
        })

    if groups:
        fprs = [g["fpr"] for g in groups if g["fpr"] > 0]
        ratio = round(max(fprs) / min(fprs), 2) if len(fprs) >= 2 and min(fprs) > 0 else 1.0
    else:
        ratio = 1.0

    return groups, ratio


def get_fairness_banner(institution_id: str, group: Optional[str]) -> Optional[str]:
    """Attached to a live flag when its group's FPR is disproportionate at this institution."""
    group = group or "unspecified"
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
