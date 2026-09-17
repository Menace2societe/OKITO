import os
import uuid
import glob
import logging
import traceback
from typing import Dict, Any, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from backend.config import MEDIA_DIR
from backend.services import ffmpeg_service, whisper_service, subtitle_service

logger = logging.getLogger(__name__)

router = APIRouter()

jobs: Dict[str, Dict[str, Any]] = {}


class ProcessRequest(BaseModel):
    file_id: str
    start_time: float
    end_time: float
    aspect_ratio: str
    subtitles_enabled: bool
    subtitle_style: str = "bold_tiktok"
    style_preset: str = "bold_tiktok"
    video_filter: str = "cinema_intense"
    output_format: str


def process_video_task(job_id: str, request: ProcessRequest) -> None:
    """Background task — runs FFmpeg pipeline and updates job status."""
    jobs[job_id]["status"] = "processing"

    try:
        # ── 1. Find input file ──────────────────────────────────────────
        possible_files = glob.glob(os.path.join(MEDIA_DIR, f"{request.file_id}.*"))
        if not possible_files:
            msg = f"Fichier source introuvable pour file_id={request.file_id}"
            logger.error(msg)
            print(f"[process] ERREUR : {msg}")
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = msg
            return

        input_path = os.path.abspath(possible_files[0])
        logger.info("[process] Fichier source : %s", input_path)
        print(f"[process] Fichier source : {input_path}")

        # ── 2. Subtitles (optional) ─────────────────────────────────────
        ass_path: Optional[str] = None
        if request.subtitles_enabled:
            jobs[job_id]["progress"] = 10
            logger.info("[process] Extraction audio pour Whisper...")
            print("[process] Extraction audio pour Whisper...")

            audio_path = os.path.abspath(
                os.path.join(MEDIA_DIR, f"{job_id}_audio.wav")
            )
            ffmpeg_service.extract_audio(
                input_path, audio_path, request.start_time, request.end_time
            )

            jobs[job_id]["progress"] = 30
            logger.info("[process] Transcription Whisper...")
            print("[process] Transcription Whisper...")
            words = whisper_service.transcribe(audio_path)

            jobs[job_id]["progress"] = 60
            ass_path = os.path.abspath(
                os.path.join(MEDIA_DIR, f"{job_id}.ass")
            )
            subtitle_service.generate_ass(
                words, ass_path, request.aspect_ratio, request.style_preset
            )
            logger.info("[process] Sous-titres générés : %s", ass_path)
            print(f"[process] Sous-titres générés : {ass_path}")

            # Clean up temp audio
            if os.path.exists(audio_path):
                os.remove(audio_path)

        # ── 3. FFmpeg encode ────────────────────────────────────────────
        jobs[job_id]["progress"] = 70
        output_filename = f"{job_id}_out.{request.output_format}"
        output_path = os.path.abspath(
            os.path.join(MEDIA_DIR, output_filename)
        )

        logger.info("[process] Lancement FFmpeg → %s", output_path)
        print(f"[process] Lancement FFmpeg → {output_path}")

        ffmpeg_service.process_video(
            input_path=input_path,
            output_path=output_path,
            start_time=request.start_time,
            end_time=request.end_time,
            aspect_ratio=request.aspect_ratio,
            ass_path=ass_path,
            video_filter=request.video_filter,
        )

        # ── 4. Success ──────────────────────────────────────────────────
        jobs[job_id]["progress"] = 100
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["output_url"] = f"/api/files/{output_filename}"
        logger.info("[process] ✅ Traitement terminé : %s", output_filename)
        print(f"[process] ✅ Traitement terminé : {output_filename}")

    except Exception as e:
        # Log the FULL traceback in the terminal so we can diagnose
        error_msg = str(e)
        logger.error("[process] ❌ ÉCHEC du traitement :\n%s", traceback.format_exc())
        print(f"[process] ❌ ÉCHEC du traitement :\n{traceback.format_exc()}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = error_msg


@router.post("/process")
async def process(
    request: ProcessRequest, background_tasks: BackgroundTasks
) -> Dict[str, str]:
    """Launch video processing in the background and return a job ID."""
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued",
        "progress": 0,
        "output_url": None,
        "error": None,
    }
    logger.info(
        "[process] Job %s créé — file_id=%s, %ss→%ss, ratio=%s, subs=%s, fmt=%s",
        job_id, request.file_id, request.start_time, request.end_time,
        request.aspect_ratio, request.subtitles_enabled, request.output_format,
    )
    print(
        f"[process] Job {job_id} créé — "
        f"file_id={request.file_id}, "
        f"{request.start_time}s→{request.end_time}s, "
        f"ratio={request.aspect_ratio}, "
        f"subs={request.subtitles_enabled}, "
        f"fmt={request.output_format}"
    )
    background_tasks.add_task(process_video_task, job_id, request)
    return {"job_id": job_id}
