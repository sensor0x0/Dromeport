import asyncio
import base64
import io
import json
import os
import pathlib
import queue
import re
import shutil
import struct
import threading
from contextlib import redirect_stdout
from typing import AsyncGenerator, Any

from SpotiFLAC import SpotiFLAC


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_playlist_url(url: str) -> bool:
    u = url.lower()
    return "/playlist/" in u or "/album/" in u


def _meta(payload: dict) -> str:
    return f"event: meta\ndata: {json.dumps(payload)}\n\n"


# ── stdout capture ────────────────────────────────────────────────────────────

class _LineQueue(io.TextIOBase):
    """Replacement stdout that feeds each complete line into a queue."""

    def __init__(self, q: "queue.Queue[str | None]") -> None:
        self._q = q
        self._buf = ""

    def write(self, s: str) -> int:
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            self._q.put(line)
        return len(s)

    def flush(self) -> None:
        if self._buf.strip():
            self._q.put(self._buf)
            self._buf = ""


# ── Cancellation proxy ────────────────────────────────────────────────────────

class _ThreadJobProxy:
    """
    Matches the asyncio.subprocess.Process interface so main.py's cancel
    handler works unchanged — it just calls terminate() / kill() / wait().
    """

    def __init__(self, cancel_event: threading.Event) -> None:
        self._cancel = cancel_event
        self.returncode: int | None = None

    def terminate(self) -> None:
        self._cancel.set()

    def kill(self) -> None:
        self._cancel.set()

    async def wait(self) -> int | None:
        return self.returncode


# ── Public entry point ────────────────────────────────────────────────────────

async def download_spotify_stream(
    url: str,
    config: dict,
    job_id: str,
    registry: dict[str, Any],
) -> AsyncGenerator[str, None]:
    async for chunk in _spotiflac_stream(url, config, job_id, registry):
        yield chunk


# ── Core stream ───────────────────────────────────────────────────────────────

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

    service: str = spotify_config.get("spotiflacService", "tidal")
    loop_minutes: int = int(spotify_config.get("spotiflacLoop", 0))
    artist_subfolders: bool = bool(spotify_config.get("spotiflacArtistSubfolders", False))
    album_subfolders: bool = bool(spotify_config.get("spotiflacAlbumSubfolders", True))
    filename_format: str = spotify_config.get(
        "spotiflacFilenameFormat", "{track_number} {title} - {artist}"
    )
    output_format: str = spotify_config.get("spotiflacOutputFormat", "flac").lower()

    # Determine and create output directory
    if is_playlist and playlist_mode == "folder" and playlist_folder:
        output_dir = os.path.join(library_path, playlist_folder)
        try:
            os.makedirs(output_dir, exist_ok=True)
        except OSError as exc:
            yield f"data: Could not create directory '{output_dir}': {exc}\n\n"
            yield f"event: status\ndata: {json.dumps({'success': False})}\n\n"
            yield "data: [DONE]\n\n"
            return
    else:
        output_dir = library_path

    services = service.split()

    # ── Banner ──
    yield f"data: Starting Spotify download via SpotiFLAC (service: {service})...\n\n"
    if is_playlist:
        dest_note = (
            f"'{playlist_folder}'" if playlist_folder
            else "library root (SpotiFLAC will create a subfolder per album/playlist)"
        )
        yield f"data:   Output folder : {dest_note}\n\n"
    yield "data: \n\n"

    if is_playlist and playlist_folder:
        yield _meta({"type": "title", "value": playlist_folder})
    else:
        yield _meta({"type": "title", "value": "Spotify download"})

    # ── Thread setup ──
    output_q: "queue.Queue[str | None]" = queue.Queue(maxsize=2000)
    cancel_event = threading.Event()
    proxy = _ThreadJobProxy(cancel_event)

    registry[job_id] = {
        "process": proxy,
        "provider": "spotiflac",
        "library_path": library_path,
    }

    def _run() -> None:
        try:
            writer = _LineQueue(output_q)
            with redirect_stdout(writer):
                SpotiFLAC(
                    url=url,
                    output_dir=output_dir,
                    services=services,
                    filename_format=filename_format,
                    use_track_numbers=False,
                    use_artist_subfolders=artist_subfolders,
                    use_album_subfolders=album_subfolders,
                    loop=loop_minutes if loop_minutes > 0 else None,
                )
            writer.flush()
        except KeyboardInterrupt:
            output_q.put("__CANCELLED__")
        except Exception as exc:
            output_q.put(f"__EXCEPTION__: {exc}")
        finally:
            output_q.put(None)  # sentinel

    event_loop = asyncio.get_event_loop()
    thread_future = event_loop.run_in_executor(None, _run)

    # ── Consume output ──
    downloaded = 0
    errors = 0
    skipped = 0
    total_count = 0
    had_fatal_error = False
    was_cancelled = False

    try:
        while True:
            if cancel_event.is_set():
                was_cancelled = True
                break

            try:
                line: str | None = await asyncio.wait_for(
                    event_loop.run_in_executor(None, output_q.get),
                    timeout=300.0,
                )
            except asyncio.TimeoutError:
                yield "data: No output from SpotiFLAC for 5 minutes — it may be hung.\n\n"
                had_fatal_error = True
                break

            if line is None:
                break

            if line.startswith("__EXCEPTION__:"):
                yield f"data: SpotiFLAC error: {line[14:].strip()}\n\n"
                had_fatal_error = True
                continue

            if line == "__CANCELLED__":
                was_cancelled = True
                continue

            if line.startswith("[DEBUG]"):
                continue

            # ── Parse known output patterns ───────────────────────────────

            if m := re.match(r"^\[(\d+)/(\d+)\]\s+Starting download:\s*(.+)", line):
                current, total = int(m.group(1)), int(m.group(2))
                total_count = total
                yield _meta({"type": "progress", "current": current - 1, "total": total})

            elif "Successfully downloaded using:" in line:
                downloaded += 1
                yield _meta({"type": "progress", "current": downloaded, "total": total_count})

            elif re.search(r"\[X\]\s+Failed all services", line, re.IGNORECASE):
                errors += 1
                yield f"data: {line}\n\n"
                yield "data: Tip: This track couldn't be found on any service. Try it via YouTube Music instead.\n\n"
                continue

            elif "File already exists:" in line and "Skipping" in line:
                skipped += 1

            elif "Fetching metadata" in line:
                yield "data: Fetching Spotify metadata...\n\n"
                continue

            elif line.startswith("Error:") or line.startswith("Warning: Invalid output directory"):
                had_fatal_error = True

            elif re.match(r"^=+$", line.strip()):
                yield "data: \n\n"
                continue

            yield f"data: {line}\n\n"

    except Exception as exc:
        yield f"data: Unexpected error reading SpotiFLAC output: {exc}\n\n"
        had_fatal_error = True
    finally:
        registry.pop(job_id, None)
        while True:
            try:
                output_q.get_nowait()
            except queue.Empty:
                break

    try:
        await asyncio.wait_for(thread_future, timeout=30.0)
    except asyncio.TimeoutError:
        pass

    yield "data: \n\n"

    # A download where every track failed is not a success, even if SpotiFLAC
    # itself exited cleanly.  Only applies when we actually tried something
    # (total_count > 0) — pure metadata errors are caught by had_fatal_error.
    complete_failure = errors > 0 and downloaded == 0 and total_count > 0
    success = not had_fatal_error and not was_cancelled and not complete_failure

    if was_cancelled:
        yield "data: Download cancelled.\n\n"

    elif success:
        if is_playlist and playlist_mode == "folder" and playlist_folder:
            async for chunk in _flatten_spotiflac_subfolders(output_dir):
                yield chunk

        yield f"data: ✅ SpotiFLAC download complete! Files saved to '{output_dir}'.\n\n"
        if downloaded:
            yield f"data:   Tracks downloaded : {downloaded}\n\n"
        if skipped:
            yield f"data:   Already existed   : {skipped} (skipped)\n\n"
        if errors:
            yield f"data:   ⚠️  Failed          : {errors}\n\n"

        if output_format != "flac":
            yield "data: \n\n"
            async for chunk in _transcode_flac(output_dir, output_format):
                yield chunk

    elif complete_failure:
        yield f"data: ❌ No tracks could be downloaded ({errors} failed). Try a different service or use YouTube Music instead.\n\n"

    else:
        yield "data: SpotiFLAC encountered errors. Check the log above.\n\n"

    # Structured status event consumed by sync.py
    yield (
        f"event: status\n"
        f"data: {json.dumps({'success': success, 'downloaded': downloaded, 'errors': errors, 'skipped': skipped})}\n\n"
    )
    yield "data: [DONE]\n\n"


# ── Post-download helpers ─────────────────────────────────────────────────────

async def _flatten_spotiflac_subfolders(output_dir: str) -> AsyncGenerator[str, None]:
    """Move files from SpotiFLAC's auto-created subfolder up into output_dir."""
    output_path = pathlib.Path(output_dir)
    for entry in list(output_path.iterdir()):
        if not entry.is_dir():
            continue
        if not any(f.is_file() for f in entry.rglob("*")):
            continue

        yield f"data: Flattening SpotiFLAC subfolder '{entry.name}' into '{output_path.name}'...\n\n"
        for item in list(entry.iterdir()):
            dest = output_path / item.name
            if dest.exists():
                try:
                    item.unlink() if item.is_file() else shutil.rmtree(str(item))
                except OSError:
                    pass
            else:
                shutil.move(str(item), str(dest))
        try:
            entry.rmdir()
        except OSError:
            pass


async def _transcode_flac(output_dir: str, output_format: str) -> AsyncGenerator[str, None]:
    """Transcode all FLAC files in output_dir to output_format via FFmpeg."""
    yield f"data: Transcoding FLAC to {output_format.upper()} using FFmpeg. This may take a while...\n\n"

    flac_files = list(pathlib.Path(output_dir).rglob("*.flac"))
    if not flac_files:
        yield f"data: No FLAC files found in '{output_dir}' to transcode.\n\n"
        return

    yield f"data:   Found {len(flac_files)} FLAC file(s) to transcode.\n\n"
    transcoded = 0
    transcode_errors = 0

    for flac_path in flac_files:
        suffix = ".ogg" if output_format == "opus" else f".{output_format}"
        out_path = flac_path.with_suffix(suffix)
        yield f"data:   {flac_path.name} -> {out_path.name}\n\n"

        if output_format == "mp3":
            ffmpeg_cmd = [
                "ffmpeg", "-y", "-i", str(flac_path),
                "-map_metadata", "0", "-id3v2_version", "3", "-q:a", "0",
                str(out_path),
            ]
        else:  # opus
            ffmpeg_cmd = [
                "ffmpeg", "-y", "-i", str(flac_path),
                "-vn", "-map_metadata", "0", "-c:a", "libopus", "-b:a", "320k",
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
                if output_format == "opus":
                    try:
                        from mutagen.flac import FLAC
                        from mutagen.oggopus import OggOpus

                        flac_tags = FLAC(str(flac_path))
                        if flac_tags.pictures:
                            pic = flac_tags.pictures[0]
                            mime = pic.mime.encode("utf-8")
                            desc = pic.desc.encode("utf-8")
                            data = pic.data
                            block = struct.pack(">I", pic.type)
                            block += struct.pack(">I", len(mime)) + mime
                            block += struct.pack(">I", len(desc)) + desc
                            block += struct.pack(
                                ">IIIII",
                                pic.width, pic.height, pic.depth, pic.colors, len(data),
                            )
                            block += data
                            ogg = OggOpus(str(out_path))
                            ogg["metadata_block_picture"] = [
                                base64.b64encode(block).decode("ascii")
                            ]
                            ogg.save()
                    except Exception as cover_err:
                        yield f"data:   Cover art embedding failed (file is still OK): {cover_err}\n\n"

                flac_path.unlink()
                transcoded += 1
            else:
                yield f"data:   FFmpeg error for '{flac_path.name}' (code {proc.returncode}). Original kept.\n\n"
                transcode_errors += 1

        except FileNotFoundError:
            yield "data: FFmpeg not found. Install FFmpeg and ensure it's in PATH.\n\n"
            return
        except Exception as exc:
            yield f"data:   Transcoding error: {exc}\n\n"
            transcode_errors += 1

    yield f"data: Transcoding complete! {transcoded} file(s) converted to {output_format.upper()}.\n\n"
    if transcode_errors:
        yield f"data:   {transcode_errors} file(s) failed to transcode.\n\n"