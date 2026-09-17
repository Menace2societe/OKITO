from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from backend.routes.process import jobs

router = APIRouter()

@router.get("/status/{job_id}")
async def get_status(job_id: str) -> Dict[str, Any]:
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]
