import os
import uuid
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

    file_id = str(uuid.uuid4())
    new_filename = f"{file_id}{ext}"
    file_path = os.path.join(MEDIA_DIR, new_filename)

    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())
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
