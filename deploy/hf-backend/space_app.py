"""ClipFlow backend on a Hugging Face ZeroGPU Space.

ZeroGPU is the only free Space hardware, and it only starts Gradio apps that
declare at least one @spaces.GPU function. So this launches a minimal Gradio
page and mounts the unchanged FastAPI backend under /cf: the API answers on
/cf/api/... and the media files on /cf/media/...

build_space.py copies this file to the Space as app.py, next to backend/.
"""

import os

# ZeroGPU only grants the GPU inside @spaces.GPU calls: keep Whisper on CPU,
# with the lighter model, and skip Demucs (not installed on the Space).
os.environ.setdefault("WHISPER_DEVICE", "cpu")
os.environ.setdefault("WHISPER_MODEL_SIZE", "small")

import gradio as gr

from backend.main import app as backend_app
from backend.services import job_store, media_cleanup

try:
    import spaces

    @spaces.GPU
    def _zerogpu_placeholder() -> None:
        """Never called: it only lets ZeroGPU start the Space."""
except ImportError:
    pass


with gr.Blocks(title="ClipFlow — backend") as demo:
    gr.Markdown(
        "# ClipFlow — backend\n"
        "Ce Space sert l'API de ClipFlow sous `/cf/api/…`. "
        "L'interface est sur le site ClipFlow."
    )


if __name__ == "__main__":
    # A mounted sub-app never receives startup events: run backend_app's here.
    job_store.init()
    media_cleanup.start_background_cleanup()
    # SSR puts a Node proxy in front of Python that would not forward /cf.
    demo.launch(ssr_mode=False, prevent_thread_lock=True)
    demo.app.mount("/cf", backend_app)
    demo.block_thread()
