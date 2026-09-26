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
    an older shape, which is what caused 'no such column: created_at' when
    the DB predated that column being added to the schema below.
    """
    submissions_cols = _existing_columns(conn, "submissions")
    if "created_at" not in submissions_cols:
        conn.execute("ALTER TABLE submissions ADD COLUMN created_at TEXT")
        conn.execute("UPDATE submissions SET created_at = datetime('now') WHERE created_at IS NULL")

    flags_cols = _existing_columns(conn, "flags")
    if "created_at" not in flags_cols:
        conn.execute("ALTER TABLE flags ADD COLUMN created_at TEXT")
        conn.execute("UPDATE flags SET created_at = datetime('now') WHERE created_at IS NULL")
    if "decided_at" not in flags_cols:
        conn.execute("ALTER TABLE flags ADD COLUMN decided_at TEXT")
    if "reviewer_id" not in flags_cols:
        conn.execute("ALTER TABLE flags ADD COLUMN reviewer_id TEXT")

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
        finally:
            conn.close()
