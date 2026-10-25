import subprocess
import logging
import os
import shutil
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

ASPECT_RATIOS = {
    "1:1": r"crop=min(iw\,ih):min(iw\,ih),scale=1080:1080",
    "16:9": "scale=1920:-2,crop=1920:1080"
}

# Vertical 9:16 modes, all rendered by _build_vertical_filter():
#   (default zoom 0-100, follow the face?)
# zoom 0 = whole frame on a blurred background, 100 = frame filled (cropped).
VERTICAL_MODES = {
    "9:16": (100.0, False),
    "9:16_fit": (0.0, False),
    "9:16_face": (100.0, True),
}

# Dynamic looks selected from the frontend, in three parts so that each runs
# on as few pixels as possible (a 9:16 render otherwise grades 1080×1920
# pixels per frame, the slowest step on a small server):
#   grade   per-pixel colour work, applied before the 9:16 overlay;
#   sharpen the picture only (the blurred background has nothing to sharpen);
#   finish  frame-wide effects (vignette, grain), on the final frame.
# A light unsharp pass is added to most looks: social platforms re-encode
# uploads aggressively, and a touch of sharpening survives that better.
_SHARPEN = "unsharp=5:5:0.6:5:5:0.0"


@dataclass(frozen=True)
class Look:
    grade: str
    finish: Optional[str] = None
    sharpen: bool = True

    def chain(self) -> str:
        """The whole look as one filter chain, for a single-picture frame."""
        return ",".join(p for p in (self.grade, _SHARPEN if self.sharpen else None, self.finish) if p)


VIDEO_FILTERS: dict[str, Optional[Look]] = {
    # Teal & orange blockbuster look with a soft vignette.
    "cinema_intense": Look(
        "eq=contrast=1.20:brightness=-0.02:saturation=1.25,"
        "colorbalance=rs=0.08:gs=-0.02:bs=-0.08:rm=0.05:bm=-0.05:rh=0.04:bh=-0.06",
        finish="vignette=PI/5",
    ),
    # Punchy colours that keep skin tones natural (vibrance > saturation).
    "vibrant_social": Look(
        "eq=contrast=1.10:brightness=0.02:saturation=1.15,vibrance=intensity=0.35",
    ),
    # Golden-hour vlog look.
    "warm_vlog": Look(
        "colortemperature=temperature=4800:mix=0.6,"
        "eq=contrast=1.06:brightness=0.03:saturation=1.12",
    ),
    # Cold blue/teal night look.
    "cold_teal": Look(
        "colortemperature=temperature=9000:mix=0.5,"
        "eq=contrast=1.15:brightness=-0.03:saturation=0.95",
        finish="vignette=PI/6",
    ),
    # Faded film with grain and vignette.
    "vintage_film": Look(
        "curves=preset=vintage,eq=contrast=0.95:saturation=0.85",
        finish="noise=alls=8:allf=t,vignette=PI/4",
        sharpen=False,
    ),
    # High-contrast monochrome with fine grain.
    "bw_deep": Look("hue=s=0,eq=contrast=1.30:brightness=-0.03", finish="noise=alls=5:allf=t"),
    "none": None,
}

# EBU R128 loudness target used by TikTok / Reels / Shorts (~-14 LUFS).
AUDIO_LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"

DEFAULT_VIDEO_FILTER = "cinema_intense"

# x264 speed/size trade-off: the online Space, short on CPU, uses "veryfast".
X264_PRESET = os.getenv("CLIPFLOW_X264_PRESET", "fast")


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


def get_video_size(file_path: str) -> tuple[int, int]:
    """Return (width, height) of the first video stream."""
    cmd = [
        _find_ffprobe(),
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        os.path.abspath(file_path),
    ]
    result = _run_cmd(cmd, label="ffprobe:size")
    width, height = result.stdout.strip().split("x")[:2]
    return int(width), int(height)


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
    """Convert a filter file path (ass, sendcmd) to relative forward slashes.

    Using a relative path avoids the Windows drive letter colon (C:)
    which FFmpeg's filter parser misinterprets as an option separator.

    C:\\Users\\HP\\...\\media\\file.ass  ->  backend/media/file.ass
    """
    rel = os.path.relpath(ass_path, start=os.getcwd())
    return rel.replace("\\", "/")


def _even(value: float) -> int:
    return max(2, int(round(value / 2)) * 2)


def _build_vertical_filter(
    crop_width: int,
    crop_x: str,
    look: Optional[Look],
    ass_path: Optional[str],
    face_cmd_path: Optional[str] = None,
) -> str:
    """Build the -filter_complex string for every 9:16 mode.

    Graph:
      [0:v] ─► fill 270×480 ─► boxblur ─► (grade) ─► 1080×1920 ─────► [bg]
      [0:v] ─► (sendcmd) crop crop_width×ih at crop_x ─► 1080 wide
            ─► (grade, sharpen) ─────────────────────────────────────► [fg]
      [bg][fg] overlay centred ─► (finish) ─► (ass) ─► [out]

    A narrow crop fills the frame (classic crop); the full width shows the
    whole picture with blurred bars; anything between is a compromise.
    The background is blurred at a quarter of the size: a blur hides the
    difference, and it is several times cheaper.
    """
    grade = f",{look.grade}" if look else ""
    sharpen = f",{_SHARPEN}" if look and look.sharpen else ""

    fg = "[0:v]"
    crop_name = "crop"
    if face_cmd_path:
        fg += f"sendcmd=f={_ass_path_for_ffmpeg(face_cmd_path)},"
        crop_name = "crop@face"
    fg += f"{crop_name}={crop_width}:ih:{crop_x}:0,scale=1080:-2{grade}{sharpen}[fg]"

    parts = [
        "[0:v]scale=270:480:force_original_aspect_ratio=increase,"
        f"crop=270:480,boxblur=5:3{grade},scale=1080:1920[bg]",
        fg,
    ]

    # Post-overlay chain: frame-wide finish, then ASS burn-in.
    post: list[str] = []
    if look and look.finish:
        post.append(look.finish)
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
    zoom: Optional[float] = None,
) -> str:
    """Trim, frame, optionally colour-grade, burn subtitles, and encode.

    `zoom` (0-100) only applies to 9:16 modes; None uses the mode's default.
    """
    abs_input = os.path.abspath(input_path)
    abs_output = os.path.abspath(output_path)

    vertical = VERTICAL_MODES.get(aspect_ratio)
    face_cmd_path: Optional[str] = None
    crop_width = 0
    crop_x = "(iw-ow)/2"

    if vertical:
        default_zoom, follow_face = vertical
        t = min(100.0, max(0.0, default_zoom if zoom is None else zoom)) / 100
        width, height = get_video_size(abs_input)
        fill_width = min(width, height * 9 / 16)  # crop that fills 9:16
        crop_width = min(width, _even(width * (1 - t) + fill_width * t))

        if follow_face and crop_width < width:
            # Imported lazily: OpenCV is only needed for this framing mode.
            from backend.services import face_tracker

            face_cmd_path = os.path.splitext(abs_output)[0] + "_face.cmd"
            crop_x = str(face_tracker.write_crop_commands(
                abs_input, start_time, end_time, width, crop_width, face_cmd_path
            ))

    look = VIDEO_FILTERS.get(video_filter, VIDEO_FILTERS[DEFAULT_VIDEO_FILTER])

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
            "-preset", X264_PRESET,
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
        if vertical:
            fc = _build_vertical_filter(crop_width, crop_x, look, ass_path, face_cmd_path)
            cmd += ["-filter_complex", fc, "-map", "[out]", "-map", "0:a?"]
        else:
            # Square / landscape: simple -vf pipeline (crop / scale)
            vf_parts = [ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["16:9"])]
            if look:
                vf_parts.append(look.chain())
            if ass_path:
                rel_ass = _ass_path_for_ffmpeg(os.path.abspath(ass_path))
                vf_parts.append(f"ass={rel_ass}")
            cmd += ["-vf", ",".join(vf_parts)]

    cmd += ["-af", AUDIO_LOUDNORM, *output_options, abs_output]

    try:
        _run_cmd(cmd, label="ffmpeg:process_video")
    finally:
        if face_cmd_path and os.path.exists(face_cmd_path):
            os.remove(face_cmd_path)
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
