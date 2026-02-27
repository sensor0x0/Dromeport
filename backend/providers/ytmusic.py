import asyncio
import json
import os
import re
from typing import AsyncGenerator, Any


def _is_playlist_url(url: str) -> bool:
    u = url.lower()
    return (
        ("list=" in u and "watch?v=" not in u.split("list=")[0].split("?")[-1])
        or "/playlist" in u
        or "/album/" in u
    )


def _meta(payload: dict) -> str:
    return f"event: meta\ndata: {json.dumps(payload)}\n\n"


async def download_ytmusic_stream(
    url: str,
    config: dict,
    job_id: str,
    registry: dict[str, Any],
) -> AsyncGenerator[str, None]:
    library_path: str = config.get("libraryPath", "./downloads").strip()
    yt_config: dict = config.get("ytMusic", {})
    audio_format: str = yt_config.get("quality", "opus")
    embed_metadata: bool = yt_config.get("embedMetadata", True)
    playlist_mode: str = config.get("playlistMode", "flat")
    playlist_folder: str = config.get("_playlist_folder", "").strip()
    playlist = _is_playlist_url(url)

    # Determine output path
    if playlist and playlist_mode == "folder":
        if playlist_folder:
            output_base = os.path.join(library_path, playlist_folder)
        else:
            # Let yt-dlp use its own %(playlist_title)s variable
            output_base = os.path.join(library_path, "%(playlist_title)s")
    else:
        output_base = library_path

    try:
        os.makedirs(library_path, exist_ok=True)
        if playlist and playlist_mode == "folder" and playlist_folder:
            os.makedirs(output_base, exist_ok=True)
    except OSError as e:
        yield f"data: ❌ Could not create directory: {e}\n\n"
        yield "data: [DONE]\n\n"
        return

    output_template = os.path.join(output_base, "%(title)s.%(ext)s")

    command = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", audio_format,
        "--output", output_template,
        "--ignore-errors",
        "--newline",
        "--no-colors",
    ]

    if not playlist:
        command.append("--no-playlist")

    if audio_format == "mp3":
        command.extend(["--audio-quality", "0"])

    if embed_metadata:
        command.extend(["--embed-metadata", "--embed-thumbnail"])

    command.append(url)

    yield f"data: ▶ Starting {'playlist ' if playlist else ''}download...\n\n"
    if playlist:
        if playlist_mode == "folder":
            dest_note = f"subfolder: '{playlist_folder}'" if playlist_folder else "subfolder: <playlist title>"
        else:
            dest_note = "flat (library root)"
        yield f"data:   Mode: {dest_note}\n\n"
    yield f"data: $ {' '.join(command)}\n\n"
    yield "data: \n\n"

    downloaded_count = 0
    error_count = 0
    skipped_count = 0
    total_count = 0
    final_title: str | None = None
    thumb_emitted = False

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        registry[job_id] = {
            "process": process,
            "provider": "ytmusic",
            "library_path": library_path,
        }

        async for raw_line in process.stdout:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            if not line:
                continue

            # Playlist title
            if m := re.search(r"\[download\] Downloading playlist: (.+)", line):
                yield _meta({"type": "title", "value": m.group(1).strip()})

            # Total items in playlist
            elif m := re.search(r"Playlist .+: Downloading (\d+) items", line):
                total_count = int(m.group(1))
                yield _meta({"type": "progress", "current": 0, "total": total_count})

            # Per item progress
            elif m := re.match(r"\[download\] Downloading item (\d+) of (\d+)", line):
                cur, tot = int(m.group(1)) - 1, int(m.group(2))
                total_count = tot
                yield _meta({"type": "progress", "current": cur, "total": tot})

            # Grab thumbnail from first video URL
            elif not thumb_emitted and (
                m := re.search(r"\[youtube\] Extracting URL: .+watch\?v=([A-Za-z0-9_-]{11})", line)
            ):
                yield _meta({"type": "thumb", "url": f"https://img.youtube.com/vi/{m.group(1)}/mqdefault.jpg"})
                thumb_emitted = True

            # Track completed
            elif "[ExtractAudio] Destination:" in line:
                downloaded_count += 1
                if not playlist:
                    if m := re.search(r"Destination:\s+(.+)$", line):
                        final_title = os.path.splitext(os.path.basename(m.group(1).strip()))[0]
                        yield _meta({"type": "title", "value": final_title})
                else:
                    yield _meta({"type": "progress", "current": downloaded_count, "total": total_count})

            elif line.startswith("ERROR:"):
                error_count += 1

            elif "[download] has already been downloaded" in line:
                skipped_count += 1

            yield f"data: {line}\n\n"

        await process.wait()

    except FileNotFoundError:
        yield "data: ❌ yt-dlp not found. Install: pip install -U yt-dlp\n\n"
        yield "data: [DONE]\n\n"
        return
    except Exception as e:
        yield f"data: ❌ Unexpected error: {e}\n\n"
        yield "data: [DONE]\n\n"
        return
    finally:
        registry.pop(job_id, None)

    yield "data: \n\n"

    if process.returncode in (0, 1):
        if playlist:
            save_path = output_base if playlist_folder else library_path
            for part in [
                "✅ Playlist download finished.",
                f"  Tracks downloaded : {downloaded_count}",
                *(
                    [f"  Already existed   : {skipped_count} (skipped)"]
                    if skipped_count else []
                ),
                *(
                    [f"  ⚠️  Failed          : {error_count} (age-restricted / unavailable)"]
                    if error_count else []
                ),
                f"  Saved to          : {save_path}",
                f"  Format            : {audio_format.upper()}",
            ]:
                yield f"data: {part}\n\n"
            yield _meta({"type": "progress", "current": downloaded_count, "total": total_count or downloaded_count})
        else:
            if final_title:
                yield f"data: ✅ Done! '{final_title}' saved to '{library_path}' as {audio_format.upper()}.\n\n"
            else:
                yield f"data: ✅ Download complete! File saved to '{library_path}'.\n\n"
    else:
        yield f"data: ❌ yt-dlp exited with code {process.returncode}.\n\n"

    yield "data: [DONE]\n\n"