"""Find the strongest moments of a video for short-form clips.

1. The full audio is transcribed once with Whisper (cached per file_id).
2. The transcript is cut into sentence segments.
3. Claude picks the best self-contained passages (by segment index, so it
   can't invent timestamps). Without API credentials, or if the call fails,
   a local heuristic (speech density, loudness, punctuation, hook words)
   ranks candidate windows instead.
"""
import json
import logging
import os
import re
import uuid
import wave
from typing import Any, Callable, Dict, List, Optional

import numpy as np

from backend.config import MEDIA_DIR
from backend.services import ffmpeg_service, whisper_service
from backend.services.subtitle_service import _sanitize_words

logger = logging.getLogger(__name__)

LLM_MODEL = os.getenv("CLIPFLOW_LLM_MODEL", "claude-opus-5-5")
LLM_ENABLED = os.getenv("CLIPFLOW_LLM", "on").lower() not in ("0", "off", "false")

SEGMENT_GAP = 0.7          # pause (s) that closes a sentence segment
SEGMENT_MAX_WORDS = 30

HOOK_WORDS = {
    "jamais", "toujours", "personne", "secret", "vrai", "vérité", "pourquoi",
    "comment", "incroyable", "attention", "écoute", "regarde", "imagine",
    "problème", "argent", "erreur", "meilleur", "pire",
}

ProgressFn = Callable[[int], None]


# ---------------------------------------------------------------------------
# Transcript (cached)
# ---------------------------------------------------------------------------

def _transcript_path(file_id: str) -> str:
    return os.path.join(MEDIA_DIR, f"{file_id}.transcript.json")


def get_transcript(file_id: str, input_path: str) -> Dict[str, Any]:
    """Return {"duration", "words", "energy"} for the whole file, cached on disk."""
    cache = _transcript_path(file_id)
    if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(input_path):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)

    duration = ffmpeg_service.get_duration(input_path)
    audio_path = os.path.join(MEDIA_DIR, f"{uuid.uuid4()}_transcribe.wav")
    try:
        ffmpeg_service.extract_audio(input_path, audio_path, 0.0, duration)
        energy = _energy_per_second(audio_path)
        words = _sanitize_words(whisper_service.transcribe(audio_path))
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

    data = {
        "duration": duration,
        "words": [
            {"text": (w["text"] or "").strip(), "start": float(w["start"]), "end": float(w["end"])}
            for w in words
        ],
        "energy": energy,
    }
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def _energy_per_second(wav_path: str) -> List[float]:
    """RMS loudness of each second of a 16 kHz mono PCM WAV."""
    with wave.open(wav_path, "rb") as wav:
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
    seconds = len(samples) // rate
    if seconds == 0:
        return []
    frames = samples[: seconds * rate].astype(np.float32).reshape(seconds, rate)
    return [round(float(v), 2) for v in np.sqrt((frames ** 2).mean(axis=1))]


def _segments(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group words into sentence-like segments."""
    segments: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []
    for i, word in enumerate(words):
        current.append(word)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if (
            nxt is None
            or word["text"].endswith((".", "!", "?", "…"))
            or nxt["start"] - word["end"] > SEGMENT_GAP
            or len(current) >= SEGMENT_MAX_WORDS
        ):
            segments.append({
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "text": " ".join(w["text"] for w in current),
            })
            current = []
    return segments


# ---------------------------------------------------------------------------
# Claude ranking
# ---------------------------------------------------------------------------

_MOMENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "moments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start_segment": {"type": "integer"},
                    "end_segment": {"type": "integer"},
                    "title": {"type": "string"},
                    "reason": {"type": "string"},
                    "score": {"type": "integer"},
                },
                "required": ["start_segment", "end_segment", "title", "reason", "score"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["moments"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Tu es monteur vidéo spécialisé TikTok, Reels et YouTube Shorts. On te donne la "
    "transcription horodatée d'une vidéo, découpée en segments numérotés. Choisis les "
    "passages qui feront les meilleurs clips courts : une accroche forte dès la première "
    "phrase, une idée complète et compréhensible sans contexte, de l'émotion, de l'humour, "
    "une punchline ou une révélation. Un clip commence au début d'un segment et finit à la "
    "fin d'un segment. Les clips ne doivent pas se chevaucher. Donne un titre court et "
    "accrocheur (dans la langue de la vidéo), la raison du choix en une phrase, et un score "
    "de 0 à 100. Classe les clips du meilleur au moins bon."
)


def _rank_with_claude(
    segments: List[Dict[str, Any]], count: int, min_d: float, max_d: float
) -> List[Dict[str, Any]]:
    import anthropic

    lines = "\n".join(
        f"[{i}] {s['start']:.1f}-{s['end']:.1f}s : {s['text']}" for i, s in enumerate(segments)
    )
    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=LLM_MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=_SYSTEM_PROMPT,
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": _MOMENTS_SCHEMA},
        },
        messages=[{
            "role": "user",
            "content": (
                f"Trouve jusqu'à {count} clips de {min_d:.0f} à {max_d:.0f} secondes.\n\n"
                f"<transcription>\n{lines}\n</transcription>"
            ),
        }],
    )
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Réponse Claude incomplète (stop_reason={response.stop_reason})")
    text = next(b.text for b in response.content if b.type == "text")
    picks = json.loads(text)["moments"]

    moments = []
    for pick in picks:
        a = max(0, min(pick["start_segment"], len(segments) - 1))
        b = max(a, min(pick["end_segment"], len(segments) - 1))
        moments.append({
            "start_time": segments[a]["start"],
            "end_time": segments[b]["end"],
            "title": pick["title"],
            "reason": pick["reason"],
            "score": pick["score"],
        })
    return moments


# ---------------------------------------------------------------------------
# Local heuristic ranking
# ---------------------------------------------------------------------------

def _window_score(text: str, n_words: int, dur: float, energy: List[float], start: float, end: float) -> float:
    density = min(n_words / max(dur, 1.0) / 3.0, 1.0)            # ~3 words/s = lively
    tokens = re.findall(r"\w+", text.lower())
    hooks = min(sum(t in HOOK_WORDS for t in tokens) / 3.0, 1.0)
    punct = min((text.count("!") + text.count("?")) / 3.0, 1.0)
    numbers = 1.0 if re.search(r"\d", text) else 0.0
    loud = 0.0
    if energy:
        seg = energy[int(start):max(int(start) + 1, int(end))]
        loud = float(np.mean(seg)) / (max(energy) or 1.0)
    return 35 * density + 25 * loud + 20 * hooks + 15 * punct + 5 * numbers


def _rank_heuristic(
    transcript: Dict[str, Any], segments: List[Dict[str, Any]], count: int, min_d: float, max_d: float
) -> List[Dict[str, Any]]:
    energy: List[float] = transcript.get("energy") or []
    duration = transcript["duration"]
    target = (min_d + max_d) / 2
    candidates = []

    if segments:
        # Each window starts on a sentence and grows to ~target, never past max.
        for i, first in enumerate(segments):
            last = None
            for j in range(i, len(segments)):
                dur = segments[j]["end"] - first["start"]
                if dur > max_d:
                    break
                if dur >= min_d:
                    last = j
                if dur >= target:
                    break
            if last is None:
                continue
            end = segments[last]["end"]
            text = " ".join(s["text"] for s in segments[i:last + 1])
            score = _window_score(text, len(text.split()), end - first["start"], energy, first["start"], end)
            candidates.append((score, first["start"], end, text))
    else:
        # No speech (instrumental): rank fixed windows by loudness only.
        step = max(1.0, min_d / 2)
        t = 0.0
        while t + target <= duration:
            candidates.append((_window_score("", 0, target, energy, t, t + target), t, t + target, ""))
            t += step

    candidates.sort(key=lambda c: c[0], reverse=True)
    best = max((c[0] for c in candidates), default=1.0) or 1.0
    moments: List[Dict[str, Any]] = []
    for score, start, end, text in candidates:
        if any(start < m["end_time"] and end > m["start_time"] for m in moments):
            continue
        title = " ".join(text.split()[:7]) + ("…" if len(text.split()) > 7 else "")
        moments.append({
            "start_time": start,
            "end_time": end,
            "title": title or f"Passage {start:.0f}s",
            "reason": "Débit de parole, intensité sonore et mots d'accroche.",
            "score": int(100 * score / best),
        })
        if len(moments) >= count:
            break
    return moments


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _clip_words(words: List[Dict[str, Any]], start: float, end: float) -> List[Dict[str, Any]]:
    """Words inside [start, end], re-timed relative to the clip start."""
    return [
        {"text": w["text"], "start": round(w["start"] - start, 3), "end": round(w["end"] - start, 3)}
        for w in words
        if w["start"] >= start - 0.05 and w["end"] <= end + 0.05
    ]


def find_moments(
    file_id: str,
    input_path: str,
    count: int = 5,
    min_duration: float = 15.0,
    max_duration: float = 60.0,
    progress: Optional[ProgressFn] = None,
) -> Dict[str, Any]:
    """Return {"source": "claude"|"heuristic", "moments": [...]}, best first.

    Each moment carries its transcript text and clip-relative words, so the
    render can burn subtitles without running Whisper again.
    """
    report = progress or (lambda _p: None)
    report(5)
    transcript = get_transcript(file_id, input_path)
    report(70)
    words = transcript["words"]
    segments = _segments(words)

    moments: List[Dict[str, Any]] = []
    source = "heuristic"
    if LLM_ENABLED and segments:
        try:
            moments = _rank_with_claude(segments, count, min_duration, max_duration)
            source = "claude"
        except Exception as exc:  # no credentials, network, refusal… → local ranking
            logger.warning("[moments] Classement Claude indisponible (%s) : heuristique locale.", exc)
    if not moments:
        moments = _rank_heuristic(transcript, segments, count, min_duration, max_duration)
    report(90)

    for m in moments:
        m["start_time"] = round(max(0.0, m["start_time"] - 0.1), 2)
        m["end_time"] = round(min(transcript["duration"], m["end_time"] + 0.25), 2)
        m["words"] = _clip_words(words, m["start_time"], m["end_time"])
        m["text"] = " ".join(w["text"] for w in m["words"])
        m["source"] = source
    return {"source": source, "moments": moments[:count]}
