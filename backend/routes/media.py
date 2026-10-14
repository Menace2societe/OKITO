from typing import Any, Dict
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from backend.services import media_cleanup

router = APIRouter()


@router.get("/media/usage")
async def media_usage() -> Dict[str, Any]:
    return await run_in_threadpool(media_cleanup.usage)


@router.post("/media/cleanup")
async def cleanup_media(dry_run: bool = False) -> Dict[str, Any]:
    """Delete expired / temporary / duplicate media (dry_run=true to preview)."""
    return await run_in_threadpool(media_cleanup.cleanup, dry_run=dry_run)
