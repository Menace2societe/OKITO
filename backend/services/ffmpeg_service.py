import subprocess
import logging
import os
import shutil
from typing import Optional

logger = logging.getLogger(__name__)

ASPECT_RATIOS = {
    "9:16": "scale=-2:1920,crop=1080:1920",
    "1:1": r"crop=min(iw\,ih):min(iw\,ih),scale=1080:1080",
    "16:9": "scale=1920:-2,crop=1920:1080"
}

# Dynamic colour-grade filter chains selected from the frontend.
VIDEO_FILTERS = {
    "cinema_intense": (
        "eq=contrast=1.25:brightness=-0.02:saturation=1.35,"
        "colorbalance=rs=0.08:gs=-0.02:bs=-0.08:rm=0.05:bm=-0.05"
    ),
    "vibrant_social": "eq=contrast=1.15:brightness=0.00:saturation=1.40",
    "bw_deep": "hue=s=0,eq=contrast=1.30:brightness=-0.03",
    "none": None,
}

DEFAULT_VIDEO_FILTER = "cinema_intense"


def _find_ffmpeg() -> str:
    """Return the ffmpeg binary path, or raise if not found."""
    path = shutil.which("ffmpeg")
    if path:
        return path
    # Common Windows install locations
    for candidate in [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        os.path.expanduser(r"~\ffmpeg\bin\ffmpeg.exe"),
    ]:
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError(
        "ffmpeg introuvable dans le PATH. "
        "Installez FFmpeg et ajoutez-le au PATH, ou placez-le dans C:\\ffmpeg\\bin\\."
    )


def _find_ffprobe() -> str:
    """Return the ffprobe binary path, or raise if not found."""
    path = shutil.which("ffprobe")
    if path:
        return path
    for candidate in [
        r"C:\ffmpeg\bin\ffprobe.exe",
        r"C:\Program Files\ffmpeg\bin\ffprobe.exe",
        os.path.expanduser(r"~\ffmpeg\bin\ffprobe.exe"),
    ]:
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError(
        "ffprobe introuvable dans le PATH. "
        "Installez FFmpeg et ajoutez-le au PATH."
    )


def _run_cmd(cmd: list[str], label: str = "ffmpeg") -> subprocess.CompletedProcess[str]:
    """Run a command, log it, and raise with full stderr on failure."""
    logger.info("[%s] Commande : %s", label, " ".join(cmd))
    print(f"[{label}] >>> {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip() or "Code de retour non nul"
        logger.error("[%s] ÉCHEC (code %d) :\n%s", label, result.returncode, error_msg)
        print(f"[{label}] ERREUR (code {result.returncode}):\n{error_msg}")
        raise RuntimeError(f"{label} a échoué (code {result.returncode}) : {error_msg}")

    logger.info("[%s] OK", label)
    return result


def get_duration(file_path: str) -> float:
    """Get media duration in seconds via ffprobe."""
    abs_path = os.path.abspath(file_path)
    cmd = [
        _find_ffprobe(),
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        abs_path,
    ]
    try:
        result = _run_cmd(cmd, label="ffprobe")
        return float(result.stdout.strip())
    except Exception as e:
        logger.warning("Impossible d'obtenir la durée de %s : %s", abs_path, e)
        return 0.0


def extract_audio(
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float,
) -> None:
    """Extract audio segment as 16kHz mono WAV for Whisper."""
    cmd = [
        _find_ffmpeg(),
        "-y",
        "-ss", str(start_time),
        "-to", str(end_time),
        "-i", os.path.abspath(input_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        os.path.abspath(output_path),
    ]
    _run_cmd(cmd, label="ffmpeg:extract_audio")


def _ass_path_for_ffmpeg(ass_path: str) -> str:
    """Convert an ASS file path to a relative path with forward slashes.

    Using a relative path avoids the Windows drive letter colon (C:)
    which FFmpeg's filter parser misinterprets as an option separator.

    C:\\Users\\HP\\...\\media\\file.ass  ->  backend/media/file.ass
    """
    rel = os.path.relpath(ass_path, start=os.getcwd())
    return rel.replace("\\", "/")


def process_video(
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float,
    aspect_ratio: str,
    ass_path: Optional[str] = None,
    video_filter: str = DEFAULT_VIDEO_FILTER,
) -> str:
    """Trim, crop, optionally colour-grade, burn subtitles, and encode."""
    abs_input = os.path.abspath(input_path)
    abs_output = os.path.abspath(output_path)

    # Build video filter chain: framing first, then optional colour grade.
    vf_parts = [ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["16:9"])]

    filter_chain = VIDEO_FILTERS.get(video_filter, VIDEO_FILTERS[DEFAULT_VIDEO_FILTER])
    if filter_chain:
        vf_parts.append(filter_chain)

    if ass_path:
        rel_ass = _ass_path_for_ffmpeg(os.path.abspath(ass_path))
        vf_parts.append(f"ass={rel_ass}")

    vf_chain = ",".join(vf_parts)

    # Pick encoder settings based on the requested output container.
    ext = os.path.splitext(abs_output)[1].lower()

    if ext == ".mp3":
        # Audio-only export: no video codec, no video filter output.
        output_options = [
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
        ]
    else:
        # Universal H.264 / AAC / yuv420p settings for broad playback support
        # (web, Windows Media Player, mobile). Without yuv420p, FFmpeg may
        # preserve a 10-bit / 4:2:2 source that many players cannot decode.
        output_options = [
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
        ]
        if ext == ".mp4":
            # faststart only applies to the MP4/MOV muxer.
            output_options += ["-movflags", "+faststart"]

    cmd = [
        _find_ffmpeg(),
        "-y",
        "-ss", str(start_time),
        "-to", str(end_time),
        "-i", abs_input,
    ]
    if ext != ".mp3":
        cmd += ["-vf", vf_chain]
    cmd += [*output_options, abs_output]

    _run_cmd(cmd, label="ffmpeg:process_video")
    return abs_output


