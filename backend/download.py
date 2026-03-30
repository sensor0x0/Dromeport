import json
import os
import pathlib
import uuid
from typing import Any, AsyncGenerator
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

_active_jobs: dict[str, dict[str, Any]] = {}


def _cleanup_partial_files(library_path: str) -> int:
    count = 0
    try:
        for pattern in ("**/*.part", "**/*.ytdl"):
            for f in pathlib.Path(library_path).glob(pattern):
                try:
                    f.unlink()
                    count += 1
                except OSError:
                    pass
    except Exception:
        pass
    return count


def get_active_jobs() -> dict[str, dict[str, Any]]:
    return _active_jobs


@router.get("/api/download/stream")
async def stream_download(
    url: str,
    provider: str,
    config: str,
    playlist_folder: str = "",
):
    from providers.ytmusic import download_ytmusic_stream
    from providers.spotify import download_spotify_stream

    async def error_stream(message: str):
        yield f"data: {message}\n\n"
        yield "data: [DONE]\n\n"

    try:
        config_dict: dict = json.loads(config)
    except (json.JSONDecodeError, ValueError):
        return StreamingResponse(
            error_stream("Invalid config payload."), media_type="text/event-stream"
        )

    library_path: str = config_dict.get("libraryPath", "").strip()
    if not library_path:
        return StreamingResponse(
            error_stream("Library path is empty. Set it in Configuration."),
            media_type="text/event-stream",
        )
    if not os.path.isabs(library_path):
        return StreamingResponse(
            error_stream(f"'{library_path}' is not an absolute path."),
            media_type="text/event-stream",
        )

    if playlist_folder.strip():
        config_dict["_playlist_folder"] = playlist_folder.strip()

    job_id = str(uuid.uuid4())

    if provider == "YouTube Music":
        generator = download_ytmusic_stream(url, config_dict, job_id, _active_jobs)
    elif provider == "Spotify":
        generator = download_spotify_stream(url, config_dict, job_id, _active_jobs)
    else:
        return StreamingResponse(
            error_stream(f"Unknown provider: '{provider}'."),
            media_type="text/event-stream",
        )

    async def stream_with_lifecycle():
        yield f'event: meta\ndata: {json.dumps({"type": "job_id", "value": job_id})}\n\n'
        try:
            async for chunk in generator:
                yield chunk
        except Exception:
            yield "data: Stream interrupted.\n\n"
            yield "data: [DONE]\n\n"
        finally:
            _active_jobs.pop(job_id, None)

    return StreamingResponse(
        stream_with_lifecycle(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/api/download/{job_id}")
async def cancel_download(job_id: str, library_path: str = ""):
    job = _active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or already finished.")

    process = job["process"]
    job_provider: str = job.get("provider", "")
    job_library_path: str = library_path or job.get("library_path", "")

    try:
        process.terminate()
        await asyncio.wait_for(process.wait(), timeout=5.0)
    except (asyncio.TimeoutError, ProcessLookupError):
        try:
            process.kill()
        except ProcessLookupError:
            pass

    _active_jobs.pop(job_id, None)

    cleaned = 0
    if job_provider == "ytmusic" and job_library_path and os.path.isdir(job_library_path):
        cleaned = _cleanup_partial_files(job_library_path)

    return {"status": "cancelled", "partial_files_deleted": cleaned}


import asyncio
