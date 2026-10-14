import os
import glob
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from backend.config import MEDIA_DIR
from backend.services import clip_finder

router = APIRouter()


class RandomClipRequest(BaseModel):
    file_id: str
    min_duration: float = Field(15.0, gt=0)
    max_duration: float = Field(45.0, gt=0)
    seed: Optional[int] = None


@router.post("/random-clip")
async def random_clip(request: RandomClipRequest) -> Dict[str, Any]:
    """Return a random start/end window snapped to speech pauses."""
    matches = glob.glob(os.path.join(MEDIA_DIR, f"{glob.escape(request.file_id)}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Fichier source introuvable.")
    if request.max_duration < request.min_duration:
        raise HTTPException(status_code=400, detail="max_duration < min_duration.")

    try:
        return await run_in_threadpool(
            clip_finder.pick_random_clip,
            matches[0],
            request.min_duration,
            request.max_duration,
            request.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
