from typing import List, Dict, Any, Optional, Union
import logging

logger = logging.getLogger(__name__)

# ASS colour format is &HAABBGGRR (alpha, blue, green, red).
ASS_STYLE_PRESETS: Dict[str, Dict[str, Any]] = {
    # White text, thick black outline — high-contrast TikTok look.
    "bold_tiktok": {
        "fontname": "Arial",
        "fontsize": 72,
        "primary": "&H00FFFFFF",
        "secondary": "&H00FFFFFF",
        "outline": "&H00000000",
        "back": "&H80000000",
        "bold": -1,
        "outline_width": 3,
        "shadow": 2,
        "margin_v": 140,
    },
    # Bright yellow with black outline — punchy, dynamic social style.
    "neon_yellow": {
        "fontname": "Arial",
        "fontsize": 72,
        "primary": "&H0000FFFF",
        "secondary": "&H0000FFFF",
        "outline": "&H00000000",
        "back": "&H80000000",
        "bold": -1,
        "outline_width": 3,
        "shadow": 1,
        "margin_v": 140,
    },
    # Pure white, light shadow — sober and readable.
    "minimal_clean": {
        "fontname": "Arial",
        "fontsize": 60,
        "primary": "&H00FFFFFF",
        "secondary": "&H00FFFFFF",
        "outline": "&H00000000",
        "back": "&HD0000000",
        "bold": 0,
        "outline_width": 1,
        "shadow": 1,
        "margin_v": 120,
    },
}

DEFAULT_STYLE_PRESET = "bold_tiktok"

# Safety net: drop any word/segment where Whisper echoed the initial prompt.
PROMPT_ECHO_MARKER = "Transcription en français"

# Max words shown per subtitle line — keep punchlines short for 9:16.
MAX_WORDS_PER_LINE = 4


def _sanitize_words(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove an echoed initial prompt without wiping legitimate text.

    Only an exact marker occurrence (or a leading run matching the prompt
    tokens *in order*) is removed — never every word just because it happens
    to contain a common token like "en" or "français".
    """
    marker = PROMPT_ECHO_MARKER.lower()
    cleaned = [
        word
        for word in words
        if marker not in (word.get("text") or "").lower()
    ]

    prompt_tokens = [
        token.lower().strip(" ,.!?…") for token in PROMPT_ECHO_MARKER.split()
    ]

    # Strip a contiguous leading run that matches the prompt tokens in order.
    matched = 0
    while matched < len(cleaned) and matched < len(prompt_tokens):
        token = (cleaned[matched].get("text") or "").lower().strip(" ,.!?…")
        if token and token == prompt_tokens[matched]:
            matched += 1
        else:
            break

    if matched:
        logger.info(
            "[subtitle] Préfixe d'écho du prompt retiré (%d mot(s)).", matched
        )
        cleaned = cleaned[matched:]

    return cleaned


def _ends_sentence(text: str) -> bool:
    """True when a word closes a sentence, so we can break the line early."""
    return text.strip().endswith((".", "!", "?", "…", "..."))


def _build_style_line(style_preset: str) -> str:
    """Build the ASS [V4+ Styles] line for the requested preset."""
    style = ASS_STYLE_PRESETS.get(style_preset) or ASS_STYLE_PRESETS[DEFAULT_STYLE_PRESET]
    return (
        "Style: Default,"
        f"{style['fontname']},{style['fontsize']},"
        f"{style['primary']},{style['secondary']},"
        f"{style['outline']},{style['back']},"
        f"{style['bold']},0,0,0,100,100,0,0,1,"
        f"{style['outline_width']},{style['shadow']},2,30,30,{style['margin_v']},1"
    )


def _build_header(aspect_ratio: str, style_preset: str) -> str:
    play_res_x = 1080
    play_res_y = 1920

    if aspect_ratio == "16:9":
        play_res_x = 1920
        play_res_y = 1080
    elif aspect_ratio == "1:1":
        play_res_x = 1080
        play_res_y = 1080

    style_line = _build_style_line(style_preset)

    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _format_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def _chunk_words(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group words into subtitle lines of at most MAX_WORDS_PER_LINE."""
    lines: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []
    for i, word in enumerate(words):
        current.append(word)
        if (
            len(current) >= MAX_WORDS_PER_LINE
            or _ends_sentence(word.get("text", ""))
            or i == len(words) - 1
        ):
            lines.append({"words": current})
            current = []
    return lines


def _write_ass(
    output_path: str, header: str, lines: List[Dict[str, Any]]
) -> int:
    """Write the ASS file and return the number of dialogue lines."""
    dialogues: List[str] = []
    for line in lines:
        words = line.get("words") or []
        if not words:
            continue
        start = words[0]["start"]
        end = words[-1]["end"]

        text_str = ""
        for w in words:
            duration_cs = int((w["end"] - w["start"]) * 100)
            text_str += f"{{\\k{duration_cs}}}{w['text']} "

        dialogues.append(
            f"Dialogue: 0,{_format_time(start)},{_format_time(end)},"
            f"Default,,0,0,0,,{text_str.strip()}"
        )

    content = header + "\n".join(dialogues)
    if dialogues:
        content += "\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    logger.info(
        "[subtitle] Fichier .ass écrit : %s (%d ligne(s) de dialogue)",
        output_path, len(dialogues),
    )
    return len(dialogues)


def generate_ass(
    words: List[Dict[str, Any]],
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
) -> int:
    """Generate the .ass subtitle file from Whisper words; return line count."""
    words = _sanitize_words(words)
    logger.info("[subtitle] %d mot(s) après nettoyage du prompt.", len(words))
    if not words:
        logger.warning("[subtitle] Aucun mot à écrire dans le fichier .ass.")

    lines = _chunk_words(words)
    header = _build_header(aspect_ratio, style_preset)
    return _write_ass(output_path, header, lines)


# ---------------------------------------------------------------------------
# Custom (manually edited / pasted) subtitles
# ---------------------------------------------------------------------------

CustomSubtitles = Union[str, List[Any]]


def _timed_words(word_texts: List[str], start: float, end: float) -> List[Dict[str, Any]]:
    """Evenly distribute a segment duration across its words."""
    if not word_texts:
        return []
    step = (end - start) / len(word_texts) if end > start else 0.0
    return [
        {"text": text, "start": start + i * step, "end": start + (i + 1) * step}
        for i, text in enumerate(word_texts)
    ]


def _distribute_timing(
    lines: List[Dict[str, Any]], start_time: float, end_time: float
) -> None:
    """Spread all words evenly across [start_time, end_time]."""
    total_words = sum(len(line["words"]) for line in lines)
    if total_words == 0:
        return
    step = max(0.0, end_time - start_time) / total_words
    cursor = start_time
    for line in lines:
        for word in line["words"]:
            word["start"] = cursor
            word["end"] = cursor + step
            cursor += step


def _normalize_custom(
    custom_subtitles: CustomSubtitles, start_time: float, end_time: float
) -> List[Dict[str, Any]]:
    """Turn custom text / segments into timed subtitle lines."""
    lines: List[Dict[str, Any]] = []
    needs_distribution = False

    if isinstance(custom_subtitles, str):
        lines = _chunk_words(
            [{"text": t} for t in custom_subtitles.split() if t]
        )
        needs_distribution = True
    else:
        for item in custom_subtitles:
            if isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                start = item.get("start")
                end = item.get("end")
            else:
                text = str(item).strip()
                start = end = None
            if not text:
                continue

            if start is not None and end is not None and float(end) > float(start):
                tokens = text.split()
                lines.extend(
                    _chunk_words(_timed_words(tokens, float(start), float(end)))
                )
            else:
                lines.extend(
                    _chunk_words([{"text": t} for t in text.split() if t])
                )
                needs_distribution = True

    if needs_distribution:
        _distribute_timing(lines, start_time, end_time)

    return lines


def generate_ass_from_custom(
    custom_subtitles: CustomSubtitles,
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
    start_time: float = 0.0,
    end_time: float = 0.0,
) -> int:
    """Generate the .ass file directly from custom text; return line count."""
    lines = _normalize_custom(custom_subtitles, start_time, end_time)
    logger.info(
        "[subtitle] Sous-titres personnalisés : %d ligne(s) préparée(s).", len(lines)
    )
    if not lines:
        logger.warning(
            "[subtitle] custom_subtitles fourni mais vide après découpage."
        )

    header = _build_header(aspect_ratio, style_preset)
    return _write_ass(output_path, header, lines)
