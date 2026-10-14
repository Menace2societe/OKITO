import os

MEDIA_DIR = os.path.join(os.path.dirname(__file__), "media")
os.makedirs(MEDIA_DIR, exist_ok=True)

# Persistent state (job database) — kept out of MEDIA_DIR so cleanup never touches it.
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Media files (imports, renders, subtitles) older than this are deleted.
MEDIA_RETENTION_DAYS = float(os.getenv("MEDIA_RETENTION_DAYS", "7"))

SOURCE_EXTENSIONS = (".mp4", ".mkv", ".mov", ".mp3", ".webm", ".m4a")


def find_source(file_id: str) -> "str | None":
    """Absolute path of an imported media file, ignoring derived files
    such as `<file_id>.transcript.json`."""
    for ext in SOURCE_EXTENSIONS:
        path = os.path.join(MEDIA_DIR, f"{file_id}{ext}")
        if os.path.isfile(path):
            os.utime(path)  # in use: restart its retention clock
            return os.path.abspath(path)
    return None
