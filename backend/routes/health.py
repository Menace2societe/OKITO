import hmac
from typing import Any, Dict

from fastapi import APIRouter, Request

from backend.config import ACCESS_CODE, ROLE

router = APIRouter()


@router.get("/health")
async def health(request: Request) -> Dict[str, Any]:
    """Open to everyone: lets the frontend know whether this backend is up,
    which one it is, and whether the code it holds is accepted."""
    key = request.headers.get("x-clipflow-key", "")
    return {
        "status": "ok",
        "role": ROLE,
        "auth_required": bool(ACCESS_CODE),
        "authorized": not ACCESS_CODE or hmac.compare_digest(key.encode(), ACCESS_CODE.encode()),
    }
