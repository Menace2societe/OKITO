from typing import List, Dict, Any

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
    """Remove any echoed initial-prompt text from the transcribed words."""
    cleaned = [
        word
        for word in words
        if PROMPT_ECHO_MARKER.lower() not in (word.get("text") or "").lower()
    ]
    # Also strip a leading run that reconstructs the start of the prompt.
    prompt_tokens = [
        token.lower().strip(" ,.!?…") for token in PROMPT_ECHO_MARKER.split()
    ]
    while cleaned:
        first = (cleaned[0].get("text") or "").lower().strip(" ,.!?…")
        if first and first in prompt_tokens:
            cleaned.pop(0)
        else:
            break
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


def generate_ass(
    words: List[Dict[str, Any]],
    output_path: str,
    aspect_ratio: str,
    style_preset: str = DEFAULT_STYLE_PRESET,
) -> None:
    play_res_x = 1080
    play_res_y = 1920

    if aspect_ratio == "16:9":
        play_res_x = 1920
        play_res_y = 1080
    elif aspect_ratio == "1:1":
        play_res_x = 1080
        play_res_y = 1080

    style_line = _build_style_line(style_preset)

    words = _sanitize_words(words)

    ass_content = f"""[Script Info]
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

    def format_time(seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours}:{minutes:02d}:{secs:05.2f}"

    current_line = []
    line_start_time = 0.0
    line_end_time = 0.0

    for i, word in enumerate(words):
        if not current_line:
            line_start_time = word["start"]

        current_line.append(word)
        line_end_time = word["end"]

        if (
            len(current_line) >= MAX_WORDS_PER_LINE
            or _ends_sentence(word["text"])
            or i == len(words) - 1
        ):
            start_str = format_time(line_start_time)
            end_str = format_time(line_end_time)

            text_str = ""
            for w in current_line:
                duration_cs = int((w["end"] - w["start"]) * 100)
                text_str += f"{{\\k{duration_cs}}}{w['text']} "

            ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text_str.strip()}\n"
            current_line = []

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(ass_content)
