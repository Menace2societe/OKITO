import os
from typing import List, Dict, Any
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "medium")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
LANGUAGE = "fr"
INITIAL_PROMPT = (
    "Transcription en français, argot, termes de rap, ClipFlow, 243, Kinshasa."
)
# Marker used to detect (and drop) the prompt if the model regurgitates it.
PROMPT_ECHO_MARKER = "Transcription en français"

_model = None

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model

def transcribe(audio_path: str) -> List[Dict[str, Any]]:
    model = get_model()
    # initial_prompt only conditions the decoding — it is never merged into the
    # returned text, but some decoders may still echo it as a segment.
    segments, info = model.transcribe(
        audio_path,
        language=LANGUAGE,
        initial_prompt=INITIAL_PROMPT,
        word_timestamps=True,
        beam_size=5,
    )

    words_list = []
    for segment in segments:
        segment_text = segment.text or ""
        if PROMPT_ECHO_MARKER.lower() in segment_text.lower():
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

    return words_list
