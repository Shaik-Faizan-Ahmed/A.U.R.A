import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aura.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# SQLite serializes writes anyway; this lock just keeps our own multi-statement
# write sequences (insert-then-commit) atomic across threads without relying
# on SQLite's busy-timeout/retry behavior under concurrent access.
WRITE_LOCK = threading.Lock()

# Seed baseline group stats so the fairness endpoint has meaningful numbers
# before any real submissions come in. Mirrors the Phase 0 synthetic dataset.
# Only used once, on first-ever startup (table empty) -- never overwrites
# real accumulated data on later restarts.
_SEED_GROUP_STATS = {
    "college_a": {
        "native_english": (4, 100),
        "es": (9, 60),
        "fr": (10, 40),
        "low_bandwidth_video": (9, 100),
        "standard_video": (5, 100),
        "low_res_image": (8, 80),
        "standard_image": (5, 120),
    },
    "college_b": {
        "native_english": (3, 100),
        "es": (7, 50),
        "fr": (8, 35),
        "low_bandwidth_video": (7, 100),
        "standard_video": (6, 100),
        "low_res_image": (7, 70),
        "standard_image": (4, 110),
    },
}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _existing_columns(conn: sqlite3.Connection, table: str) -> set:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _migrate(conn: sqlite3.Connection):
    """
    Adds any columns the current schema expects that an older version of
    this DB file doesn't have yet. CREATE TABLE IF NOT EXISTS only helps on
    a brand-new file -- it does nothing to a table that already exists with
    an older shape. This DB has hit that twice now (first 'created_at', then
    'content_ref' -- see git history/chat log) with one-off column checks
    added reactively each time something crashed on a missing column. Made
    this data-driven instead so the next schema addition doesn't require
    yet another hand-written ALTER TABLE spliced in here.
    """
    expected = {
        "submissions": {
            "content_ref": "TEXT",
            "demographic_group": "TEXT",
            "status": "TEXT NOT NULL DEFAULT 'queued'",
            "overall_score": "REAL",
            "confidence": "REAL",
            "explanation": "TEXT",
            "signals_json": "TEXT",
            "fairness_banner": "TEXT",
            "created_at": "TEXT",
        },
        "flags": {
            "fairness_banner": "TEXT",
            "reviewer_id": "TEXT",
            "created_at": "TEXT",
            "decided_at": "TEXT",
        },
    }

    for table, columns in expected.items():
        existing_cols = _existing_columns(conn, table)
        for col, col_type in columns.items():
            if col not in existing_cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                print(f"[db] added missing column {table}.{col}")

    # created_at backfill: a column added via ALTER TABLE can't carry a
    # datetime('now') DEFAULT for pre-existing rows (SQLite only applies
    # the default going forward), so existing rows need it set explicitly.
    for table in ("submissions", "flags"):
        conn.execute(f"UPDATE {table} SET created_at = datetime('now') WHERE created_at IS NULL")

    conn.commit()


def _migrate_stale_group_seed(conn: sqlite3.Connection):
    """
    Fixes group_stats rows left over from an older version of
    _SEED_GROUP_STATS, for a DB file that was already seeded (non-empty
    group_stats) before this dict had per-language text buckets or any
    image buckets at all -- init_db()'s seeding block only ever runs once,
    on an empty table, so a DB seeded under the old shape never got these
    additions and just sat there showing a blanket 'esl' bucket and no
    Image section, no matter how many times the app restarted.

    Two separate fixes, both idempotent (safe to run on every startup):
      1. Any institution with zero rows ending in '_image' is missing the
         image seed entirely -- insert it from _SEED_GROUP_STATS.
      2. A literal 'esl' group_name is unsplittable leftover data (no
         current code path can produce that string -- text_detector.py's
         suggested_demographic_group is always either 'native_english' or
         a real language code) -- delete it, and backfill the per-language
         seed rows (es/fr) if they aren't already present, so the language
         breakdown appears immediately instead of just disappearing.

    Never touches a group_name this dict doesn't know about, and never
    touches native_english/low_bandwidth_video/standard_video or any real
    per-language row that already exists -- only adds what's missing and
    removes the one string that's now provably dead.
    """
    for institution_id, groups in _SEED_GROUP_STATS.items():
        existing = {
            row["group_name"]
            for row in conn.execute(
                "SELECT group_name FROM group_stats WHERE institution_id=?", (institution_id,)
            ).fetchall()
        }

        if not any(g.endswith("_image") for g in existing):
            for group_name in ("low_res_image", "standard_image"):
                flagged, total = groups[group_name]
                conn.execute(
                    "INSERT OR IGNORE INTO group_stats (institution_id, group_name, flagged_count, total_count) "
                    "VALUES (?, ?, ?, ?)",
                    (institution_id, group_name, flagged, total),
                )
            print(f"[db] backfilled missing image seed groups for {institution_id}")

        if "esl" in existing:
            conn.execute(
                "DELETE FROM group_stats WHERE institution_id=? AND group_name='esl'",
                (institution_id,),
            )
            for group_name in ("es", "fr"):
                if group_name not in existing:
                    flagged, total = groups[group_name]
                    conn.execute(
                        "INSERT OR IGNORE INTO group_stats (institution_id, group_name, flagged_count, total_count) "
                        "VALUES (?, ?, ?, ?)",
                        (institution_id, group_name, flagged, total),
                    )
            print(f"[db] replaced stale 'esl' bucket with per-language seed rows for {institution_id}")

    conn.commit()


def init_db():
    """Creates tables if they don't exist, migrates older ones that do,
    and seeds baseline fairness data. Call once at app startup."""
    with WRITE_LOCK:
        conn = get_connection()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS submissions (
                    job_id TEXT PRIMARY KEY,
                    institution_id TEXT NOT NULL,
                    student_ref TEXT NOT NULL,
                    modality TEXT NOT NULL,
                    content_ref TEXT,
                    demographic_group TEXT,
                    status TEXT NOT NULL DEFAULT 'queued',
                    overall_score REAL,
                    confidence REAL,
                    explanation TEXT,
                    signals_json TEXT,
                    fairness_banner TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_submissions_institution
                    ON submissions(institution_id);

                CREATE TABLE IF NOT EXISTS flags (
                    flag_id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL REFERENCES submissions(job_id),
                    institution_id TEXT NOT NULL,
                    student_ref TEXT NOT NULL,
                    modality TEXT NOT NULL,
                    overall_score REAL NOT NULL,
                    explanation TEXT,
                    fairness_banner TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewer_id TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    decided_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_flags_institution
                    ON flags(institution_id);

                CREATE TABLE IF NOT EXISTS group_stats (
                    institution_id TEXT NOT NULL,
                    group_name TEXT NOT NULL,
                    flagged_count INTEGER NOT NULL DEFAULT 0,
                    total_count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (institution_id, group_name)
                );
                """
            )
            conn.commit()

            _migrate(conn)

            existing = conn.execute("SELECT COUNT(*) AS n FROM group_stats").fetchone()["n"]
            if existing == 0:
                for institution_id, groups in _SEED_GROUP_STATS.items():
                    for group_name, (flagged, total) in groups.items():
                        conn.execute(
                            "INSERT INTO group_stats (institution_id, group_name, flagged_count, total_count) "
                            "VALUES (?, ?, ?, ?)",
                            (institution_id, group_name, flagged, total),
                        )
                conn.commit()
            else:
                # Table already had rows (an older seed) -- run the targeted
                # backfill/cleanup above instead of the fresh-seed path.
                _migrate_stale_group_seed(conn)
        finally:
            conn.close()
