import os
import logging
from typing import List, Dict, Any
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "medium")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
LANGUAGE = "fr"
INITIAL_PROMPT = (
    "Transcription en français, argot, termes de rap, ClipFlow, 243, Kinshasa."
)
# Marker used to detect (and drop) the prompt if the model regurgitates it.
PROMPT_ECHO_MARKER = "Transcription en français"

# Primary decoding pass — temperature fallback nudges speech detection on
# quiet, fast or noisy audio instead of returning an empty segment list.
BASE_DECODE_PARAMS: Dict[str, Any] = {
    "language": LANGUAGE,
    "initial_prompt": INITIAL_PROMPT,
    "word_timestamps": True,
    "beam_size": 5,
    "temperature": [0.0, 0.2, 0.4],
}

# Permissive retry used only when the primary pass yields no words.
FALLBACK_DECODE_PARAMS: Dict[str, Any] = {
    "language": LANGUAGE,
    "initial_prompt": INITIAL_PROMPT,
    "word_timestamps": True,
    "beam_size": 1,
    "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
    "condition_on_previous_text": False,
    "no_speech_threshold": 0.85,
    "log_prob_threshold": -2.0,
}

_model = None

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


def _collect_words(segments) -> tuple[List[Dict[str, Any]], int]:
    """Flatten segments into word dicts, dropping echoed-prompt entries."""
    words_list: List[Dict[str, Any]] = []
    segment_count = 0
    for segment in segments:
        segment_count += 1
        segment_text = segment.text or ""
        if PROMPT_ECHO_MARKER.lower() in segment_text.lower():
            logger.info("[whisper] Segment ignoré (écho du prompt) : %r", segment_text[:80])
            continue
        if not segment.words:
            continue
        for word in segment.words:
            word_text = word.word or ""
            if PROMPT_ECHO_MARKER.lower() in word_text.lower():
                continue
            words_list.append({
                "start": word.start,
                "end": word.end,
                "text": word.word
            })
    return words_list, segment_count


def transcribe(audio_path: str) -> List[Dict[str, Any]]:
    model = get_model()

    logger.info(
        "[whisper] Transcription de %s (modèle=%s, langue=%s)",
        audio_path, MODEL_SIZE, LANGUAGE,
    )
    print(f"[whisper] Transcription de {audio_path} (modèle={MODEL_SIZE}, langue={LANGUAGE})")

    segments, info = model.transcribe(audio_path, **BASE_DECODE_PARAMS)
    words_list, segment_count = _collect_words(segments)

    if not words_list:
        logger.warning(
            "[whisper] Premier passage vide — nouvelle tentative avec paramètres permissifs."
        )
        print("[whisper] Premier passage vide — nouvelle tentative (temperature étendue).")
        segments, info = model.transcribe(audio_path, **FALLBACK_DECODE_PARAMS)
        words_list, segment_count = _collect_words(segments)

    logger.info(
        "[whisper] %d segment(s), %d mot(s) retournés.", segment_count, len(words_list)
    )
    print(f"[whisper] {segment_count} segment(s), {len(words_list)} mot(s) retournés.")

    if not words_list:
        logger.warning("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")
        print("[WARN] Aucun texte détecté par Whisper pour cette vidéo.")

    return words_list
