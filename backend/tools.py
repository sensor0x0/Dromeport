import sys
import asyncio
from typing import AsyncGenerator
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/api/tools/versions")
async def tools_versions():
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

    def parse_pip_version(raw: str) -> str:
        for line in raw.splitlines():
            if line.lower().startswith("version:"):
                return line.split(":", 1)[1].strip()
        return "unknown"

    ytdlp_version = await run_cmd("yt-dlp", "--version")
    spotiflac_raw = await run_cmd(sys.executable, "-m", "pip", "show", "SpotiFLAC")
    ytmusicapi_raw = await run_cmd(sys.executable, "-m", "pip", "show", "ytmusicapi")

    return {
        "ytdlp": ytdlp_version or "unknown",
        "spotiflac": parse_pip_version(spotiflac_raw),
        "ytmusicapi": parse_pip_version(ytmusicapi_raw),
    }


@router.get("/api/tools/update")
async def update_tools():
    async def stream() -> AsyncGenerator[str, None]:

        async def run_streaming(*cmd: str) -> AsyncGenerator[str, None]:
            import os
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

        yield "data: Updating yt-dlp...\n\n"
        try:
            async for chunk in run_streaming(sys.executable, "-m", "pip", "install", "--no-cache-dir", "-U", "yt-dlp"):
                yield chunk
            yield "data: yt-dlp updated.\n\n"
        except Exception as exc:
            yield f"data: yt-dlp update failed: {exc}\n\n"

        yield "data: \n\n"

        yield "data: Updating SpotiFLAC...\n\n"
        try:
            async for chunk in run_streaming(sys.executable, "-m", "pip", "install", "--no-cache-dir", "-U", "SpotiFLAC"):
                yield chunk
            yield "data: SpotiFLAC updated.\n\n"
        except Exception as exc:
            yield f"data: SpotiFLAC update failed: {exc}\n\n"

        yield "data: \n\n"

        yield "data: Updating ytmusicapi...\n\n"
        try:
            async for chunk in run_streaming(sys.executable, "-m", "pip", "install", "--no-cache-dir", "-U", "ytmusicapi"):
                yield chunk
            yield "data: ytmusicapi updated.\n\n"
        except Exception as exc:
            yield f"data: ytmusicapi update failed: {exc}\n\n"

        yield "data: \n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )