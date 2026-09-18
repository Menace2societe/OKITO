import logging
from typing import Dict, Any
from urllib.parse import urlparse, parse_qs

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.config import MEDIA_DIR
from backend.services import ytdlp_service

logger = logging.getLogger(__name__)

router = APIRouter()


class URLRequest(BaseModel):
    url: str


def sanitize_youtube_url(url: str) -> str:
    """Strip playlist parameters so yt-dlp only downloads a single video.

    - youtube.com/watch?v=ID&list=PL... → youtube.com/watch?v=ID
    - youtu.be/ID?list=PL...            → youtube.com/watch?v=ID
    - Non-YouTube URLs are returned as-is.
    """
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")

    if host in ("youtube.com", "m.youtube.com"):
        query = parse_qs(parsed.query)
        video_id = query.get("v", [None])[0]
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"

    elif host == "youtu.be":
        # youtu.be/<VIDEO_ID>?list=...
        video_id = parsed.path.lstrip("/")
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"

    return url


@router.post("/download-url")
async def download_url(request: URLRequest) -> Dict[str, Any]:
    """Downloads a video from a URL using yt-dlp.

    Always returns JSON — errors are wrapped in HTTPException so FastAPI
    serialises them as ``{"detail": "..."}`` instead of raw HTML.
    """
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="L'URL est vide.")

    clean_url = sanitize_youtube_url(request.url.strip())

    try:
        result = ytdlp_service.download_video(clean_url, MEDIA_DIR)

        return {
            "status": "success",
            "message": "Vidéo téléchargée avec succès",
            "file_id": result["file_id"],
            "title": result["title"],
            "duration": result["duration"],
            "url": result["url"],
            "preview_url": result["preview_url"],
            "video_path": result["video_path"],
        }

    except HTTPException:
        # Re-raise FastAPI exceptions as-is (already JSON-safe)
        raise

    except Exception as e:
        logger.exception("Erreur lors du téléchargement yt-dlp")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur d'extraction : {str(e)}",
        )
