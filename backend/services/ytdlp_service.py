import os
import uuid
from typing import Dict, Any
from yt_dlp import YoutubeDL

def download_video(url: str, output_dir: str) -> Dict[str, Any]:
    file_id = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{file_id}.%(ext)s")
    
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'extract_flat': False,
        'extractor_args': {'youtube': ['player_client=android,web']},
    }
    
    with YoutubeDL(ydl_opts) as ydl:
        info_dict = ydl.extract_info(url, download=True)
        title = info_dict.get('title', 'Unknown')
        duration = info_dict.get('duration', 0.0)
        ext = info_dict.get('ext', 'mp4')
        
    filename = f"{file_id}.{ext}"
    
    return {
        "file_id": file_id,
        "title": title,
        "duration": duration,
        "url": f"/api/files/{filename}",
        "preview_url": f"http://localhost:8000/media/{filename}",
        "video_path": os.path.abspath(os.path.join(output_dir, filename)),
    }
