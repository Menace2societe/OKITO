"""Assemble the Hugging Face Space for the ClipFlow backend.

    python deploy/hf-backend/build_space.py

Writes deploy/hf-backend/dist/: README.md (Space settings), app.py (from
space_app.py), requirements.txt, packages.txt and a copy of backend/ without
media, data, cookies or caches. Upload that folder to the Space.
"""

import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DIST = os.path.join(HERE, "dist")

# Runtime state and secrets that must never leave this PC.
BACKEND_EXCLUDES = shutil.ignore_patterns("media", "data", "cookies.txt", "__pycache__", "*.pyc")


def main() -> None:
    shutil.rmtree(DIST, ignore_errors=True)
    os.makedirs(DIST)
    for name in ("README.md", "requirements.txt", "packages.txt"):
        shutil.copyfile(os.path.join(HERE, name), os.path.join(DIST, name))
    shutil.copyfile(os.path.join(HERE, "space_app.py"), os.path.join(DIST, "app.py"))
    shutil.copytree(os.path.join(ROOT, "backend"), os.path.join(DIST, "backend"), ignore=BACKEND_EXCLUDES)
    print(f"Space prêt dans {DIST}")


if __name__ == "__main__":
    main()
