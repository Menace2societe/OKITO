"""Housekeeping for backend/media: retention and temp files.

Duplicates are prevented at import time (uploads are content-addressed), not
removed afterwards: deleting a "duplicate" could pull a file_id still open in
the editor out from under it.
"""
import logging
import os
import shutil
import threading
import time
from typing import Any, Dict, List, Set

from backend.config import MEDIA_DIR, MEDIA_RETENTION_DAYS
from backend.services import job_store

logger = logging.getLogger(__name__)

# Scratch files (Whisper audio, FFmpeg command files) are useless after an hour.
TEMP_SUFFIXES = ("_transcribe.wav", "_audio.wav", "_face.cmd")
TEMP_MAX_AGE = 3600

CLEANUP_INTERVAL = 6 * 3600


def _is_protected(name: str, protected: Set[str]) -> bool:
    return any(name.startswith(prefix) for prefix in protected)


def usage() -> Dict[str, Any]:
    files = [e for e in os.scandir(MEDIA_DIR) if e.is_file()]
    return {
        "file_count": len(files),
        "total_bytes": sum(e.stat().st_size for e in files),
        "retention_days": MEDIA_RETENTION_DAYS,
    }


def cleanup(retention_days: float = MEDIA_RETENTION_DAYS, dry_run: bool = False) -> Dict[str, Any]:
    """Delete expired and temporary files.

    Files belonging to queued / processing jobs are never touched.
    """
    now = time.time()
    cutoff = now - retention_days * 86400
    protected = set(job_store.active_request_files())
    doomed: Dict[str, str] = {}  # path -> reason
    for entry in os.scandir(MEDIA_DIR):
        if entry.is_dir() and entry.name.endswith("_demucs"):
            if now - entry.stat().st_mtime > TEMP_MAX_AGE and not dry_run:
                shutil.rmtree(entry.path, ignore_errors=True)
            continue
        if not entry.is_file():
            continue
        name, mtime = entry.name, entry.stat().st_mtime
        if _is_protected(name, protected):
            continue
        if name.endswith(TEMP_SUFFIXES) and now - mtime > TEMP_MAX_AGE:
            doomed[entry.path] = "temporaire"
        elif mtime < cutoff:
            doomed[entry.path] = f"plus de {retention_days:g} jour(s)"

    freed = 0
    deleted: List[Dict[str, Any]] = []
    for path, reason in doomed.items():
        size = os.path.getsize(path)
        if not dry_run:
            try:
                os.remove(path)
            except OSError as exc:  # file in use (Windows) — retry next pass
                logger.warning("[cleanup] Suppression impossible %s : %s", path, exc)
                continue
        freed += size
        deleted.append({"file": os.path.basename(path), "bytes": size, "reason": reason})

    if not dry_run:
        job_store.delete_older_than(cutoff)
    logger.info(
        "[cleanup] %s%d fichier(s), %.1f Mo libérés",
        "(simulation) " if dry_run else "", len(deleted), freed / 1e6,
    )
    return {"dry_run": dry_run, "deleted": deleted, "freed_bytes": freed, **usage()}


def start_background_cleanup() -> None:
    """Run cleanup now and every CLEANUP_INTERVAL seconds in a daemon thread."""
    def loop() -> None:
        while True:
            try:
                cleanup()
            except Exception:
                logger.exception("[cleanup] Échec du nettoyage périodique")
            time.sleep(CLEANUP_INTERVAL)

    threading.Thread(target=loop, name="media-cleanup", daemon=True).start()
