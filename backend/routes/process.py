import os
import re
import uuid
import glob
import logging
import traceback
from typing import Dict, Any, Optional, List, Union
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
    # Optional manually edited / pasted subtitles: a raw string or a list of
    # {"text", "start", "end"} segments. When set, Whisper is skipped.
    custom_subtitles: Optional[Union[str, List[Any]]] = None
    output_format: str


class TranscribeRequest(BaseModel):
    file_id: Optional[str] = None
    video_path: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 0.0


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
            ass_path = os.path.abspath(
                os.path.join(MEDIA_DIR, f"{job_id}.ass")
            )

            if request.custom_subtitles:
                # 2b. Custom text — bypass Whisper entirely ---------------
                jobs[job_id]["progress"] = 40
                logger.info(
                    "[process] 2/3 — Sous-titres personnalisés fournis : "
                    "transcription Whisper ignorée."
                )
                print(
                    "[process] 2/3 — Sous-titres personnalisés fournis : "
                    "transcription Whisper ignorée."
                )
                line_count = subtitle_service.generate_ass_from_custom(
                    custom_subtitles=request.custom_subtitles,
                    output_path=ass_path,
                    aspect_ratio=request.aspect_ratio,
                    style_preset=request.style_preset,
                    start_time=request.start_time,
                    end_time=request.end_time,
                )
            else:
                # 2a. Audio extraction ---------------------------------
                jobs[job_id]["progress"] = 10
                logger.info(
                    "[process] 1/3 — Extraction de l'audio (%.2fs → %.2fs) depuis %s",
                    request.start_time, request.end_time, input_path,
                )
                print(
                    f"[process] 1/3 — Extraction de l'audio "
                    f"({request.start_time:.2f}s → {request.end_time:.2f}s)"
                )

                audio_path = os.path.abspath(
                    os.path.join(MEDIA_DIR, f"{job_id}_audio.wav")
                )
                ffmpeg_service.extract_audio(
                    input_path, audio_path, request.start_time, request.end_time
                )

                # Sanity check: the extracted WAV must exist, be non-empty and
                # report a positive duration, otherwise Whisper gets garbage.
                audio_size = os.path.getsize(audio_path) if os.path.exists(audio_path) else 0
                audio_duration = ffmpeg_service.get_duration(audio_path) if audio_size else 0.0
                logger.info(
                    "[process] Audio extrait : %s (%d octets, %.2fs)",
                    audio_path, audio_size, audio_duration,
                )
                print(
                    f"[process] Audio extrait : {audio_path} "
                    f"({audio_size} octets, {audio_duration:.2f}s)"
                )
                if audio_size == 0 or audio_duration <= 0:
                    logger.warning(
                        "[process] Audio extrait vide ou illisible : %s", audio_path
                    )
                    print(f"[process] [WARN] Audio extrait vide ou illisible : {audio_path}")

                # 2b. Whisper transcription ----------------------------
                jobs[job_id]["progress"] = 30
                logger.info("[process] 2/3 — Transcription Whisper...")
                print("[process] 2/3 — Transcription Whisper...")
                words = whisper_service.transcribe(audio_path)
                logger.info("[process] Whisper a retourné %d mot(s).", len(words))
                print(f"[process] Whisper a retourné {len(words)} mot(s).")
                if not words:
                    logger.warning("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")
                    print("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")

                # 2c. ASS generation -----------------------------------
                jobs[job_id]["progress"] = 60
                line_count = subtitle_service.generate_ass(
                    words, ass_path, request.aspect_ratio, request.style_preset
                )

                # Clean up temp audio
                if os.path.exists(audio_path):
                    os.remove(audio_path)

            logger.info(
                "[process] 3/3 — Fichier .ass créé : %s (%d ligne(s) de dialogue)",
                ass_path, line_count,
            )
            print(
                f"[process] 3/3 — Fichier .ass créé : {ass_path} "
                f"({line_count} ligne(s) de dialogue)"
            )

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


def _words_to_text(words: List[Dict[str, Any]]) -> str:
    """Join Whisper words into readable text, fixing spacing before punctuation."""
    text = " ".join((w.get("text") or "").strip() for w in words)
    text = re.sub(r"\s+([,.!?;:])", r"\1", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _resolve_input_path(
    file_id: Optional[str], video_path: Optional[str]
) -> str:
    """Resolve a usable input file from an explicit path or a file_id."""
    media_root = os.path.abspath(MEDIA_DIR)

    if video_path:
        candidate = os.path.abspath(video_path)
        try:
            inside_media = os.path.commonpath([media_root, candidate]) == media_root
        except ValueError:
            inside_media = False
        if inside_media and os.path.isfile(candidate):
            return candidate
        logger.warning("[transcribe] video_path invalide ou hors media : %s", candidate)

    if file_id:
        matches = glob.glob(os.path.join(MEDIA_DIR, f"{file_id}.*"))
        if matches:
            return os.path.abspath(matches[0])

    raise HTTPException(
        status_code=400,
        detail="Fichier vidéo introuvable sur le disque.",
    )


@router.post("/transcribe")
async def transcribe(request: TranscribeRequest) -> Dict[str, Any]:
    """Transcribe the selected segment with Whisper and return editable text."""
    try:
        input_path = _resolve_input_path(request.file_id, request.video_path)
        logger.info("[transcribe] Fichier source : %s", input_path)
        print(f"[transcribe] Fichier source : {input_path}")

        end_time = request.end_time
        if end_time <= request.start_time:
            end_time = ffmpeg_service.get_duration(input_path)

        audio_path = os.path.abspath(
            os.path.join(MEDIA_DIR, f"{uuid.uuid4()}_transcribe.wav")
        )

        try:
            ffmpeg_service.extract_audio(
                input_path, audio_path, request.start_time, end_time
            )
            if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                raise RuntimeError(
                    "L'extraction audio a échoué ou produit un fichier vide."
                )
            words = whisper_service.transcribe(audio_path)
        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)

        text = _words_to_text(words)
        logger.info("[transcribe] %d mot(s) transcrit(s).", len(words))
        print(f"[transcribe] {len(words)} mot(s) transcrit(s).")
        return {
            "text": text,
            "words": words,
            "word_count": len(words),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ERROR /api/transcribe] %s", str(e))
        print(f"[ERROR /api/transcribe] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
