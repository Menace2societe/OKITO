"""SQLite-backed job store: render / analysis jobs survive a server restart."""
import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from backend.config import DATA_DIR

DB_PATH = os.path.join(DATA_DIR, "jobs.db")

# Columns exposed by the API. "result" and "request" are stored as JSON text.
_COLUMNS = (
    "id", "kind", "batch_id", "label", "status", "progress", "output_url",
    "vtt_url", "srt_url", "error", "result", "request", "created_at", "updated_at",
)
_JSON_COLUMNS = {"result", "request"}

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    """Create the table and fail jobs that were running when the server died."""
    with _lock, _connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'render',
                batch_id TEXT,
                label TEXT,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                output_url TEXT,
                vtt_url TEXT,
                srt_url TEXT,
                error TEXT,
                result TEXT,
                request TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id)")
        conn.execute(
            "UPDATE jobs SET status='failed', error=?, updated_at=? "
            "WHERE status IN ('queued', 'processing')",
            ("Interrompu par un redémarrage du serveur.", time.time()),
        )


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    data = dict(row)
    for col in _JSON_COLUMNS:
        if data.get(col):
            data[col] = json.loads(data[col])
    return data


def create(
    job_id: str,
    kind: str = "render",
    request: Optional[Dict[str, Any]] = None,
    batch_id: Optional[str] = None,
    label: Optional[str] = None,
) -> None:
    now = time.time()
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO jobs (id, kind, batch_id, label, status, progress, request, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?)",
            (job_id, kind, batch_id, label, json.dumps(request) if request else None, now, now),
        )


def update(job_id: str, **fields: Any) -> None:
    unknown = set(fields) - set(_COLUMNS)
    if unknown:
        raise ValueError(f"Colonnes inconnues : {unknown}")
    values = [
        json.dumps(v) if k in _JSON_COLUMNS and v is not None else v
        for k, v in fields.items()
    ]
    assignments = ", ".join(f"{k}=?" for k in fields)
    with _lock, _connect() as conn:
        conn.execute(
            f"UPDATE jobs SET {assignments}, updated_at=? WHERE id=?",
            (*values, time.time(), job_id),
        )


def get(job_id: str) -> Optional[Dict[str, Any]]:
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_dict(row) if row else None


def list_batch(batch_id: str) -> List[Dict[str, Any]]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE batch_id=? ORDER BY created_at", (batch_id,)
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def active_request_files() -> List[str]:
    """file_ids referenced by queued/processing jobs (protected from cleanup)."""
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, request FROM jobs WHERE status IN ('queued', 'processing')"
        ).fetchall()
    ids: List[str] = []
    for row in rows:
        ids.append(row["id"])
        if row["request"]:
            file_id = json.loads(row["request"]).get("file_id")
            if file_id:
                ids.append(file_id)
    return ids


def delete_older_than(cutoff: float) -> int:
    """Drop finished job rows last updated before `cutoff` (epoch seconds)."""
    with _lock, _connect() as conn:
        cur = conn.execute(
            "DELETE FROM jobs WHERE updated_at < ? AND status IN ('completed', 'failed')",
            (cutoff,),
        )
        return cur.rowcount
