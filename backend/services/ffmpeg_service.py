import subprocess
import logging
import os
import shutil
from typing import Optional

logger = logging.getLogger(__name__)

ASPECT_RATIOS = {
    "9:16": "scale=-2:1920,crop=1080:1920",
    # 9:16_fit keeps the full frame (no crop) and fills letterbox bars with a
    # blurred copy of the video. The actual filter_complex is built in
    # process_video() because it requires stream splitting.
    "9:16_fit": None,
    "1:1": r"crop=min(iw\,ih):min(iw\,ih),scale=1080:1080",
    "16:9": "scale=1920:-2,crop=1920:1080"
}

# Dynamic colour-grade filter chains selected from the frontend.
# A light unsharp pass is added to most looks: social platforms re-encode
# uploads aggressively, and a touch of sharpening survives that better.
_SHARPEN = "unsharp=5:5:0.6:5:5:0.0"

VIDEO_FILTERS = {
    # Teal & orange blockbuster look with a soft vignette.
    "cinema_intense": (
        "eq=contrast=1.20:brightness=-0.02:saturation=1.25,"
        "colorbalance=rs=0.08:gs=-0.02:bs=-0.08:rm=0.05:bm=-0.05:rh=0.04:bh=-0.06,"
        f"vignette=PI/5,{_SHARPEN}"
    ),
    # Punchy colours that keep skin tones natural (vibrance > saturation).
    "vibrant_social": (
        "eq=contrast=1.10:brightness=0.02:saturation=1.15,"
        f"vibrance=intensity=0.35,{_SHARPEN}"
    ),
    # Golden-hour vlog look.
    "warm_vlog": (
        "colortemperature=temperature=4800:mix=0.6,"
        f"eq=contrast=1.06:brightness=0.03:saturation=1.12,{_SHARPEN}"
    ),
    # Cold blue/teal night look.
    "cold_teal": (
        "colortemperature=temperature=9000:mix=0.5,"
        "eq=contrast=1.15:brightness=-0.03:saturation=0.95,"
        f"vignette=PI/6,{_SHARPEN}"
    ),
    # Faded film with grain and vignette.
    "vintage_film": (
        "curves=preset=vintage,eq=contrast=0.95:saturation=0.85,"
        "noise=alls=8:allf=t,vignette=PI/4"
    ),
    # High-contrast monochrome with fine grain.
    "bw_deep": f"hue=s=0,eq=contrast=1.30:brightness=-0.03,noise=alls=5:allf=t,{_SHARPEN}",
    "none": None,
}

# EBU R128 loudness target used by TikTok / Reels / Shorts (~-14 LUFS).
AUDIO_LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"

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


def _build_fit_blur_filter(
    color_filter: Optional[str],
    ass_path: Optional[str],
) -> str:
    """Build the -filter_complex string for 9:16_fit (fit + blur background).

    Graph:
      [0:v] ─► scale-up + crop 1080×1920 ─► boxblur ─► [bg]
      [0:v] ─► scale-down (fit inside 1080×1920) ─► [fg]
      [bg][fg] overlay centred ─► (colour grade) ─► (ass) ─► [out]
    """
    parts = [
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,boxblur=20:5[bg]",
        "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
    ]

    # Post-overlay chain: colour grade, then ASS burn-in.
    post: list[str] = []
    if color_filter:
        post.append(color_filter)
    if ass_path:
        rel_ass = _ass_path_for_ffmpeg(os.path.abspath(ass_path))
        post.append(f"ass={rel_ass}")

    overlay = "[bg][fg]overlay=(W-w)/2:(H-h)/2"
    if post:
        overlay += "," + ",".join(post)
    overlay += "[out]"
    parts.append(overlay)

    return ";".join(parts)


def process_video(
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float,
    aspect_ratio: str,
    ass_path: Optional[str] = None,
    video_filter: str = DEFAULT_VIDEO_FILTER,
) -> str:
    """Trim, crop/fit, optionally colour-grade, burn subtitles, and encode."""
    abs_input = os.path.abspath(input_path)
    abs_output = os.path.abspath(output_path)

    use_filter_complex = (aspect_ratio == "9:16_fit")

    color_filter = VIDEO_FILTERS.get(video_filter, VIDEO_FILTERS[DEFAULT_VIDEO_FILTER])

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
            # CRF 20: platforms re-compress uploads, so start from more detail.
            "-crf", "20",
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
        if use_filter_complex:
            # 9:16_fit — full frame on blurred background via filter_complex
            fc = _build_fit_blur_filter(color_filter, ass_path)
            cmd += ["-filter_complex", fc, "-map", "[out]", "-map", "0:a?"]
        else:
            # Standard simple -vf pipeline (crop / scale)
            vf_parts = [ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["16:9"])]
            if color_filter:
                vf_parts.append(color_filter)
            if ass_path:
                rel_ass = _ass_path_for_ffmpeg(os.path.abspath(ass_path))
                vf_parts.append(f"ass={rel_ass}")
            cmd += ["-vf", ",".join(vf_parts)]

    cmd += ["-af", AUDIO_LOUDNORM, *output_options, abs_output]

    _run_cmd(cmd, label="ffmpeg:process_video")
    return abs_output


def detect_silences(
    input_path: str,
    noise_db: float = -30.0,
    min_silence: float = 0.35,
) -> list[tuple[float, float]]:
    """Return (start, end) silence intervals found in the audio track."""
    cmd = [
        _find_ffmpeg(),
        "-hide_banner", "-nostats",
        "-i", os.path.abspath(input_path),
        "-vn", "-sn", "-dn",
        "-ac", "1", "-ar", "16000",
        "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
        "-f", "null", "-",
    ]
    result = _run_cmd(cmd, label="ffmpeg:silencedetect")

    silences: list[tuple[float, float]] = []
    pending_start: Optional[float] = None
    for line in result.stderr.splitlines():
        if "silence_start:" in line:
            pending_start = float(line.split("silence_start:")[1].split()[0])
        elif "silence_end:" in line and pending_start is not None:
            end = float(line.split("silence_end:")[1].split()[0])
            silences.append((pending_start, end))
            pending_start = None
    return silences
