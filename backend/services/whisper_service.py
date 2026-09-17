from typing import List, Dict, Any
from faster_whisper import WhisperModel

_model = None

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model

def transcribe(audio_path: str) -> List[Dict[str, Any]]:
    model = get_model()
    segments, info = model.transcribe(audio_path, word_timestamps=True)
    
    words_list = []
    for segment in segments:
        for word in segment.words:
            words_list.append({
                "start": word.start,
                "end": word.end,
                "text": word.word
            })
            
    return words_list
