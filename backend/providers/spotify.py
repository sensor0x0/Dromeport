import asyncio
import json
import os
import pathlib
import re
import shutil
from typing import AsyncGenerator, Any

def _is_playlist_url(url: str) -> bool:
    u = url.lower()
    return "/playlist/" in u or "/album/" in u

def _meta(payload: dict) -> str:
    return f"event: meta\ndata: {json.dumps(payload)}\n\n"

async def download_spotify_stream(
    url: str,
    config: dict,
    job_id: str,
    registry: dict[str, Any],
) -> AsyncGenerator[str, None]:
    async for chunk in _spotiflac_stream(url, config, job_id, registry):
        yield chunk

async def _spotiflac_stream(
    url: str,
    config: dict,
    job_id: str,
    registry: dict[str, Any],
) -> AsyncGenerator[str, None]:
    spotify_config: dict = config.get("spotify", {})
    library_path: str = config.get("libraryPath", "./downloads").strip()
    playlist_mode: str = config.get("playlistMode", "flat")
    playlist_folder: str = config.get("_playlist_folder", "").strip()
    is_playlist = _is_playlist_url(url)

    binary_path: str = spotify_config.get("spotiflacPath", "").strip()
    service: str = spotify_config.get("spotiflacService", "tidal")
    loop_minutes: int = int(spotify_config.get("spotiflacLoop", 0))
    artist_subfolders: bool = spotify_config.get("spotiflacArtistSubfolders", False)
    album_subfolders: bool = spotify_config.get("spotiflacAlbumSubfolders", True)
    filename_format: str = spotify_config.get(
        "spotiflacFilenameFormat", "{track_number} {title} - {artist}"
    )
    output_format: str = spotify_config.get("spotiflacOutputFormat", "flac").lower()

    if not binary_path:
        yield "data: ❌ SpotiFLAC path not set. Enter the path to launcher.py or the binary in Configuration.\n\n"
        yield "data: [DONE]\n\n"
        return

    # Determine output directory and create if needed
    if is_playlist and playlist_mode == "folder" and playlist_folder:
        output_dir = os.path.join(library_path, playlist_folder)
        try:
            os.makedirs(output_dir, exist_ok=True)
        except OSError as e:
            yield f"data: ❌ Could not create directory '{output_dir}': {e}\n\n"
            yield "data: [DONE]\n\n"
            return
    else:
        output_dir = library_path

    is_python_launcher = binary_path.endswith(".py")

    if is_python_launcher:
        if not os.path.isfile(binary_path):
            yield f"data: ❌ launcher.py not found at '{binary_path}'.\n\n"
            yield "data: [DONE]\n\n"
            return
        command = ["python3", "-u", binary_path]
    else:
        if not os.path.isfile(binary_path):
            yield f"data: ❌ SpotiFLAC binary not found at '{binary_path}'.\n\n"
            yield "data: [DONE]\n\n"
            return
        if not os.access(binary_path, os.X_OK):
            yield (
                f"data: ❌ SpotiFLAC binary is not executable. "
                f"Run: chmod +x \"{binary_path}\"\n\n"
            )
            yield "data: [DONE]\n\n"
            return
        stdbuf = shutil.which("stdbuf")
        if stdbuf:
            command = [stdbuf, "-oL", binary_path]
        else:
            command = [binary_path]

    command += [url, output_dir]
    command += ["--service"] + service.split()
    command += ["--filename-format", filename_format]

    if artist_subfolders:
        command.append("--use-artist-subfolders")
    if album_subfolders:
        command.append("--use-album-subfolders")
    if loop_minutes > 0:
        command += ["--loop", str(loop_minutes)]

    yield f"data: ▶ Starting Spotify download via SpotiFLAC (service: {service})...\n\n"
    if is_playlist:
        dest_note = f"'{playlist_folder}'" if playlist_folder else "library root (or SpotiFLAC default)"
        yield f"data:   Output folder : {dest_note}\n\n"
    yield f"data: $ {' '.join(command)}\n\n"
    yield "data: \n\n"
    yield "data: ⏳ SpotiFLAC is running. Output may appear in batches — this is normal for the binary.\n\n"

    # Attempt to find playlist title (unlikely)
    if is_playlist and playlist_folder:
        yield _meta({"type": "title", "value": playlist_folder})
    else:
        yield _meta({"type": "title", "value": "Spotify download"})

    downloaded = 0
    errors = 0

    try:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )

        registry[job_id] = {
            "process": process,
            "provider": "spotiflac",
            "library_path": library_path,
        }

        async for raw_line in process.stdout:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            if not line:
                continue

            lower = line.lower()

            if re.search(r"downloaded|✓|success", lower):
                downloaded += 1
                yield _meta({"type": "progress", "current": downloaded, "total": 0})
            elif re.search(r"error|failed|❌", lower):
                errors += 1

            yield f"data: {line}\n\n"

        await process.wait()

    except FileNotFoundError:
        yield f"data: ❌ Could not launch SpotiFLAC. Check the path: '{binary_path}'\n\n"
        yield "data: [DONE]\n\n"
        return
    except Exception as e:
        yield f"data: ❌ Unexpected error: {e}\n\n"
        yield "data: [DONE]\n\n"
        return
    finally:
        registry.pop(job_id, None)

    yield "data: \n\n"

    if process.returncode == 0:
        # SpotiFLAC won't find the spotify playlist
        if is_playlist and playlist_mode == "folder" and playlist_folder:
            for entry in list(pathlib.Path(output_dir).iterdir()):
                if entry.is_dir():
                    flac_files_inside = list(entry.rglob("*.flac"))
                    if flac_files_inside:
                        yield f"data: 🔧 Flattening SpotiFLAC subfolder '{entry.name}' → '{playlist_folder}'...\n\n"
                        for item in entry.iterdir():
                            dest = pathlib.Path(output_dir) / item.name
                            # Avoid clobbering; rename if clash
                            if dest.exists():
                                dest = pathlib.Path(output_dir) / (item.stem + "_1" + item.suffix)
                            shutil.move(str(item), str(dest))
                        try:
                            entry.rmdir()
                        except OSError:
                            pass

        yield f"data: ✅ SpotiFLAC download complete! Files saved to '{output_dir}'.\n\n"
        if downloaded:
            yield f"data:   Tracks detected  : {downloaded}\n\n"
        if errors:
            yield f"data:   ⚠️  Errors          : {errors}\n\n"

        # Post download transcoding if the user has it set in config
        if output_format != "flac":
            yield f"data: \n\n"
            yield f"data: 🔄 Transcoding FLAC → {output_format.upper()} using FFmpeg. This may take a while...\n\n"

            flac_files = list(pathlib.Path(output_dir).rglob("*.flac"))
            if not flac_files:
                yield f"data: ⚠️  No FLAC files found in '{output_dir}' to transcode.\n\n"
            else:
                yield f"data:   Found {len(flac_files)} FLAC file(s) to transcode.\n\n"
                transcoded = 0
                transcode_errors = 0

                for flac_path in flac_files:
                    out_path = flac_path.with_suffix(f".{output_format}")
                    yield f"data:   ↳ {flac_path.name} → {out_path.name}\n\n"

                    if output_format == "mp3":
                        ffmpeg_cmd = [
                            "ffmpeg", "-y", "-i", str(flac_path),
                            "-map_metadata", "0",
                            "-id3v2_version", "3",
                            "-q:a", "0",
                            str(out_path),
                        ]
                    else:  # opus
                        ffmpeg_cmd = [
                            "ffmpeg", "-y", "-i", str(flac_path),
                            "-map_metadata", "0",
                            "-c:a", "libopus",
                            "-b:a", "320k",
                            str(out_path),
                        ]

                    try:
                        proc = await asyncio.create_subprocess_exec(
                            *ffmpeg_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.STDOUT,
                        )
                        await proc.wait()
                        if proc.returncode == 0:
                            flac_path.unlink()  # Delete original FLAC
                            transcoded += 1
                        else:
                            yield f"data:     ⚠️  FFmpeg error for '{flac_path.name}' (code {proc.returncode}). Original kept.\n\n"
                            transcode_errors += 1
                    except FileNotFoundError:
                        yield "data: ❌ FFmpeg not found. Install FFmpeg and ensure it's in PATH.\n\n"
                        yield "data: [DONE]\n\n"
                        return
                    except Exception as e:
                        yield f"data:     ❌ Transcoding error: {e}\n\n"
                        transcode_errors += 1

                yield f"data: ✅ Transcoding complete! {transcoded} file(s) converted to {output_format.upper()}.\n\n"
                if transcode_errors:
                    yield f"data:   ⚠️  {transcode_errors} file(s) failed to transcode.\n\n"
    else:
        yield (
            f"data: ⚠️  SpotiFLAC exited with code {process.returncode}. "
            f"Some tracks may have failed — check the log above.\n\n"
        )

    yield "data: [DONE]\n\n"