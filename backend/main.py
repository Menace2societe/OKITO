import hmac
import os
import sys
import traceback

# Logs contain accents, arrows and emoji: on a cp1252 console (redirected
# output, launched from a script) print() would raise and fail the request.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import ACCESS_CODE, CORS_ORIGINS, MEDIA_DIR
from backend.routes import upload, download_url, process, status, files, random_clip, batch, media, health
from backend.services import job_store, media_cleanup

app = FastAPI(title="ClipFlow API", version="1.0.0")

# Paths a browser fetches without custom headers (<video src>, downloads):
# their file names are random or content hashes, so they stay open.
PUBLIC_PREFIXES = ("/api/health", "/api/files/", "/media/")


# ---------------------------------------------------------------------------
# Access code — only when CLIPFLOW_ACCESS_CODE is set (online mode).
# Registered before CORS so that CORS wraps it: a refused request still
# carries the CORS headers the browser needs to read the 401.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def require_access_code(request: Request, call_next):
    if not ACCESS_CODE or request.method == "OPTIONS":
        return await call_next(request)
    # Behind a mount (the Hugging Face Space serves the API under /cf), the
    # path still starts with the mount prefix.
    path = request.url.path
    root = request.scope.get("root_path", "")
    if root and path.startswith(root):
        path = path[len(root):]
    if path.startswith(PUBLIC_PREFIXES):
        return await call_next(request)
    key = request.headers.get("x-clipflow-key", "")
    if not hmac.compare_digest(key.encode(), ACCESS_CODE.encode()):
        return JSONResponse(status_code=401, content={"detail": "Code d'accès manquant ou incorrect."})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
app.include_router(random_clip.router, prefix="/api")
app.include_router(batch.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(health.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    job_store.init()
    media_cleanup.start_background_cleanup()

# ---------------------------------------------------------------------------
# Static file mount — serves video files directly for <video> preview.
# Mounted AFTER routers so /api/* routes take priority.
# Access: http://localhost:8000/media/<filename>
# ---------------------------------------------------------------------------
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
