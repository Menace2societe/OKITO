import os
import re
import uuid
import logging
import traceback
from typing import Dict, Any, Optional, List, Union
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from backend.config import MEDIA_DIR, find_source
from backend.services import ffmpeg_service, whisper_service, subtitle_service, job_store, moment_finder

logger = logging.getLogger(__name__)

router = APIRouter()

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
    # Whisper words (clip-relative) from /api/transcribe: lets edited custom
    # text keep the real speech timing instead of an even distribution.
    reference_words: Optional[List[Dict[str, Any]]] = None
    output_format: str
    # 9:16 framing: 0 = whole frame on blurred bars, 100 = filled (cropped).
    # None keeps the mode's default (fit → 0, crop / face → 100).
    zoom: Optional[float] = Field(None, ge=0, le=100)
    # Whisper: "accurate" (medium) or "fast" (small), plus words to bias it.
    quality: str = "accurate"
    vocabulary: Optional[str] = None


class TranscribeRequest(BaseModel):
    file_id: Optional[str] = None
    video_path: Optional[str] = None
    start_time: Optional[float] = 0.0
    end_time: Optional[float] = None
    quality: str = "accurate"
    vocabulary: Optional[str] = None


def process_video_task(job_id: str, request: ProcessRequest) -> None:
    """Background task — runs FFmpeg pipeline and updates job status."""
    job_store.update(job_id, status="processing")

    try:
        # ── 1. Find input file ──────────────────────────────────────────
        source = find_source(request.file_id)
        if not source:
            msg = f"Fichier source introuvable pour file_id={request.file_id}"
            logger.error(msg)
            print(f"[process] ERREUR : {msg}")
            job_store.update(job_id, status="failed", error=msg)
            return

        input_path = source
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
                job_store.update(job_id, progress=40)
                logger.info(
                    "[process] 2/3 — Sous-titres personnalisés fournis : "
                    "transcription Whisper ignorée."
                )
                print(
                    "[process] 2/3 — Sous-titres personnalisés fournis : "
                    "transcription Whisper ignorée."
                )
                lines = subtitle_service.custom_to_lines(
                    custom_subtitles=request.custom_subtitles,
                    start_time=request.start_time,
                    end_time=request.end_time,
                    reference_words=request.reference_words,
                )
            else:
                # 2a. Audio extraction ---------------------------------
                job_store.update(job_id, progress=10)
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
                job_store.update(job_id, progress=30)
                logger.info("[process] 2/3 — Transcription Whisper...")
                print("[process] 2/3 — Transcription Whisper...")
                words = whisper_service.transcribe(
                    audio_path, request.quality, request.vocabulary
                )
                logger.info("[process] Whisper a retourné %d mot(s).", len(words))
                print(f"[process] Whisper a retourné {len(words)} mot(s).")
                if not words:
                    logger.warning("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")
                    print("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")

                # 2c. ASS generation -----------------------------------
                job_store.update(job_id, progress=60)
                lines = subtitle_service.words_to_lines(words)

                # Clean up temp audio
                if os.path.exists(audio_path):
                    os.remove(audio_path)

            # Same lines for the burned-in ASS, the HTML5 VTT and the SRT export.
            line_count = subtitle_service.write_ass_lines(
                lines, ass_path, request.aspect_ratio, request.style_preset
            )
            subtitle_service.write_cues(lines, os.path.join(MEDIA_DIR, f"{job_id}.vtt"), "vtt")
            subtitle_service.write_cues(lines, os.path.join(MEDIA_DIR, f"{job_id}.srt"), "srt")

            logger.info(
                "[process] 3/3 — Fichier .ass créé : %s (%d ligne(s) de dialogue)",
                ass_path, line_count,
            )
            print(
                f"[process] 3/3 — Fichier .ass créé : {ass_path} "
                f"({line_count} ligne(s) de dialogue)"
            )

        # ── 3. FFmpeg encode ────────────────────────────────────────────
        job_store.update(job_id, progress=70)
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
            zoom=request.zoom,
        )

        # ── 4. Success ──────────────────────────────────────────────────
        job_store.update(
            job_id,
            progress=100,
            status="completed",
            output_url=f"/api/files/{output_filename}",
            vtt_url=f"/api/files/{job_id}.vtt" if request.subtitles_enabled else None,
            srt_url=f"/api/files/{job_id}.srt" if request.subtitles_enabled else None,
        )
        logger.info("[process] ✅ Traitement terminé : %s", output_filename)
        print(f"[process] ✅ Traitement terminé : {output_filename}")

    except Exception as e:
        # Log the FULL traceback in the terminal so we can diagnose
        error_msg = str(e)
        logger.error("[process] ❌ ÉCHEC du traitement :\n%s", traceback.format_exc())
        print(f"[process] ❌ ÉCHEC du traitement :\n{traceback.format_exc()}")
        job_store.update(job_id, status="failed", error=error_msg)


@router.post("/process")
async def process(
    request: ProcessRequest, background_tasks: BackgroundTasks
) -> Dict[str, str]:
    """Launch video processing in the background and return a job ID."""
    job_id = str(uuid.uuid4())
    job_store.create(job_id, "render", request.model_dump())
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
        source = find_source(file_id)
        if source:
            return source

    raise HTTPException(
        status_code=400,
        detail="Fichier vidéo introuvable sur le disque.",
    )


# Sources up to this length are transcribed whole and cached; longer ones
# only have the selected segment transcribed.
FULL_TRANSCRIPT_MAX_DURATION = 600.0


def _transcribe_segment(
    input_path: str, start_t: float, end_t: float,
    quality: Optional[str], vocabulary: Optional[str],
) -> List[Dict[str, Any]]:
    logger.info("[transcribe] Extraction audio %.2fs → %.2fs", start_t, end_t)
    audio_path = os.path.abspath(
        os.path.join(MEDIA_DIR, f"{uuid.uuid4()}_transcribe.wav")
    )
    try:
        ffmpeg_service.extract_audio(input_path, audio_path, start_t, end_t)
        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            raise HTTPException(
                status_code=400,
                detail="L'extraction audio a généré un fichier vide.",
            )
        return whisper_service.transcribe(audio_path, quality, vocabulary)
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def _transcribe_request(request: TranscribeRequest) -> Dict[str, Any]:
    """Transcribe the requested range; raise HTTPException on bad input."""
    input_path = _resolve_input_path(request.file_id, request.video_path)
    logger.info("[transcribe] Fichier source : %s", input_path)
    print(f"[transcribe] Fichier source : {input_path}")

    # Explicit float coercion — the payload may send strings or 0.
    start_t = float(request.start_time or 0.0)
    end_t = float(request.end_time) if request.end_time else None
    duration = ffmpeg_service.get_duration(input_path)

    # Default to the full media duration when end_time is missing/zero.
    if end_t is None or end_t <= start_t:
        end_t = duration
    if end_t <= start_t:
        raise HTTPException(
            status_code=400,
            detail=f"Plage temporelle invalide : start_time={start_t}, end_time={end_t}.",
        )

    if duration <= FULL_TRANSCRIPT_MAX_DURATION:
        # Short source: transcribe it whole once (cached), then slice.
        # Changing the trim or picking a moment is then instant.
        file_id = os.path.splitext(os.path.basename(input_path))[0]
        transcript = moment_finder.get_transcript(
            file_id, input_path, request.quality, request.vocabulary
        )
        words = moment_finder.clip_words(transcript["words"], start_t, end_t)
    else:
        words = _transcribe_segment(
            input_path, start_t, end_t, request.quality, request.vocabulary
        )

    logger.info("[transcribe] %d mot(s) transcrit(s).", len(words))
    print(f"[transcribe] {len(words)} mot(s) transcrit(s).")
    return {
        "status": "success",
        "text": _words_to_text(words),
        "words": words,
        "word_count": len(words),
        "whisper": whisper_service.get_runtime_config(),
    }


@router.post("/transcribe")
def transcribe(request: TranscribeRequest) -> Dict[str, Any]:
    """Synchronous transcription (kept for API clients; the UI uses jobs)."""
    try:
        return _transcribe_request(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ERROR /api/transcribe] Traceback backend :\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Erreur serveur transcription: {str(e)}")


def _transcribe_job(job_id: str, request: TranscribeRequest) -> None:
    job_store.update(job_id, status="processing", progress=10)
    try:
        result = _transcribe_request(request)
        job_store.update(job_id, status="completed", progress=100, result=result)
    except HTTPException as e:
        job_store.update(job_id, status="failed", error=str(e.detail))
    except Exception as e:
        logger.error("[transcribe-job] Échec :\n%s", traceback.format_exc())
        job_store.update(job_id, status="failed", error=f"Erreur de transcription : {e}")


@router.post("/transcribe/start")
async def start_transcription(
    request: TranscribeRequest, background_tasks: BackgroundTasks
) -> Dict[str, str]:
    """Run the transcription in the background; poll /api/status/{job_id}.

    A long-held HTTP request dies when a phone locks or a tab goes to the
    background; a job keeps running and the page just picks the result up.
    """
    job_id = str(uuid.uuid4())
    job_store.create(job_id, "transcribe", request.model_dump())
    background_tasks.add_task(_transcribe_job, job_id, request)
    return {"job_id": job_id}
