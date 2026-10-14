from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from backend.services import job_store

router = APIRouter()

@router.get("/status/{job_id}")
async def get_status(job_id: str) -> Dict[str, Any]:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    job.pop("request", None)
    return job
