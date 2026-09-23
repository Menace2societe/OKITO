import logging
import re
import traceback
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.config import MEDIA_DIR
from backend.services import ytdlp_service

logger = logging.getLogger(__name__)

router = APIRouter()


class URLRequest(BaseModel):
    url: str


def sanitize_youtube_url(url: str) -> str:
    """Extract the bare YouTube video URL and drop playlist/mix parameters.

    - youtube.com/watch?v=ID&list=RD... -> youtube.com/watch?v=ID
    - youtube.com/shorts/ID?list=RD...  -> youtube.com/watch?v=ID
    - youtu.be/ID?list=RD...            -> youtube.com/watch?v=ID
    - Non-YouTube URLs are returned as-is.
    """
    youtube_match = re.search(
        r"(?:youtube\.com/(?:watch\?.*?v=|embed/|shorts/)|youtu\.be/)"
        r"([0-9A-Za-z_-]{11})(?=[^0-9A-Za-z_-]|$)",
        url,
        re.IGNORECASE,
    )
    if youtube_match:
        return f"https://www.youtube.com/watch?v={youtube_match.group(1)}"

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
        print("\n[ERROR /api/download-url] Traceback :")
        traceback.print_exc()
        raise HTTPException(
            status_code=400,
            detail=(
                "Impossible de télécharger cette vidéo pour le moment. "
                "Veuillez vérifier le lien ou réessayer ultérieurement."
            ),
        )
