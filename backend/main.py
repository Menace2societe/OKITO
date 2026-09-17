import os
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import MEDIA_DIR
from backend.routes import upload, download_url, process, status, files

app = FastAPI(title="OKITO API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handler — guarantees every error returns JSON, never HTML.
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: any unhandled exception becomes a JSON 500 response."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Erreur serveur : {str(exc)}",
        },
    )


app.include_router(upload.router, prefix="/api")
app.include_router(download_url.router, prefix="/api")
app.include_router(process.router, prefix="/api")
app.include_router(status.router, prefix="/api")
app.include_router(files.router, prefix="/api")

# ---------------------------------------------------------------------------
# Static file mount — serves video files directly for <video> preview.
# Mounted AFTER routers so /api/* routes take priority.
# Access: http://localhost:8000/media/<filename>
# ---------------------------------------------------------------------------
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
