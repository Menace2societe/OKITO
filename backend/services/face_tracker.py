"""Face-following 9:16 reframing.

Faces are detected on sampled frames, the horizontal track is smoothed like a
camera operator would (dead zone + eased pans), then written as an FFmpeg
`sendcmd` script that moves the crop window over time.
"""
import logging
import os
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_FPS = 4.0          # detection frames per second
COMMAND_FPS = 15.0        # crop updates per second written to sendcmd
DETECT_WIDTH = 480        # frames are downscaled before detection (speed)
DEAD_ZONE = 0.08          # ignore face moves smaller than this (fraction of width)
EASING = 0.12             # per-command fraction of the remaining distance covered

_cascade: Optional[cv2.CascadeClassifier] = None


def _get_cascade() -> cv2.CascadeClassifier:
    global _cascade
    if _cascade is None:
        path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        _cascade = cv2.CascadeClassifier(path)
    return _cascade


def _largest_face_center(frame: np.ndarray) -> Optional[float]:
    """Return the normalised x centre (0..1) of the biggest face, if any."""
    h, w = frame.shape[:2]
    scale = DETECT_WIDTH / w
    small = cv2.resize(frame, (DETECT_WIDTH, int(h * scale)))
    gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    faces = _get_cascade().detectMultiScale(
        gray, scaleFactor=1.15, minNeighbors=6, minSize=(int(DETECT_WIDTH * 0.06),) * 2
    )
    if len(faces) == 0:
        return None
    x, _, fw, _ = max(faces, key=lambda f: f[2] * f[3])
    return (x + fw / 2) / DETECT_WIDTH


def detect_track(input_path: str, start: float, end: float) -> List[Tuple[float, Optional[float]]]:
    """Sample [start, end] and return (clip_time, face_x or None) pairs."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV ne peut pas ouvrir {input_path}")
    track: List[Tuple[float, Optional[float]]] = []
    try:
        t = 0.0
        while start + t < end:
            cap.set(cv2.CAP_PROP_POS_MSEC, (start + t) * 1000)
            ok, frame = cap.read()
            if not ok:
                break
            track.append((t, _largest_face_center(frame)))
            t += 1.0 / SAMPLE_FPS
    finally:
        cap.release()
    return track


def _fill_and_smooth(track: List[Tuple[float, Optional[float]]]) -> Tuple[np.ndarray, np.ndarray]:
    """Interpolate gaps, drop one-frame false positives, return (times, xs)."""
    times = np.array([t for t, _ in track], dtype=float)
    raw = np.array([np.nan if x is None else x for _, x in track], dtype=float)
    known = ~np.isnan(raw)
    if not known.any():
        return times, np.full_like(times, 0.5)
    xs = np.interp(times, times[known], raw[known])
    # Rolling median removes isolated jumps (a detection on a poster, etc.).
    k = 5
    padded = np.pad(xs, k // 2, mode="edge")
    return times, np.array([np.median(padded[i:i + k]) for i in range(len(xs))])


def _camera_path(times: np.ndarray, xs: np.ndarray, duration: float) -> List[Tuple[float, float]]:
    """Resample at COMMAND_FPS with a dead zone and eased motion."""
    path: List[Tuple[float, float]] = []
    cam = float(xs[0]) if len(xs) else 0.5
    target = cam
    steps = max(1, int(duration * COMMAND_FPS))
    for i in range(steps + 1):
        t = i / COMMAND_FPS
        face = float(np.interp(t, times, xs)) if len(xs) else 0.5
        if abs(face - target) > DEAD_ZONE:
            target = face
        cam += (target - cam) * EASING
        path.append((t, cam))
    return path


def write_crop_commands(
    input_path: str,
    start: float,
    end: float,
    scaled_width: int,
    crop_width: int,
    cmd_path: str,
    filter_name: str = "crop@face",
) -> int:
    """Write the sendcmd script; return the initial crop x (pixels)."""
    track = detect_track(input_path, start, end)
    detected = sum(1 for _, x in track if x is not None)
    logger.info("[face] %d/%d image(s) avec visage", detected, len(track))
    times, xs = _fill_and_smooth(track)
    path = _camera_path(times, xs, end - start)

    max_x = max(0, scaled_width - crop_width)

    def to_px(cx: float) -> int:
        return int(min(max_x, max(0, cx * scaled_width - crop_width / 2)))

    with open(cmd_path, "w", encoding="utf-8") as f:
        for t, cx in path:
            f.write(f"{t:.3f} {filter_name} x {to_px(cx)};\n")
    return to_px(path[0][1]) if path else max_x // 2
