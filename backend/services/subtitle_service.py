from typing import List, Dict, Any

def generate_ass(words: List[Dict[str, Any]], output_path: str, aspect_ratio: str) -> None:
    play_res_x = 1080
    play_res_y = 1920
    
    if aspect_ratio == "16:9":
        play_res_x = 1920
        play_res_y = 1080
    elif aspect_ratio == "1:1":
        play_res_x = 1080
        play_res_y = 1080

    ass_content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,30,30,120,1

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

        if len(current_line) >= 6 or i == len(words) - 1:
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
