"""Vocal isolation with Demucs: strip the beat before Whisper listens.

Rap over a loud instrumental is where Whisper mishears the most; feeding it
the isolated vocal stem fixes a large share of those errors. Demucs runs in
a subprocess (`python -m demucs`) so a crash or an out-of-memory never takes
the API down, and its heavy PyTorch import stays out of the server process.
"""
import logging
import os
import shutil
import subprocess
import sys
import time
import uuid

from backend.config import MEDIA_DIR
from backend.services import ffmpeg_service

logger = logging.getLogger(__name__)

DEMUCS_MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
TEMP_DIR_SUFFIX = "_demucs"


def is_available() -> bool:
    try:
        import importlib.util
        return importlib.util.find_spec("demucs") is not None
    except Exception:
        return False


def isolate_vocals(
    input_path: str, start: float, end: float, output_wav: str
) -> str:
    """Write the vocals of [start, end] as a 16 kHz mono WAV to `output_wav`."""
    work_dir = os.path.join(MEDIA_DIR, f"{uuid.uuid4()}{TEMP_DIR_SUFFIX}")
    os.makedirs(work_dir)
    try:
        # Demucs wants the music as recorded: 44.1 kHz stereo.
        source = os.path.join(work_dir, "source.wav")
        ffmpeg_service._run_cmd([
            ffmpeg_service._find_ffmpeg(), "-y",
            "-ss", str(start), "-to", str(end),
            "-i", os.path.abspath(input_path),
            "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", source,
        ], label="ffmpeg:demucs_input")

        started = time.time()
        cmd = [
            sys.executable, "-m", "demucs",
            "--two-stems", "vocals",
            "-n", DEMUCS_MODEL,
            # One job per core: ~30 % faster than the default on CPU.
            "-j", str(os.cpu_count() or 2),
            "-o", work_dir,
            "--filename", "{stem}.{ext}",
            source,
        ]
        logger.info("[demucs] %s", " ".join(cmd))
        print(f"[demucs] Isolation de la voix ({end - start:.0f}s d'audio, modèle {DEMUCS_MODEL})...")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                encoding="utf-8", errors="replace")
        vocals = os.path.join(work_dir, DEMUCS_MODEL, "vocals.wav")
        if result.returncode != 0 or not os.path.exists(vocals):
            raise RuntimeError(
                f"Demucs a échoué (code {result.returncode}) : "
                f"{(result.stderr or result.stdout).strip()[-800:]}"
            )
        print(f"[demucs] Voix isolée en {time.time() - started:.0f}s")

        # Back to what Whisper expects: 16 kHz mono PCM.
        ffmpeg_service._run_cmd([
            ffmpeg_service._find_ffmpeg(), "-y", "-i", vocals,
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", os.path.abspath(output_wav),
        ], label="ffmpeg:demucs_output")
        return output_wav
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
