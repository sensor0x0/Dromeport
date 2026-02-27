import asyncio
import json
import os
import pathlib
import uuid
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from providers.ytmusic import download_ytmusic_stream
from providers.spotify import download_spotify_stream

app = FastAPI()

_active_jobs: dict[str, dict[str, Any]] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ─────────────────────────────────────────────────────────────────

_SPOTIFLAC_PATH = os.environ.get("SPOTIFLAC_PATH", "").strip()
_SPOTIFLAC_DIR = str(pathlib.Path(_SPOTIFLAC_PATH).parent) if _SPOTIFLAC_PATH else ""
_IS_DOCKER = bool(_SPOTIFLAC_PATH)


# ── Startup config endpoint ───────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    """
    Return all environment-driven configuration the frontend needs at startup:
      libraries    — list of {path, defaultName} from DROMEPORT_LIBRARY_* env vars
      spotiflacPath — pre-installed launcher path (empty outside Docker)
      isDocker     — convenience boolean
    """
    libraries: list[dict[str, str]] = []
    i = 1
    while True:
        raw = os.environ.get(f"DROMEPORT_LIBRARY_{i}")
        if raw is None:
            break
        parts = raw.split("|", 1)
        path = parts[0].strip()
        default_name = (
            parts[1].strip()
            if len(parts) > 1 and parts[1].strip()
            else os.path.basename(path.rstrip("/")) or path
        )
        if path:
            libraries.append({"path": path, "defaultName": default_name})
        i += 1

    return {
        "libraries": libraries,
        "spotiflacPath": _SPOTIFLAC_PATH,
        "isDocker": _IS_DOCKER,
    }


# ── Tool versions ─────────────────────────────────────────────────────────────

@app.get("/api/tools/versions")
async def tools_versions():
    """Return current installed versions of yt-dlp and SpotiFLAC."""

    async def run_cmd(*cmd: str) -> str:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            return stdout.decode("utf-8", errors="replace").strip()
        except Exception:
            return ""

    ytdlp_version = await run_cmd("yt-dlp", "--version")

    spotiflac_version = ""
    if _SPOTIFLAC_DIR and pathlib.Path(_SPOTIFLAC_DIR).is_dir():
        log = await run_cmd(
            "git", "-C", _SPOTIFLAC_DIR,
            "log", "-1", "--format=%h · %cd", "--date=short",
        )
        spotiflac_version = log or "unknown"

    return {
        "ytdlp": ytdlp_version or "unknown",
        "spotiflac": spotiflac_version or ("not installed" if _IS_DOCKER else "n/a"),
    }


# ── Tool updater (streaming SSE) ──────────────────────────────────────────────

@app.get("/api/tools/update")
async def update_tools():
    """
    Stream live update output via Server-Sent Events:
      • yt-dlp   → pip install -U yt-dlp
      • SpotiFLAC → git pull  +  pip install -r requirements.txt
    """

    async def stream() -> AsyncGenerator[str, None]:

        async def run_streaming(*cmd: str) -> AsyncGenerator[str, None]:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            assert proc.stdout is not None
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if line:
                    yield f"data: {line}\n\n"
            await proc.wait()

        # ── yt-dlp ────────────────────────────────────────────────────────────
        yield "data: ┌─ Updating yt-dlp ───────────────────────────────────\n\n"
        try:
            async for chunk in run_streaming(
                "pip", "install", "--no-cache-dir", "-U", "yt-dlp"
            ):
                yield chunk
            yield "data: ✅ yt-dlp updated.\n\n"
        except Exception as exc:
            yield f"data: ❌ yt-dlp update failed: {exc}\n\n"

        yield "data: \n\n"

        # ── SpotiFLAC ─────────────────────────────────────────────────────────
        if not _SPOTIFLAC_DIR or not pathlib.Path(_SPOTIFLAC_DIR).is_dir():
            yield "data: ⚠️  SpotiFLAC directory not found — skipping.\n\n"
        else:
            yield "data: ┌─ Updating SpotiFLAC ────────────────────────────────\n\n"
            try:
                async for chunk in run_streaming(
                    "git", "-C", _SPOTIFLAC_DIR, "pull", "--ff-only"
                ):
                    yield chunk

                req_file = pathlib.Path(_SPOTIFLAC_DIR) / "requirements.txt"
                if req_file.exists():
                    yield "data: \n\n"
                    yield "data: Installing updated dependencies…\n\n"
                    async for chunk in run_streaming(
                        "pip", "install", "--no-cache-dir", "-U",
                        "-r", str(req_file)
                    ):
                        yield chunk

                yield "data: ✅ SpotiFLAC updated.\n\n"
            except Exception as exc:
                yield f"data: ❌ SpotiFLAC update failed: {exc}\n\n"

        yield "data: \n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Download stream ───────────────────────────────────────────────────────────

@app.get("/api/download/stream")
async def stream_download(
    url: str,
    provider: str,
    config: str,
    playlist_folder: str = "",
):
    async def error_stream(message: str):
        yield f"data: ❌ {message}\n\n"
        yield "data: [DONE]\n\n"

    try:
        config_dict: dict = json.loads(config)
    except (json.JSONDecodeError, ValueError):
        return StreamingResponse(
            error_stream("Invalid config payload."), media_type="text/event-stream"
        )

    # In Docker mode: use the pre-installed SpotiFLAC if the user hasn't set a
    # custom path. This means zero Spotify configuration is required out of the box.
    if _SPOTIFLAC_PATH and not config_dict.get("spotify", {}).get("spotiflacPath", "").strip():
        config_dict.setdefault("spotify", {})["spotiflacPath"] = _SPOTIFLAC_PATH

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
            yield "data: ❌ Stream interrupted.\n\n"
            yield "data: [DONE]\n\n"
        finally:
            _active_jobs.pop(job_id, None)

    return StreamingResponse(
        stream_with_lifecycle(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Cancel ────────────────────────────────────────────────────────────────────

@app.delete("/api/download/{job_id}")
async def cancel_download(job_id: str, library_path: str = ""):
    job = _active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or already finished.")

    process: asyncio.subprocess.Process = job["process"]
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


# ── Static files (Docker / production) ───────────────────────────────────────
# Must come AFTER all /api/* routes so the SPA catch-all doesn't shadow them.

_static_dir = pathlib.Path(__file__).parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)