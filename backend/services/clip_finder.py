import random
import logging
from typing import Dict, List, Optional, Tuple

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


def pick_random_clip(
    input_path: str,
    min_duration: float = 15.0,
    max_duration: float = 45.0,
    seed: Optional[int] = None,
) -> Dict[str, float]:
    """Pick a random [start, end] window that begins and ends on speech pauses.

    Falls back to a purely random window when the audio has no usable pauses
    (music, continuous noise) or silence detection fails.
    """
    rng = random.Random(seed)
    duration = ffmpeg_service.get_duration(input_path)
    if duration <= 0:
        raise ValueError("Durée de la vidéo illisible.")

    # Short source: the clip is simply the whole video.
    if duration <= min_duration:
        return {"start_time": 0.0, "end_time": round(duration, 2), "snapped": False}

    max_duration = min(max_duration, duration)
    min_duration = min(min_duration, max_duration)
    target = rng.uniform(min_duration, max_duration)

    lo = EDGE_MARGIN if duration > min_duration + 2 * EDGE_MARGIN else 0.0
    hi = duration - (EDGE_MARGIN if lo else 0.0)

    try:
        silences = ffmpeg_service.detect_silences(input_path)
    except Exception as exc:  # silence detection is best-effort
        logger.warning("[clip_finder] silencedetect a échoué : %s", exc)
        silences = []

    starts = [s for s in _speech_starts(silences) if lo <= s <= hi - min_duration]
    stops = _speech_stops(silences)

    if len(starts) >= MIN_SNAP_CANDIDATES:
        start = rng.choice(starts)
        candidates = [
            e for e in stops if start + min_duration <= e <= start + max_duration
        ]
        if candidates:
            end = min(candidates, key=lambda e: abs(e - (start + target)))
            snapped = True
        else:
            end = min(start + target, hi)
            snapped = False
    else:
        start = rng.uniform(lo, max(lo, hi - target))
        end = min(start + target, duration)
        snapped = False

    logger.info(
        "[clip_finder] Clip aléatoire %.2fs → %.2fs (%d pause(s), calé=%s)",
        start, end, len(silences), snapped,
    )
    return {"start_time": round(start, 2), "end_time": round(end, 2), "snapped": snapped}
