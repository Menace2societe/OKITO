import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.config import MEDIA_DIR

router = APIRouter()

@router.get("/files/{filename}")
async def get_file(filename: str, download: bool = False) -> FileResponse:
    # basename() blocks "..\\" traversal, which Windows paths would allow.
    safe_name = os.path.basename(filename)
    file_path = os.path.join(MEDIA_DIR, safe_name)
    if safe_name != filename or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    # FileResponse automatically supports Range headers for byte serving.
    # ?download=1 sends it as an attachment: browsers ignore <a download>
    # on another origin, which is the case once the site is online.
    if download:
        return FileResponse(file_path, filename=f"clipflow{os.path.splitext(safe_name)[1]}")
    return FileResponse(file_path)
