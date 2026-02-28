import asyncio
import base64
import pathlib
import re
import struct
import time
from typing import AsyncGenerator, Optional

import requests

# Spotify token, thanks to SpotiFLAC
# https://github.com/jelte1/SpotiFLAC-Command-Line-Interface/blob/main/SpotiFLAC/getMetadata.py

_token_cache: dict = {"token": None, "expires_at": 0.0}


def _get_spotify_token() -> Optional[str]:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]
    try:
        from SpotiFLAC.getMetadata import get_access_token as _sf_token
        result = _sf_token()
        if "error" in result:
            return None
        token = result.get("accessToken")
        if not token:
            return None
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + 3480
        return token
    except Exception:
        return None


# Spotify API

def _spotify_get(path: str, token: str) -> Optional[dict]:
    url = f"https://api.spotify.com/v1/{path}"
    for _ in range(3):
        try:
            resp = requests.get(
                url, headers={"Authorization": f"Bearer {token}"}, timeout=10
            )
            if resp.status_code == 429:
                time.sleep(int(resp.headers.get("Retry-After", "5")) + 1)
                continue
            if resp.status_code == 401:
                _token_cache["token"] = None
                new = _get_spotify_token()
                if new:
                    token = new
                continue
            if resp.status_code != 200:
                return None
            return resp.json()
        except Exception:
            time.sleep(1)
    return None


def _spotify_track_id_from_isrc(isrc: str, token: str) -> Optional[str]:
    data = _spotify_get(f"search?q=isrc:{isrc}&type=track&limit=1", token)
    if not data:
        return None
    items = data.get("tracks", {}).get("items", [])
    return items[0].get("id") if items else None


def _fetch_spotify_enrichment(track_id: str, token: str) -> dict:
    # Pull cover art, label, copyright and genres for a Spotify track ID
    result: dict = {}

    track = _spotify_get(f"tracks/{track_id}", token)
    if not track:
        return result

    result["_track_name"] = track.get("name", "")
    artists = track.get("artists", [])
    result["_artist_name"] = artists[0].get("name", "") if artists else ""

    # High-res cover art (images[] sorted largest first by Spotify)
    images = track.get("album", {}).get("images", [])
    if images:
        result["cover_url"] = images[0]["url"]

    # Album: label, copyright, album-level genres
    album_id = track.get("album", {}).get("id")
    if album_id:
        album = _spotify_get(f"albums/{album_id}", token)
        if album:
            if album.get("label"):
                result["label"] = album["label"]
            copyrights = [
                c.get("text", "") for c in album.get("copyrights", [])
                if c.get("type") == "C" and c.get("text")
            ]
            if copyrights:
                result["copyright"] = copyrights[0]
            result["genres"] = list(album.get("genres", []))

    # Artist genres - fallback when album genres empty (common for most albums)
    if not result.get("genres"):
        genres: list[str] = []
        seen: set[str] = set()
        for aid in [a.get("id") for a in artists[:2] if a.get("id")]:
            artist = _spotify_get(f"artists/{aid}", token)
            if artist:
                for g in artist.get("genres", []):
                    if g not in seen:
                        seen.add(g)
                        genres.append(g)
        if genres:
            result["genres"] = genres

    return result


# MusicBrainz

_MB_USER_AGENT = "Dromeport/1.0 (https://github.com/sensor0x0/dromeport)"
_mb_last_request_time: float = 0.0


def _mb_rate_limit():
    global _mb_last_request_time
    elapsed = time.time() - _mb_last_request_time
    if elapsed < 1.05:
        time.sleep(1.05 - elapsed)
    _mb_last_request_time = time.time()


def _parse_mb_recording(rec: dict) -> dict:
    result: dict = {}
    tags = rec.get("tags", [])
    if tags:
        sorted_tags = sorted(tags, key=lambda t: t.get("count", 0), reverse=True)
        result["mb_genres"] = [t["name"] for t in sorted_tags[:8] if t.get("name")]
    releases = rec.get("releases", [])
    if releases:
        label_info = releases[0].get("label-info", [])
        if label_info and label_info[0].get("label", {}).get("name"):
            result["mb_label"] = label_info[0]["label"]["name"]
    return result


def _musicbrainz_by_isrc(isrc: str) -> dict:
    _mb_rate_limit()
    try:
        resp = requests.get(
            f"https://musicbrainz.org/ws/2/recording?query=isrc:{isrc}&fmt=json&limit=1",
            headers={"User-Agent": _MB_USER_AGENT, "Accept": "application/json"},
            timeout=10,
        )
        if resp.status_code != 200:
            return {}
        recordings = resp.json().get("recordings", [])
        return _parse_mb_recording(recordings[0]) if recordings else {}
    except Exception:
        return {}


def _musicbrainz_by_text(artist: str, title: str) -> dict:
    # MusicBrainz by text (for youtube music tracks and tracks without an ISRC)
    if not artist or not title:
        return {}
    _mb_rate_limit()
    try:
        # Strip "(feat. X)" suffixes - they confuse the MusicBrainz query parser
        clean_title = re.sub(r"\s*\(feat\..*?\)", "", title, flags=re.IGNORECASE).strip()
        query = f'recording:"{clean_title}" AND artist:"{artist}"'
        resp = requests.get(
            "https://musicbrainz.org/ws/2/recording",
            params={"query": query, "fmt": "json", "limit": 5, "inc": "tags releases label-info"},
            headers={"User-Agent": _MB_USER_AGENT, "Accept": "application/json"},
            timeout=12,
        )
        if resp.status_code != 200:
            return {}
        recordings = resp.json().get("recordings", [])
        if not recordings:
            return {}
        # Prefer the recording with the most community tags
        best = max(recordings, key=lambda r: len(r.get("tags", [])), default=None)
        return _parse_mb_recording(best) if best else {}
    except Exception:
        return {}


# Last.fm (optional)

_LASTFM_SKIP = {
    "seen live", "favorites", "favourite", "love", "awesome", "great",
    "under 2000 listeners", "beautiful", "chill", "epic",
}


def _lastfm_track_tags(artist: str, title: str, api_key: str) -> list[str]:
    try:
        resp = requests.get(
            "https://ws.audioscrobbler.com/2.0/",
            params={
                "method": "track.getTopTags",
                "artist": artist,
                "track": title,
                "api_key": api_key,
                "format": "json",
                "limit": 8,
                "autocorrect": 1,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        tags = resp.json().get("toptags", {}).get("tag", [])
        return [
            t["name"] for t in tags
            if t.get("name")
            and int(t.get("count", 0)) >= 20
            and t["name"].lower() not in _LASTFM_SKIP
        ]
    except Exception:
        return []


# Youtube music (cover art only)

def _ytmusic_enrichment(video_id: str, artist: str = "", title: str = "") -> dict:
    # Fetch square high res thumbnail from Youtube music
    result: dict = {}
    try:
        from ytmusicapi import YTMusic
        yt = YTMusic()

        # Search returns square thumbnails; yt.get_song() returns 16:9
        if artist and title:
            query = f"{title} {artist}"
            hits = yt.search(query, filter="songs", limit=5)
            for hit in hits:
                thumbs = hit.get("thumbnails", [])
                if thumbs:
                    best = max(thumbs, key=lambda t: t.get("width", 0))
                    if best.get("width", 0) >= 200:
                        result["cover_url"] = best["url"]
                        break

        # Fallback to get_song if search returned nothing
        if not result.get("cover_url") and video_id:
            try:
                song = yt.get_song(video_id)
                thumbs = (
                    song.get("videoDetails", {})
                    .get("thumbnail", {})
                    .get("thumbnails", [])
                )
                if thumbs:
                    result["cover_url"] = thumbs[-1]["url"]
            except Exception:
                pass

    except Exception:
        pass

    return result


# Tag-reading helpers

def _read_isrc(filepath: str) -> Optional[str]:
    ext = pathlib.Path(filepath).suffix.lower()
    try:
        if ext == ".flac":
            from mutagen.flac import FLAC
            tags = FLAC(filepath)
            values = tags.get("ISRC") or tags.get("isrc") or []
            return values[0] if values else None
        elif ext == ".mp3":
            from mutagen.id3 import ID3
            tags = ID3(filepath)
            frame = tags.get("TSRC")
            return str(frame) if frame else None
        elif ext in (".m4a", ".aac"):
            from mutagen.mp4 import MP4
            tags = MP4(filepath)
            values = tags.get("----:com.apple.iTunes:ISRC", [])
            if values:
                v = values[0]
                return v.decode() if isinstance(v, bytes) else str(v)
        elif ext in (".opus", ".ogg"):
            from mutagen.oggopus import OggOpus
            tags = OggOpus(filepath)
            values = tags.get("isrc") or tags.get("ISRC") or []
            return values[0] if values else None
    except Exception:
        pass
    return None


def _read_tags(filepath: str) -> dict:
    # Read tags from a file's existing metadata
    ext = pathlib.Path(filepath).suffix.lower()
    result: dict = {}
    try:
        if ext == ".flac":
            from mutagen.flac import FLAC
            tags = FLAC(filepath)
            result["artist"] = (tags.get("artist") or tags.get("ARTIST") or [""])[0]
            result["title"] = (tags.get("title") or tags.get("TITLE") or [""])[0]
        elif ext in (".opus", ".ogg"):
            from mutagen.oggopus import OggOpus
            tags = OggOpus(filepath)
            result["artist"] = (tags.get("artist") or [""])[0]
            result["title"] = (tags.get("title") or [""])[0]
        elif ext == ".mp3":
            from mutagen.id3 import ID3
            tags = ID3(filepath)
            result["artist"] = str(tags.get("TPE1", ""))
            result["title"] = str(tags.get("TIT2", ""))
        elif ext in (".m4a", ".aac"):
            from mutagen.mp4 import MP4
            tags = MP4(filepath)
            result["artist"] = (tags.get("\xa9ART") or [""])[0]
            result["title"] = (tags.get("\xa9nam") or [""])[0]
    except Exception:
        pass
    return result


def _extract_ytmusic_video_id(filepath: str) -> Optional[str]:
    ext = pathlib.Path(filepath).suffix.lower()
    try:
        if ext == ".flac":
            from mutagen.flac import FLAC
            tags = FLAC(filepath)
            for key in ("purl", "url", "comment", "description"):
                for val in tags.get(key, []):
                    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", val)
                    if m:
                        return m.group(1)
        elif ext in (".opus", ".ogg"):
            from mutagen.oggopus import OggOpus
            tags = OggOpus(filepath)
            for key in ("purl", "url", "comment"):
                for val in tags.get(key, []):
                    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", val)
                    if m:
                        return m.group(1)
        elif ext == ".mp3":
            from mutagen.id3 import ID3
            tags = ID3(filepath)
            for frame_id in ("WOAS", "WOAR", "COMM::eng", "COMM::"):
                frame = tags.get(frame_id)
                if frame:
                    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", str(frame))
                    if m:
                        return m.group(1)
    except Exception:
        pass
    return None


# Cover art

def _fetch_cover(url: str) -> Optional[bytes]:
    if not url:
        return None
    try:
        resp = requests.get(url, timeout=15)
        return resp.content if resp.status_code == 200 else None
    except Exception:
        return None


def _guess_mime(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return "image/jpeg"


# Tag writers

def _vc_set(audio, key: str, value) -> None:
    if value:
        audio[key] = str(value)


def _write_flac_tags(filepath: str, tags: dict, cover_bytes: Optional[bytes]) -> bool:
    try:
        from mutagen.flac import FLAC, Picture
        from mutagen.id3 import PictureType
        audio = FLAC(filepath)
        _vc_set(audio, "GENRE", "; ".join(tags["genres"]) if tags.get("genres") else None)
        _vc_set(audio, "LABEL", tags.get("label"))
        _vc_set(audio, "ORGANIZATION", tags.get("label"))
        _vc_set(audio, "COPYRIGHT", tags.get("copyright"))
        if cover_bytes:
            audio.clear_pictures()
            pic = Picture()
            pic.data = cover_bytes
            pic.type = PictureType.COVER_FRONT
            pic.mime = _guess_mime(cover_bytes)
            pic.desc = "Cover"
            audio.add_picture(pic)
        audio.save()
        return True
    except Exception:
        return False


def _write_mp3_tags(filepath: str, tags: dict, cover_bytes: Optional[bytes]) -> bool:
    try:
        from mutagen.id3 import ID3, ID3NoHeaderError, TCON, TPUB, TCOP, APIC
        try:
            audio = ID3(filepath)
        except ID3NoHeaderError:
            audio = ID3()
        if tags.get("genres"):
            audio["TCON"] = TCON(encoding=3, text=tags["genres"])
        if tags.get("label"):
            audio["TPUB"] = TPUB(encoding=3, text=[tags["label"]])
        if tags.get("copyright"):
            audio["TCOP"] = TCOP(encoding=3, text=[tags["copyright"]])
        if cover_bytes:
            audio.delall("APIC")
            audio["APIC:"] = APIC(
                encoding=3, mime=_guess_mime(cover_bytes),
                type=3, desc="Cover", data=cover_bytes,
            )
        audio.save(filepath, v2_version=3)
        return True
    except Exception:
        return False


def _write_m4a_tags(filepath: str, tags: dict, cover_bytes: Optional[bytes]) -> bool:
    try:
        from mutagen.mp4 import MP4, MP4Cover
        audio = MP4(filepath)
        if tags.get("genres"):
            audio["\xa9gen"] = tags["genres"]
        if cover_bytes:
            fmt = (MP4Cover.FORMAT_JPEG if _guess_mime(cover_bytes) == "image/jpeg"
                   else MP4Cover.FORMAT_PNG)
            audio["covr"] = [MP4Cover(cover_bytes, imageformat=fmt)]
        audio.save()
        return True
    except Exception:
        return False


def _write_opus_tags(filepath: str, tags: dict, cover_bytes: Optional[bytes]) -> bool:
    try:
        from mutagen.oggopus import OggOpus
        audio = OggOpus(filepath)
        if tags.get("genres"):
            audio["genre"] = ["; ".join(tags["genres"])]
        if tags.get("label"):
            audio["label"] = [tags["label"]]
        if tags.get("copyright"):
            audio["copyright"] = [tags["copyright"]]
        if cover_bytes:
            mime = _guess_mime(cover_bytes).encode()
            desc = b""
            block = struct.pack(">I", 3)
            block += struct.pack(">I", len(mime)) + mime
            block += struct.pack(">I", len(desc)) + desc
            block += struct.pack(">IIIII", 0, 0, 0, 0, len(cover_bytes))
            block += cover_bytes
            audio["metadata_block_picture"] = [base64.b64encode(block).decode()]
        audio.save()
        return True
    except Exception:
        return False


def _write_tags(filepath: str, tags: dict, cover_bytes: Optional[bytes]) -> bool:
    ext = pathlib.Path(filepath).suffix.lower()
    if ext == ".flac":
        return _write_flac_tags(filepath, tags, cover_bytes)
    elif ext == ".mp3":
        return _write_mp3_tags(filepath, tags, cover_bytes)
    elif ext in (".m4a", ".aac"):
        return _write_m4a_tags(filepath, tags, cover_bytes)
    elif ext in (".opus", ".ogg"):
        return _write_opus_tags(filepath, tags, cover_bytes)
    return False


# Genre merging

def _merge_enrichment(spotify: dict, mb: dict, lastfm: list[str]) -> dict:
    merged = {k: v for k, v in spotify.items() if not k.startswith("_")}

    if not merged.get("label") and mb.get("mb_label"):
        merged["label"] = mb["mb_label"]

    # Genre priority: MusicBrainz (most specific) then Spotify then Last.fm
    all_genres: list[str] = []
    seen: set[str] = set()

    def _add(genre_list):
        for g in genre_list:
            if g.lower() not in seen:
                seen.add(g.lower())
                all_genres.append(g)

    _add(mb.get("mb_genres", []))
    _add(spotify.get("genres", []))
    _add(lastfm)

    if all_genres:
        merged["genres"] = all_genres
    elif "genres" in merged and not merged["genres"]:
        del merged["genres"]

    return merged


# Per file enchrichment

async def enrich_file(
    filepath: str,
    spotify_track_id: Optional[str] = None,
    isrc: Optional[str] = None,
    ytmusic_video_id: Optional[str] = None,
    config: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    config = config or {}
    fname = pathlib.Path(filepath).name
    lastfm_key: str = (
        config.get("spotify", {}).get("lastfmApiKey", "")
        or config.get("ytMusic", {}).get("lastfmApiKey", "")
        or config.get("lastfmApiKey", "")
    )

    yield f"data:   ↳ Enriching: {fname}\n\n"

    if not isrc:
        isrc = _read_isrc(filepath)

    # Read existing tags for text-based fallback lookups
    existing = _read_tags(filepath)
    artist = existing.get("artist", "")
    title = existing.get("title", "")

    loop = asyncio.get_event_loop()
    spotify_data: dict = {}
    mb_data: dict = {}
    lastfm_tags: list[str] = []
    yt_data: dict = {}

    # 1. Spotify
    if spotify_track_id or isrc:
        def _run_spotify():
            token = _get_spotify_token()
            if not token:
                return {}
            tid = spotify_track_id
            if not tid and isrc:
                tid = _spotify_track_id_from_isrc(isrc, token)
            if not tid:
                return {}
            return _fetch_spotify_enrichment(tid, token)

        spotify_data = await loop.run_in_executor(None, _run_spotify)

        # Prefer Spotify's canonical artist/title for downstream text searches
        if spotify_data.get("_track_name"):
            title = spotify_data["_track_name"]
        if spotify_data.get("_artist_name"):
            artist = spotify_data["_artist_name"]

        if spotify_data:
            parts = []
            if spotify_data.get("genres"):
                parts.append(f"genres: {', '.join(spotify_data['genres'][:3])}")
            if spotify_data.get("label"):
                parts.append(f"label: {spotify_data['label']}")
            if parts:
                yield f"data:     Spotify: {' · '.join(parts)}\n\n"

    # 2. MusicBrainz
    # Always use ISRC first, then fallback to search if not found (missing, or yt music track)
    if isrc:
        mb_data = await loop.run_in_executor(None, _musicbrainz_by_isrc, isrc)

    if not mb_data.get("mb_genres") and artist and title:
        mb_text = await loop.run_in_executor(None, _musicbrainz_by_text, artist, title)
        if mb_text.get("mb_genres"):
            mb_data["mb_genres"] = mb_text["mb_genres"]
        if mb_text.get("mb_label") and not mb_data.get("mb_label"):
            mb_data["mb_label"] = mb_text["mb_label"]

    if mb_data.get("mb_genres"):
        yield f"data:     MusicBrainz: {', '.join(mb_data['mb_genres'][:4])}\n\n"
    else:
        yield f"data:     MusicBrainz: no genre tags found\n\n"

    # 3. Optionally use Last.fm
    if lastfm_key and artist and title:
        lastfm_tags = await loop.run_in_executor(
            None, _lastfm_track_tags, artist, title, lastfm_key
        )
        if lastfm_tags:
            yield f"data:     Last.fm: {', '.join(lastfm_tags[:4])}\n\n"

    # 4. Youtube music
    # ytmusic_video_id=None means not a Yt track, skip
    # ytmusic_video_id="" means Yt track but ID unknown, still try via search
    if ytmusic_video_id is not None:
        def _run_yt():
            return _ytmusic_enrichment(ytmusic_video_id, artist, title)
        yt_data = await loop.run_in_executor(None, _run_yt)
        if yt_data.get("cover_url"):
            yield f"data:     YouTube Music: square cover art fetched\n\n"
        else:
            yield f"data:     YouTube Music: no square cover art found\n\n"

    # Merge and write
    final_tags = _merge_enrichment(spotify_data, mb_data, lastfm_tags)

    # For YT Music files use square Yt music cover art instead of yt-dlp's 16:9 thumbnail
    if yt_data.get("cover_url") and not final_tags.get("cover_url"):
        final_tags["cover_url"] = yt_data["cover_url"]

    has_something = any(
        final_tags.get(k) for k in ("genres", "label", "copyright", "cover_url")
    )
    if not has_something:
        yield f"data:     ⚠️  Nothing to write\n\n"
        return

    cover_bytes: Optional[bytes] = None
    if final_tags.get("cover_url"):
        cover_bytes = await loop.run_in_executor(None, _fetch_cover, final_tags["cover_url"])

    ok = await loop.run_in_executor(None, _write_tags, filepath, final_tags, cover_bytes)

    if ok:
        written = []
        if final_tags.get("genres"):
            written.append(f"genre: {'; '.join(final_tags['genres'][:2])}")
        if final_tags.get("label"):
            written.append(f"label: {final_tags['label']}")
        if cover_bytes:
            written.append("cover updated")
        yield f"data:     ✓ {', '.join(written) if written else 'tags written'}\n\n"
    else:
        yield f"data:     ⚠️  Failed to write tags to {fname}\n\n"


# Directory enrichment

async def enrich_directory(
    output_dir: str,
    spotify_url: Optional[str] = None,
    config: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    config = config or {}
    output_path = pathlib.Path(output_dir)
    audio_extensions = {".flac", ".mp3", ".m4a", ".aac", ".opus", ".ogg"}

    all_files = [
        f for f in output_path.rglob("*")
        if f.is_file() and f.suffix.lower() in audio_extensions
    ]
    if not all_files:
        yield "data:   No audio files found for enrichment.\n\n"
        return

    # Build ISRC to Spotify track ID map
    isrc_to_track_id: dict[str, str] = {}
    if spotify_url:
        yield "data:   Building ISRC → Spotify track ID map...\n\n"
        loop = asyncio.get_event_loop()

        def _build_map():
            try:
                from SpotiFLAC.getMetadata import get_filtered_data, parse_uri
                uri_info = parse_uri(spotify_url)
                data = get_filtered_data(spotify_url)
                if "error" in data:
                    return {}
                mapping: dict[str, str] = {}
                if uri_info.get("type") == "track":
                    t = data.get("track", data)
                    isrc = t.get("isrc") or t.get("external_ids", {}).get("isrc", "")
                    ext_url = t.get("external_urls", "")
                    if isinstance(ext_url, dict):
                        ext_url = ext_url.get("spotify", "")
                    tid = ext_url.split("/")[-1] if ext_url else ""
                    if isrc and tid:
                        mapping[isrc] = tid
                else:
                    for t in data.get("track_list", []):
                        isrc = t.get("isrc", "")
                        ext_url = t.get("external_urls", "")
                        if isinstance(ext_url, dict):
                            ext_url = ext_url.get("spotify", "")
                        tid = ext_url.split("/")[-1] if ext_url else ""
                        if isrc and tid:
                            mapping[isrc] = tid
                return mapping
            except Exception:
                return {}

        isrc_to_track_id = await loop.run_in_executor(None, _build_map)
        if isrc_to_track_id:
            yield f"data:   Mapped {len(isrc_to_track_id)} track(s).\n\n"

    # Scope to files from this download only
    if isrc_to_track_id:
        # Only process files whose ISRC is in our map
        scoped = [f for f in all_files
                  if _read_isrc(str(f)) in isrc_to_track_id]
        # Safety fallback: if ISRC matching found nothing (e.g. ISRC wasn't embedded),
        # process all files in the directory
        audio_files = scoped if scoped else all_files
    else:
        audio_files = all_files

    yield f"data: 🏷️  Enriching metadata for {len(audio_files)} file(s)...\n\n"

    succeeded = 0
    failed = 0
    for audio_file in sorted(audio_files):
        try:
            isrc = _read_isrc(str(audio_file))
            spotify_track_id = isrc_to_track_id.get(isrc) if isrc else None
            async for chunk in enrich_file(
                filepath=str(audio_file),
                spotify_track_id=spotify_track_id,
                isrc=isrc,
                config=config,
            ):
                yield chunk
            succeeded += 1
        except Exception as exc:
            yield f"data:   ⚠️  Enrichment error for {audio_file.name}: {exc}\n\n"
            failed += 1

    yield "data: \n\n"
    yield f"data: 🏷️  Metadata enrichment complete: {succeeded} succeeded, {failed} failed.\n\n"


# Yt music per-file enrichment

async def enrich_ytmusic_file(
    filepath: str,
    ytmusic_url: Optional[str] = None,
    config: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    video_id: Optional[str] = None

    if ytmusic_url:
        m = re.search(r"[?&]v=([A-Za-z0-9_-]{11})", ytmusic_url)
        if m:
            video_id = m.group(1)

    if not video_id:
        video_id = _extract_ytmusic_video_id(filepath)

    # Pass video_id="" (not None) to signal this IS a Yt track, ID is just unknown
    # so enrich_file activates the YTMusic cover art path
    async for chunk in enrich_file(
        filepath=filepath,
        ytmusic_video_id=video_id if video_id is not None else "",
        config=config,
    ):
        yield chunk