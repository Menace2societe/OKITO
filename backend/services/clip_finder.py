import random
import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.services import ffmpeg_service

logger = logging.getLogger(__name__)

# Never start a random clip in the first/last seconds (intros, outros, end cards).
EDGE_MARGIN = 3.0
# Below this many pause candidates (music, continuous speech) snapping would
# always return the same window, so a purely random window is used instead.
MIN_SNAP_CANDIDATES = 3


def _speech_starts(silences: List[Tuple[float, float]]) -> List[float]:
    """Moments where speech resumes after a pause — natural clip starts."""
    return [end for _, end in silences]


def _speech_stops(silences: List[Tuple[float, float]]) -> List[float]:
    """Moments where a pause begins — natural clip ends (with a small tail)."""
    return [start + 0.15 for start, _ in silences]


def _silences(input_path: str) -> List[Tuple[float, float]]:
    try:
        return ffmpeg_service.detect_silences(input_path)
    except Exception as exc:  # silence detection is best-effort
        logger.warning("[clip_finder] silencedetect a échoué : %s", exc)
        return []


def _pick(
    rng: random.Random,
    duration: float,
    silences: List[Tuple[float, float]],
    min_duration: float,
    max_duration: float,
    taken: List[Tuple[float, float]],
) -> Optional[Dict[str, Any]]:
    """One random window that avoids the `taken` ones; None if none fits."""
    # Short source: the clip is simply the whole video.
    if duration <= min_duration:
        return None if taken else {"start_time": 0.0, "end_time": round(duration, 2), "snapped": False}

    max_duration = min(max_duration, duration)
    min_duration = min(min_duration, max_duration)
    lo = EDGE_MARGIN if duration > min_duration + 2 * EDGE_MARGIN else 0.0
    hi = duration - (EDGE_MARGIN if lo else 0.0)
    stops = _speech_stops(silences)

    def free(a: float, b: float) -> bool:
        return all(b <= s or a >= e for s, e in taken)

    for _ in range(50):
        target = rng.uniform(min_duration, max_duration)
        starts = [s for s in _speech_starts(silences) if lo <= s <= hi - min_duration]
        if len(starts) >= MIN_SNAP_CANDIDATES:
            start = rng.choice(starts)
            candidates = [e for e in stops if start + min_duration <= e <= start + max_duration]
            if candidates:
                end = min(candidates, key=lambda e: abs(e - (start + target)))
                snapped = True
            else:
                end, snapped = min(start + target, hi), False
        else:
            start = rng.uniform(lo, max(lo, hi - target))
            end, snapped = min(start + target, hi), False
        if free(start, end):
            return {"start_time": round(start, 2), "end_time": round(end, 2), "snapped": snapped}
    return None


def pick_random_clip(
    input_path: str,
    min_duration: float = 15.0,
    max_duration: float = 45.0,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """Pick a random [start, end] window that begins and ends on speech pauses.

    Falls back to a purely random window when the audio has no usable pauses
    (music, continuous noise) or silence detection fails.
    """
    clips = pick_random_clips(input_path, 1, min_duration, max_duration, seed)
    if not clips:
        raise ValueError("Impossible de choisir un extrait dans cette vidéo.")
    return clips[0]


def pick_random_clips(
    input_path: str,
    count: int,
    min_duration: float = 15.0,
    max_duration: float = 45.0,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Up to `count` non-overlapping random windows, in chronological order."""
    rng = random.Random(seed)
    duration = ffmpeg_service.get_duration(input_path)
    if duration <= 0:
        raise ValueError("Durée de la vidéo illisible.")
    silences = _silences(input_path)

    clips: List[Dict[str, Any]] = []
    for _ in range(count):
        clip = _pick(rng, duration, silences, min_duration, max_duration,
                     [(c["start_time"], c["end_time"]) for c in clips])
        if clip is None:
            break
        clips.append(clip)
    logger.info("[clip_finder] %d clip(s) aléatoire(s) sur %d demandé(s) (%d pause(s))",
                len(clips), count, len(silences))
    return sorted(clips, key=lambda c: c["start_time"])
