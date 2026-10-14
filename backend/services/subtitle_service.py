import re
import difflib
import logging
from typing import List, Dict, Any, Optional, Union

logger = logging.getLogger(__name__)

# ASS colour format is &HAABBGGRR (alpha, blue, green, red).
# "highlight" colours the word currently spoken (None = static line),
# "pop" briefly scales that word up, "uppercase" shouts the whole line.
ASS_STYLE_PRESETS: Dict[str, Dict[str, Any]] = {
    # White text, thick black outline, spoken word in yellow — TikTok look.
    "bold_tiktok": {
        "fontname": "Arial",
        "fontsize": 72,
        "primary": "&H00FFFFFF",
        "secondary": "&H00FFFFFF",
        "outline": "&H00000000",
        "back": "&H80000000",
        "bold": -1,
        "outline_width": 4,
        "shadow": 2,
        "margin_v": 280,
        "highlight": "&H0000E5FF",
        "pop": True,
        "uppercase": False,
    },
    # Bright yellow with black outline, spoken word in white.
    "neon_yellow": {
        "fontname": "Arial",
        "fontsize": 72,
        "primary": "&H0000FFFF",
        "secondary": "&H0000FFFF",
        "outline": "&H00000000",
        "back": "&H80000000",
        "bold": -1,
        "outline_width": 4,
        "shadow": 1,
        "margin_v": 280,
        "highlight": "&H00FFFFFF",
        "pop": True,
        "uppercase": False,
    },
    # Uppercase, huge, spoken word in green with a pop — "Hormozi" style.
    "impact_pop": {
        "fontname": "Arial",
        "fontsize": 84,
        "primary": "&H00FFFFFF",
        "secondary": "&H00FFFFFF",
        "outline": "&H00000000",
        "back": "&H00000000",
        "bold": -1,
        "outline_width": 6,
        "shadow": 0,
        "margin_v": 420,
        "highlight": "&H0000FF4D",
        "pop": True,
        "uppercase": True,
    },
    # Pure white, light shadow — sober and readable, no word animation.
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
        "margin_v": 260,
        "highlight": None,
        "pop": False,
        "uppercase": False,
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


def _get_style(style_preset: str) -> Dict[str, Any]:
    return ASS_STYLE_PRESETS.get(style_preset) or ASS_STYLE_PRESETS[DEFAULT_STYLE_PRESET]


def _build_style_line(style_preset: str) -> str:
    """Build the ASS [V4+ Styles] line for the requested preset."""
    style = _get_style(style_preset)
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
    seconds = max(0.0, seconds)  # a word may start just before the clip
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


# Gaps shorter than this between two lines are bridged to avoid flicker.
MAX_BRIDGED_GAP = 0.4
# A line stays on screen at least this long (seconds) when the next one
# leaves room — Whisper often squeezes sung words into a few tenths of a second.
MIN_LINE_DURATION = 0.9
# After its last word, a line lingers this long if nothing follows right away.
LINE_LINGER = 0.4


def _remove_overlaps(lines: List[Dict[str, Any]]) -> None:
    """Make consecutive blocks contiguous: no overlap, no micro-gap flicker.

    block[i].end is clamped to block[i+1].start when they overlap, and
    extended up to it when the pause between them is shorter than
    MAX_BRIDGED_GAP, so the screen never blinks empty mid-sentence.
    """
    for i in range(len(lines) - 1):
        cur_words = lines[i].get("words") or []
        nxt_words = lines[i + 1].get("words") or []
        if not cur_words or not nxt_words:
            continue
        cur_end = cur_words[-1]["end"]
        nxt_start = nxt_words[0]["start"]
        if cur_end > nxt_start or nxt_start - cur_end < MAX_BRIDGED_GAP:
            cur_words[-1]["end"] = max(cur_words[-1]["start"], nxt_start)
    # Readability: extend short lines into the following pause, never past
    # the start of the next line.
    for i, line in enumerate(lines):
        words = line.get("words") or []
        if not words:
            continue
        nxt = next((l["words"] for l in lines[i + 1:] if l.get("words")), None)
        limit = nxt[0]["start"] if nxt else float("inf")
        wanted = max(words[-1]["end"] + LINE_LINGER, words[0]["start"] + MIN_LINE_DURATION)
        words[-1]["end"] = max(words[-1]["end"], min(wanted, limit))


def _escape_ass(text: str) -> str:
    """Neutralise characters libass would read as override tags."""
    return (
        text.replace("\\", "/")
        .replace("{", "(")
        .replace("}", ")")
        .strip()
    )


def _ass_inline_colour(colour: str) -> str:
    """&HAABBGGRR style colour -> &HBBGGRR& inline override form."""
    return f"&H{colour[-6:]}&"


def _dialogue(start: float, end: float, text: str) -> str:
    return (
        f"Dialogue: 0,{_format_time(start)},{_format_time(end)},"
        f"Default,,0,0,0,,{text}"
    )


def _line_events(line_words: List[Dict[str, Any]], style: Dict[str, Any]) -> List[str]:
    """Build the dialogue event(s) for one subtitle line.

    Static presets emit one event. Highlight presets emit one event per word,
    each spanning until the next word starts, with the spoken word recoloured
    (and optionally popped) — the classic TikTok "active word" effect.
    """
    texts = [_escape_ass(w.get("text") or "") for w in line_words]
    if style.get("uppercase"):
        texts = [t.upper() for t in texts]

    line_start = line_words[0]["start"]
    line_end = line_words[-1]["end"]
    highlight = style.get("highlight")
    if not highlight:
        return [_dialogue(line_start, line_end, " ".join(texts))]

    colour = _ass_inline_colour(highlight)
    pop = r"\fscx112\fscy112\t(0,120,\fscx100\fscy100)" if style.get("pop") else ""
    events: List[str] = []
    for i, word in enumerate(line_words):
        start = word["start"]
        end = line_words[i + 1]["start"] if i + 1 < len(line_words) else line_end
        if end <= start:
            continue
        parts = [
            rf"{{\c{colour}{pop}}}{t}{{\r}}" if j == i else t
            for j, t in enumerate(texts)
        ]
        events.append(_dialogue(start, end, " ".join(parts)))
    return events


def _write_ass(
    output_path: str,
    header: str,
    lines: List[Dict[str, Any]],
    style_preset: str = DEFAULT_STYLE_PRESET,
) -> int:
    """Write the ASS file and return the number of subtitle lines."""
    style = _get_style(style_preset)
    dialogues: List[str] = []
    line_count = 0
    for line in lines:
        words = line.get("words") or []
        if not words:
            continue
        line_count += 1
        dialogues.extend(_line_events(words, style))

    content = header + "\n".join(dialogues)
    if dialogues:
        content += "\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    logger.info(
        "[subtitle] Fichier .ass écrit : %s (%d ligne(s), %d événement(s))",
        output_path, line_count, len(dialogues),
    )
    return line_count


def generate_ass(
    words: List[Dict[str, Any]],
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
) -> int:
    """Generate the .ass subtitle file from Whisper words; return line count."""
    lines = words_to_lines(words)
    if not lines:
        logger.warning("[subtitle] Aucun mot à écrire dans le fichier .ass.")
    return write_ass_lines(lines, output_path, aspect_ratio, style_preset)


# ---------------------------------------------------------------------------
# Custom (manually edited / pasted) subtitles
# ---------------------------------------------------------------------------
#
# All custom timings are RELATIVE to the clip (0 = start_time), because the
# rendered file starts at 0 once FFmpeg has trimmed it.

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


def _distribute_timing(lines: List[Dict[str, Any]], clip_duration: float) -> None:
    """Spread all words evenly across [0, clip_duration]."""
    total_words = sum(len(line["words"]) for line in lines)
    if total_words == 0:
        return
    step = max(0.0, clip_duration) / total_words
    cursor = 0.0
    for line in lines:
        for word in line["words"]:
            word["start"] = cursor
            word["end"] = cursor + step
            cursor += step


def _norm_token(text: str) -> str:
    return re.sub(r"[^\w']+", "", text.lower())


def align_text_to_words(
    text: str, reference_words: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Map edited text onto Whisper word timings.

    Tokens that still match a transcribed word (after a diff) keep its exact
    timing; inserted / rewritten tokens are interpolated between their
    matched neighbours. Fixing a typo or a word therefore keeps the subtitle
    perfectly in sync instead of falling back to an even distribution.
    """
    tokens = [t for t in text.split() if t]
    refs = [
        w for w in reference_words
        if w.get("start") is not None and w.get("end") is not None
    ]
    if not tokens or not refs:
        return []

    matcher = difflib.SequenceMatcher(
        a=[_norm_token(t) for t in tokens],
        b=[_norm_token(w.get("text") or "") for w in refs],
        autojunk=False,
    )
    timed: List[Optional[Dict[str, Any]]] = [None] * len(tokens)
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(a1 - a0):
                ref = refs[b0 + k]
                timed[a0 + k] = {
                    "text": tokens[a0 + k],
                    "start": float(ref["start"]),
                    "end": float(ref["end"]),
                }
        elif tag == "replace" and b1 > b0:
            # Rewritten span: share the replaced words' time range.
            for word in _timed_words(
                tokens[a0:a1], float(refs[b0]["start"]), float(refs[b1 - 1]["end"])
            ):
                timed[a0] = word
                a0 += 1

    # Interpolate pure insertions between the nearest timed neighbours.
    i = 0
    while i < len(timed):
        if timed[i] is not None:
            i += 1
            continue
        j = i
        while j < len(timed) and timed[j] is None:
            j += 1
        left = timed[i - 1]["end"] if i > 0 else float(refs[0]["start"])
        right = timed[j]["start"] if j < len(timed) else float(refs[-1]["end"])
        for k, word in enumerate(_timed_words(tokens[i:j], left, max(left, right))):
            timed[i + k] = word
        i = j

    return [w for w in timed if w is not None]


def _normalize_custom(
    custom_subtitles: CustomSubtitles,
    start_time: float,
    end_time: float,
    reference_words: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Turn custom text / segments into timed subtitle lines (clip-relative)."""
    clip_duration = max(0.0, end_time - start_time)

    if isinstance(custom_subtitles, str):
        if reference_words:
            aligned = align_text_to_words(custom_subtitles, reference_words)
            if aligned:
                return _chunk_words(aligned)
        lines = _chunk_words([{"text": t} for t in custom_subtitles.split() if t])
        _distribute_timing(lines, clip_duration)
        return lines

    lines: List[Dict[str, Any]] = []
    needs_distribution = False
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
            lines.extend(_chunk_words(_timed_words(text.split(), float(start), float(end))))
        else:
            lines.extend(_chunk_words([{"text": t} for t in text.split() if t]))
            needs_distribution = True

    if needs_distribution:
        _distribute_timing(lines, clip_duration)
    return lines


def custom_to_lines(
    custom_subtitles: CustomSubtitles,
    start_time: float = 0.0,
    end_time: float = 0.0,
    reference_words: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Normalise custom subtitles once; feed the result to every writer."""
    lines = _normalize_custom(custom_subtitles, start_time, end_time, reference_words)
    logger.info(
        "[subtitle] Sous-titres personnalisés : %d ligne(s) préparée(s) (%s).",
        len(lines), "timing Whisper" if reference_words else "timing réparti",
    )
    if not lines:
        logger.warning("[subtitle] custom_subtitles fourni mais vide après découpage.")
    _remove_overlaps(lines)
    return lines


def words_to_lines(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Clean, chunk and de-overlap Whisper words; feed to every writer."""
    words = _sanitize_words(words)
    logger.info("[subtitle] %d mot(s) après nettoyage du prompt.", len(words))
    lines = _chunk_words(words)
    _remove_overlaps(lines)
    return lines


def write_ass_lines(
    lines: List[Dict[str, Any]],
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
) -> int:
    header = _build_header(aspect_ratio, style_preset)
    return _write_ass(output_path, header, lines, style_preset)


def generate_ass_from_custom(
    custom_subtitles: CustomSubtitles,
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
    start_time: float = 0.0,
    end_time: float = 0.0,
    reference_words: Optional[List[Dict[str, Any]]] = None,
) -> int:
    """Generate the .ass file directly from custom text; return line count."""
    lines = custom_to_lines(custom_subtitles, start_time, end_time, reference_words)
    return write_ass_lines(lines, output_path, aspect_ratio, style_preset)


# ---------------------------------------------------------------------------
# VTT / SRT generation (same timing as the burned-in ASS, no styling)
# ---------------------------------------------------------------------------

def _format_cue_time(seconds: float, decimal_sep: str) -> str:
    """HH:MM:SS.mmm (VTT) or HH:MM:SS,mmm (SRT)."""
    seconds = max(0.0, seconds)  # a word may start just before the clip
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}".replace(".", decimal_sep)


def _line_text(line: Dict[str, Any]) -> str:
    """Join the words of a subtitle line into a single text string."""
    return " ".join((w.get("text") or "").strip() for w in line.get("words", []))


def write_cues(lines: List[Dict[str, Any]], output_path: str, fmt: str) -> int:
    """Write lines as a "vtt" or "srt" file; return the cue count."""
    sep = "." if fmt == "vtt" else ","
    parts: List[str] = ["WEBVTT", ""] if fmt == "vtt" else []
    count = 0
    for line in lines:
        w = line.get("words") or []
        if not w:
            continue
        count += 1
        parts.append(str(count))
        parts.append(
            f"{_format_cue_time(w[0]['start'], sep)} --> "
            f"{_format_cue_time(w[-1]['end'], sep)}"
        )
        parts.append(_line_text(line))
        parts.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))

    logger.info("[subtitle] Fichier .%s écrit : %s (%d cue(s))", fmt, output_path, count)
    return count
