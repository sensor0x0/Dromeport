import asyncio
import json
import pathlib
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator

from apscheduler.schedulers.asyncio import AsyncIOScheduler


# Stored alongside main.py
_SYNC_DATA_FILE = pathlib.Path(__file__).parent / "sync_playlists.json"


class SyncManager:
    def __init__(self, spotiflac_path: str = ""):
        self._path = _SYNC_DATA_FILE
        self._playlists: dict[str, dict] = {}
        self._scheduler = AsyncIOScheduler()
        # Needed so scheduled runs can inject the spotiflac path just like the download endpoint does
        self._spotiflac_path = spotiflac_path
        self._load()

    def start(self):
        self._scheduler.start()
        self._reschedule_all()

    def stop(self):
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def _load(self):
        if self._path.exists():
            try:
                self._playlists = json.loads(self._path.read_text())
            except Exception:
                self._playlists = {}

    def _save(self):
        try:
            self._path.write_text(json.dumps(self._playlists, indent=2, default=str))
        except Exception:
            pass

    # CRUD

    def list_playlists(self) -> list[dict]:
        result = []
        for p in self._playlists.values():
            entry = dict(p)
            job = self._scheduler.get_job(f"sync_{p['id']}")
            entry["next_run_at"] = (
                job.next_run_time.isoformat() if job and job.next_run_time else None
            )
            result.append(entry)
        return result

    def get_playlist(self, pid: str) -> dict | None:
        return self._playlists.get(pid)

    def add_playlist(self, data: dict) -> dict:
        pid = str(uuid.uuid4())
        playlist = {
            "id": pid,
            "url": data["url"],
            "name": data["name"],
            "thumb": data.get("thumb"),
            "provider": data["provider"],
            # Full config snapshot so scheduled runs use the right settings
            "config": data["config"],
            "playlist_folder": data.get("playlist_folder", ""),
            "schedule_type": data.get("schedule_type", "interval"),
            "interval_value": int(data.get("interval_value", 24)),
            "interval_unit": data.get("interval_unit", "hours"),
            "cron_time": data.get("cron_time", "08:00"),
            "cron_days": data.get("cron_days", "daily"),
            "enabled": bool(data.get("enabled", True)),
            "last_synced_at": None,
            "last_sync_status": None,
            "last_sync_log": None,
        }
        self._playlists[pid] = playlist
        self._save()
        if playlist["enabled"]:
            self._schedule_playlist(playlist)
        return playlist

    def update_playlist(self, pid: str, data: dict) -> dict | None:
        if pid not in self._playlists:
            return None
        playlist = self._playlists[pid]
        for key in [
            "name", "schedule_type", "interval_value", "interval_unit",
            "cron_time", "cron_days", "enabled",
        ]:
            if key in data:
                playlist[key] = data[key]
        self._save()
        # Reschedule with updated settings
        self._unschedule_playlist(pid)
        if playlist["enabled"]:
            self._schedule_playlist(playlist)
        return playlist

    def delete_playlist(self, pid: str) -> bool:
        if pid not in self._playlists:
            return False
        self._unschedule_playlist(pid)
        del self._playlists[pid]
        self._save()
        return True

    # Scheduling

    def _schedule_playlist(self, playlist: dict):
        pid = playlist["id"]
        job_id = f"sync_{pid}"

        if playlist["schedule_type"] == "interval":
            unit = playlist["interval_unit"]
            value = int(playlist["interval_value"])
            self._scheduler.add_job(
                self._run_sync_job,
                "interval",
                id=job_id,
                replace_existing=True,
                args=[pid],
                **{unit: value},
            )
        else:
            # cron
            time_str = playlist.get("cron_time", "08:00")
            try:
                hour, minute = time_str.split(":")
            except ValueError:
                hour, minute = "8", "0"

            days = playlist.get("cron_days", "daily")
            if days == "weekdays":
                day_of_week = "mon-fri"
            elif days == "weekends":
                day_of_week = "sat,sun"
            elif days == "daily":
                day_of_week = "*"
            else:
                # specific day e.g. "mon", "tue"
                day_of_week = days

            self._scheduler.add_job(
                self._run_sync_job,
                "cron",
                id=job_id,
                replace_existing=True,
                args=[pid],
                hour=int(hour),
                minute=int(minute),
                day_of_week=day_of_week,
            )

    def _unschedule_playlist(self, pid: str):
        job_id = f"sync_{pid}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

    def _reschedule_all(self):
        for playlist in self._playlists.values():
            if playlist.get("enabled"):
                self._schedule_playlist(playlist)

    # Config helpers

    def _build_config(self, playlist: dict) -> dict:
        config = dict(playlist["config"])
        if self._spotiflac_path and not config.get("spotify", {}).get("spotiflacPath", "").strip():
            config.setdefault("spotify", {})["spotiflacPath"] = self._spotiflac_path
        playlist_folder = playlist.get("playlist_folder", "")
        if playlist_folder:
            config["playlistMode"] = "folder"
            config["_playlist_folder"] = playlist_folder
        # Never use artist/album subfolders for sync - the playlist folder is the organisation
        config.setdefault("spotify", {})["spotiflacArtistSubfolders"] = False
        config.setdefault("spotify", {})["spotiflacAlbumSubfolders"] = False
        return config

    # Sync execution

    async def _run_sync_job(self, pid: str):
        """Background scheduled sync. Runs silently and saves the result."""
        playlist = self._playlists.get(pid)
        if not playlist:
            return

        from providers.ytmusic import download_ytmusic_stream
        from providers.spotify import download_spotify_stream

        config = self._build_config(playlist)
        url = playlist["url"]
        provider = playlist["provider"]
        job_id = f"scheduled_{pid}_{uuid.uuid4().hex[:8]}"
        registry: dict[str, Any] = {}
        log_lines: list[str] = []
        status = "success"

        try:
            if provider == "YouTube Music":
                gen = download_ytmusic_stream(url, config, job_id, registry)
            else:
                gen = download_spotify_stream(url, config, job_id, registry)

            async for chunk in gen:
                if chunk.startswith("data: "):
                    line = chunk[6:].rstrip("\n")
                    if line and line != "[DONE]":
                        log_lines.append(line)
                        if "SpotiFLAC exited with code" in line or line.startswith("❌ Could not launch") or line.startswith("❌ Unexpected"):
                            status = "error"
        except Exception as e:
            log_lines.append(f"Sync error: {e}")
            status = "error"

        self._update_sync_result(pid, status, "\n".join(log_lines))

    async def run_sync_stream(self, pid: str) -> AsyncGenerator[str, None]:
        """Manual sync with live SSE output."""
        playlist = self._playlists.get(pid)
        if not playlist:
            yield "data: ❌ Playlist not found.\n\n"
            yield "data: [DONE]\n\n"
            return

        from providers.ytmusic import download_ytmusic_stream
        from providers.spotify import download_spotify_stream

        config = self._build_config(playlist)
        url = playlist["url"]
        provider = playlist["provider"]
        job_id = str(uuid.uuid4())
        registry: dict[str, Any] = {}
        log_lines: list[str] = []
        status = "success"

        try:
            if provider == "YouTube Music":
                gen = download_ytmusic_stream(url, config, job_id, registry)
            else:
                gen = download_spotify_stream(url, config, job_id, registry)

            async for chunk in gen:
                yield chunk
                if chunk.startswith("data: "):
                    line = chunk[6:].rstrip("\n")
                    if line and line != "[DONE]":
                        log_lines.append(line)
                        if "SpotiFLAC exited with code" in line or line.startswith("❌ Could not launch") or line.startswith("❌ Unexpected"):
                            status = "error"
        except Exception as e:
            yield f"data: ❌ Sync error: {e}\n\n"
            yield "data: [DONE]\n\n"
            status = "error"
        finally:
            # Always save the result, even if the client disconnected mid-stream
            self._update_sync_result(pid, status, "\n".join(log_lines))

    def _update_sync_result(self, pid: str, status: str, log: str):
        if pid in self._playlists:
            self._playlists[pid]["last_synced_at"] = datetime.utcnow().isoformat()
            self._playlists[pid]["last_sync_status"] = status
            # Keep the last 5000 chars so the file doesn't grow forever
            self._playlists[pid]["last_sync_log"] = log[-5000:] if log else ""
            self._save()