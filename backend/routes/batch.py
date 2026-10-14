"""Best-moment analysis and multi-clip batch rendering."""
import logging
import random
import traceback
import uuid
from typing import Any, Dict, List, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from backend.config import find_source
from backend.routes.process import ProcessRequest, process_video_task
from backend.services import clip_finder, job_store, moment_finder
from backend.services.ffmpeg_service import VIDEO_FILTERS
from backend.services.subtitle_service import ASS_STYLE_PRESETS

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeRequest(BaseModel):
    file_id: str
    count: int = Field(5, ge=1, le=20)
    min_duration: float = Field(15.0, gt=0)
    max_duration: float = Field(60.0, gt=0)


class BatchRequest(AnalyzeRequest):
    mode: Literal["random", "best"] = "random"
    aspect_ratio: str = "9:16_fit"
    subtitles_enabled: bool = True
    style_preset: str = "bold_tiktok"
    video_filter: str = "cinema_intense"
    output_format: str = "mp4"
    # Draw a different filter + subtitle style for every clip.
    random_look: bool = False


def _source_or_404(file_id: str) -> str:
    source = find_source(file_id)
    if not source:
        raise HTTPException(status_code=404, detail="Fichier source introuvable.")
    return source


def _without_words(moments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{k: v for k, v in m.items() if k != "words"} for m in moments]


# ---------------------------------------------------------------------------
# Analysis: best moments of one video
# ---------------------------------------------------------------------------

def _analyze_task(job_id: str, request: AnalyzeRequest, source: str) -> None:
    job_store.update(job_id, status="processing")
    try:
        result = moment_finder.find_moments(
            request.file_id, source, request.count,
            request.min_duration, request.max_duration,
            progress=lambda p: job_store.update(job_id, progress=p),
        )
        job_store.update(job_id, status="completed", progress=100, result=result)
    except Exception as exc:
        logger.error("[analyze] Échec :\n%s", traceback.format_exc())
        job_store.update(job_id, status="failed", error=str(exc))


@router.post("/analyze")
async def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
    """Start a best-moments analysis; poll /api/status/{job_id} for `result`."""
    source = _source_or_404(request.file_id)
    job_id = str(uuid.uuid4())
    job_store.create(job_id, "analyze", request.model_dump())
    background_tasks.add_task(_analyze_task, job_id, request, source)
    return {"job_id": job_id}


# ---------------------------------------------------------------------------
# Batch: N clips of one video in a single launch
# ---------------------------------------------------------------------------

def _batch_task(batch_id: str, request: BatchRequest, source: str) -> None:
    job_store.update(batch_id, status="processing", progress=2)
    try:
        if request.mode == "best":
            found = moment_finder.find_moments(
                request.file_id, source, request.count,
                request.min_duration, request.max_duration,
                progress=lambda p: job_store.update(batch_id, progress=p * 4 // 10),
            )
            clips, picked_by = found["moments"], found["source"]
        else:
            clips = clip_finder.pick_random_clips(
                source, request.count, request.min_duration, request.max_duration
            )
            picked_by = "random"
        if not clips:
            raise ValueError("Aucun extrait n'a pu être choisi dans cette vidéo.")

        filters = [k for k in VIDEO_FILTERS if k != "none"]
        styles = list(ASS_STYLE_PRESETS)
        render_jobs = []
        for i, clip in enumerate(clips, start=1):
            words = clip.get("words") or None
            render = ProcessRequest(
                file_id=request.file_id,
                start_time=clip["start_time"],
                end_time=clip["end_time"],
                aspect_ratio=request.aspect_ratio,
                subtitles_enabled=request.subtitles_enabled,
                style_preset=random.choice(styles) if request.random_look else request.style_preset,
                video_filter=random.choice(filters) if request.random_look else request.video_filter,
                # Best moments already carry Whisper words: no second transcription.
                custom_subtitles=clip.get("text") if words else None,
                reference_words=words,
                output_format=request.output_format,
            )
            job_id = str(uuid.uuid4())
            job_store.create(job_id, "render", render.model_dump(), batch_id=batch_id,
                             label=clip.get("title") or f"Clip {i}")
            render_jobs.append((job_id, render))

        job_store.update(batch_id, progress=40,
                         result={"picked_by": picked_by, "clips": _without_words(clips)})

        # Renders run one after another: FFmpeg already uses every CPU core.
        for i, (job_id, render) in enumerate(render_jobs, start=1):
            process_video_task(job_id, render)
            job_store.update(batch_id, progress=40 + 60 * i // len(render_jobs))

        job_store.update(batch_id, status="completed", progress=100)
    except Exception as exc:
        logger.error("[batch] Échec :\n%s", traceback.format_exc())
        job_store.update(batch_id, status="failed", error=str(exc))


@router.post("/batch")
async def create_batch(request: BatchRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
    """Pick `count` clips (random or best moments) and render them all."""
    source = _source_or_404(request.file_id)
    if request.max_duration < request.min_duration:
        raise HTTPException(status_code=400, detail="max_duration < min_duration.")
    batch_id = str(uuid.uuid4())
    job_store.create(batch_id, "batch", request.model_dump())
    background_tasks.add_task(_batch_task, batch_id, request, source)
    return {"batch_id": batch_id}


@router.get("/batch/{batch_id}")
async def get_batch(batch_id: str) -> Dict[str, Any]:
    batch = job_store.get(batch_id)
    if batch is None or batch["kind"] != "batch":
        raise HTTPException(status_code=404, detail="Lot introuvable.")
    clips = job_store.list_batch(batch_id)
    for job in [batch, *clips]:
        job.pop("request", None)
    return {"batch": batch, "clips": clips}
