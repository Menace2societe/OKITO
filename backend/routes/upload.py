import os
import hashlib
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.config import MEDIA_DIR
from backend.services import ffmpeg_service

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Accepts multipart file upload and returns metadata."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".mp4", ".mkv", ".mov", ".mp3"]:
        raise HTTPException(status_code=400, detail="Unsupported file extension")

    content = await file.read()
    # Content-addressed id: re-importing the same video reuses the stored copy
    # (and its cached transcript) instead of piling up duplicates.
    file_id = hashlib.sha256(content).hexdigest()[:32]
    new_filename = f"{file_id}{ext}"
    file_path = os.path.join(MEDIA_DIR, new_filename)

    try:
        if os.path.exists(file_path):
            os.utime(file_path)  # reset the retention clock
        else:
            with open(file_path, "wb") as f:
                f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    duration = ffmpeg_service.get_duration(file_path)

    return {
        "file_id": file_id,
        "original_name": file.filename,
        "duration": duration,
        "url": f"/api/files/{new_filename}",
        "preview_url": f"http://localhost:8000/media/{new_filename}",
        "video_path": os.path.abspath(file_path),
    }
