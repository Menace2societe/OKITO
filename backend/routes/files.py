import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.config import MEDIA_DIR

router = APIRouter()

@router.get("/files/{filename}")
async def get_file(filename: str) -> FileResponse:
    file_path = os.path.join(MEDIA_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    # FileResponse automatically supports Range headers for byte serving
    return FileResponse(file_path)
