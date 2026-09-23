import os
import uuid
import logging
from typing import Dict, Any, List, Tuple
from yt_dlp import YoutubeDL


logger = logging.getLogger(__name__)


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIES_PATH = os.path.join(BASE_DIR, "cookies.txt")

FORMAT_SELECTOR = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

# Browsers to try (in order) for Strategy 2 — keep the list short.
_BROWSER_CANDIDATES = ("chrome", "edge", "firefox")


class YoutubeDownloadError(RuntimeError):
    """User-safe YouTube download failure."""


def _public_download_error() -> YoutubeDownloadError:
    return YoutubeDownloadError(
        "Impossible de télécharger cette vidéo pour le moment. "
        "Veuillez vérifier le lien ou réessayer ultérieurement."
    )


def _youtube_extractor_args(player_clients: List[str]) -> Dict[str, Any]:
    return {
        "youtube": {
            "player_client": player_clients,
        }
    }


# ---------------------------------------------------------------------------
# 4-strategy cascade
# ---------------------------------------------------------------------------
# IMPORTANT: 'tv', 'tv_downgraded', and 'android_vr' are deliberately
# excluded everywhere — they return false "This video is unavailable" errors.
# ---------------------------------------------------------------------------

def _download_strategies() -> List[Dict[str, Any]]:
    """Build the ordered list of download strategies to attempt."""
    strategies: List[Dict[str, Any]] = []

    # --- Strategy 1: local cookies.txt (if present & non-empty) -----------
    if os.path.isfile(COOKIES_PATH) and os.path.getsize(COOKIES_PATH) > 0:
        strategies.append(
            {
                "name": "Stratégie 1 — cookies.txt + android/ios",
                "opts": {
                    "cookiefile": COOKIES_PATH,
                    "extractor_args": _youtube_extractor_args(
                        ["android", "ios"]
                    ),
                },
            }
        )
    else:
        logger.info("[yt-dlp] Pas de cookies.txt exploitable (%s)", COOKIES_PATH)

    # --- Strategy 2: browser session cookies (chrome → edge → firefox) ----
    for browser in _BROWSER_CANDIDATES:
        strategies.append(
            {
                "name": f"Stratégie 2 — cookies navigateur ({browser}) + mweb/android",
                "opts": {
                    "cookiesfrombrowser": (browser,),
                    "extractor_args": _youtube_extractor_args(
                        ["mweb", "android"]
                    ),
                },
            }
        )

    # --- Strategy 3: mobile clients, no cookies ---------------------------
    strategies.append(
        {
            "name": "Stratégie 3 — sans cookies + android/ios/mweb",
            "opts": {
                "extractor_args": _youtube_extractor_args(
                    ["android", "ios", "mweb"]
                ),
            },
        }
    )

    # --- Strategy 4: web_safari universal, no cookies ---------------------
    strategies.append(
        {
            "name": "Stratégie 4 — sans cookies + web_safari",
            "opts": {
                "extractor_args": _youtube_extractor_args(
                    ["web_safari"]
                ),
            },
        }
    )

    return strategies


def _make_progress_hook(downloaded_files: List[str]):
    def _hook(status: Dict[str, Any]) -> None:
        if status.get("status") == "finished" and status.get("filename"):
            downloaded_files.append(os.path.abspath(status["filename"]))

    return _hook


def _base_ytdl_opts(
    output_dir: str, strategy_opts: Dict[str, Any], downloaded_files: List[str]
) -> Dict[str, Any]:
    return {
        "noplaylist": True,
        "format": FORMAT_SELECTOR,
        "outtmpl": os.path.join(output_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "overwrites": True,
        "progress_hooks": [_make_progress_hook(downloaded_files)],
        **strategy_opts,
    }


def _extract_info_with_fallback(
    url: str, output_dir: str, download: bool = True
) -> Tuple[Dict[str, Any], List[str], str]:
    """Try every strategy in order; return on the first success."""
    os.makedirs(output_dir, exist_ok=True)
    last_error: Exception | None = None
    downloaded_files: List[str] = []

    for strategy in _download_strategies():
        try:
            logger.info("[yt-dlp] Tentative: %s", strategy["name"])
            print(f"[yt-dlp] Tentative : {strategy['name']}")

            ydl_opts = _base_ytdl_opts(output_dir, strategy["opts"], downloaded_files)

            with YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(url, download=download)

                if not info_dict:
                    raise RuntimeError("yt-dlp n'a retourné aucune information.")

                # Use prepare_filename as the primary source for file path
                if download:
                    prepared = ydl.prepare_filename(info_dict)
                    if prepared:
                        downloaded_files.append(os.path.abspath(prepared))

            logger.info("[yt-dlp] Succès avec: %s", strategy["name"])
            print(f"[yt-dlp] ✓ Succès avec : {strategy['name']}")
            return info_dict, downloaded_files, strategy["name"]

        except Exception as e:
            last_error = e
            logger.warning("[yt-dlp] Échec avec %s : %s", strategy["name"], e)
            print(f"[yt-dlp] ✗ Échec avec {strategy['name']} : {e}")

    # All strategies exhausted — log full traceback, raise user-safe error
    logger.error(
        "[yt-dlp] Toutes les stratégies ont échoué. Dernière erreur: %s",
        last_error,
        exc_info=True,
    )
    raise _public_download_error() from last_error


def _candidate_filepaths(
    info_dict: Dict[str, Any],
    output_dir: str,
    file_id: str,
    ext: str,
    downloaded_files: List[str],
) -> List[str]:
    """Build a de-duplicated list of possible file locations, best first."""
    candidates: List[str] = []
    candidates.extend(downloaded_files)

    requested_downloads = info_dict.get("requested_downloads") or []
    for downloaded in requested_downloads:
        filepath = downloaded.get("filepath")
        if filepath:
            candidates.append(filepath)

    for key in ("filepath", "_filename"):
        filename = info_dict.get(key)
        if filename:
            candidates.append(filename)

    candidates.append(os.path.join(output_dir, f"{file_id}.{ext}"))

    seen = set()
    unique_candidates = []
    for candidate in candidates:
        abs_candidate = os.path.abspath(candidate)
        if abs_candidate not in seen:
            seen.add(abs_candidate)
            unique_candidates.append(abs_candidate)
    return unique_candidates


def _downloaded_filepath(
    info_dict: Dict[str, Any],
    output_dir: str,
    file_id: str,
    ext: str,
    downloaded_files: List[str],
) -> str:
    for candidate in _candidate_filepaths(
        info_dict, output_dir, file_id, ext, downloaded_files
    ):
        if os.path.isfile(candidate):
            return candidate

    raise YoutubeDownloadError(
        "La vidéo a été analysée, mais le fichier téléchargé est introuvable. "
        "Vérifiez l'espace disque et la configuration FFmpeg."
    )


def probe_video_info(url: str, output_dir: str) -> Dict[str, Any]:
    """Extract metadata without downloading."""
    info_dict, _, strategy_name = _extract_info_with_fallback(
        url, output_dir, download=False
    )
    return {
        "id": info_dict.get("id"),
        "title": info_dict.get("title", "Unknown"),
        "duration": info_dict.get("duration", 0.0),
        "strategy": strategy_name,
    }


def download_video(url: str, output_dir: str) -> Dict[str, Any]:
    """Download a video and return metadata + file paths."""
    info_dict, downloaded_files, strategy_name = _extract_info_with_fallback(
        url, output_dir, download=True
    )

    title = info_dict.get("title", "Unknown")
    duration = info_dict.get("duration", 0.0)
    ext = info_dict.get("ext", "mp4")
    file_id = info_dict.get("id") or str(uuid.uuid4())
    video_path = _downloaded_filepath(
        info_dict, output_dir, file_id, ext, downloaded_files
    )
    filename = os.path.basename(video_path)

    return {
        "file_id": file_id,
        "title": title,
        "duration": duration,
        "url": f"/api/files/{filename}",
        "preview_url": f"http://localhost:8000/media/{filename}",
        "video_path": video_path,
        "download_strategy": strategy_name,
    }
