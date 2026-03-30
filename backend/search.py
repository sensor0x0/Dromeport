import asyncio
import logging
import urllib.parse
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/search")
async def search_tracks(query: str, provider: str, limit: int = 8):
    """Search for tracks, albums, and playlists on the given provider."""
    if not query.strip():
        return {"results": []}

    loop = asyncio.get_event_loop()

    if provider == "YouTube Music":
        return await loop.run_in_executor(None, _search_ytmusic, query.strip(), limit)
    elif provider == "Spotify":
        return await loop.run_in_executor(None, _search_spotify, query.strip(), limit)

    return {"results": []}


def _search_ytmusic(query: str, limit: int) -> dict:
    try:
        from ytmusicapi import YTMusic

        yt = YTMusic(language="en", location="US")
        results = []

        # Songs
        track_limit = max(limit - 2, 4)
        songs = yt.search(query, filter="songs", limit=track_limit) or []
        for hit in songs[:track_limit]:
            video_id = hit.get("videoId")
            if not video_id:
                continue
            title = hit.get("title", "Unknown")
            artists = hit.get("artists") or []
            artist = artists[0].get("name", "") if artists else ""
            thumbs = hit.get("thumbnails") or []
            thumb = thumbs[-1].get("url", "") if thumbs else ""
            results.append(
                {
                    "title": title,
                    "artist": artist,
                    "url": f"https://music.youtube.com/watch?v={video_id}",
                    "thumbnail": thumb,
                    "type": "track",
                }
            )

        # Playlists
        playlists = yt.search(query, filter="playlists", limit=3) or []
        for hit in playlists[:3]:
            playlist_id = hit.get("playlistId") or hit.get("browseId")
            if not playlist_id:
                continue
            title = hit.get("title", "Unknown")
            author = hit.get("author") or []
            if isinstance(author, list):
                artist = author[0].get("name", "") if author else ""
            elif isinstance(author, str):
                artist = author
            else:
                artist = ""
            thumbs = hit.get("thumbnails") or []
            thumb = thumbs[-1].get("url", "") if thumbs else ""
            results.append(
                {
                    "title": title,
                    "artist": artist,
                    "url": f"https://music.youtube.com/playlist?list={playlist_id}",
                    "thumbnail": thumb,
                    "type": "playlist",
                }
            )

        return {"results": results[:limit]}
    except Exception as exc:
        logger.error("YTMusic search failed: %s", exc, exc_info=True)
        return {"results": [], "error": str(exc)}


def _search_spotify(query: str, limit: int) -> dict:
    try:
        from metadata import _get_spotify_token, _spotify_get

        token = _get_spotify_token()
        if not token:
            return {
                "results": [],
                "error": "Spotify token unavailable — is SpotiFLAC installed and configured?",
            }

        encoded = urllib.parse.quote(query)
        track_limit = max(limit - 3, 4)
        data = _spotify_get(
            f"search?q={encoded}&type=track,album,playlist&limit={track_limit}",
            token,
        )
        if not data:
            return {"results": []}

        results = []

        # Tracks
        for item in data.get("tracks", {}).get("items") or []:
            if not item:
                continue
            artists = item.get("artists") or []
            artist = artists[0].get("name", "") if artists else ""
            images = item.get("album", {}).get("images") or []
            thumb = images[-1].get("url", "") if images else ""
            url = item.get("external_urls", {}).get("spotify", "")
            if not url:
                continue
            results.append(
                {
                    "title": item.get("name", "Unknown"),
                    "artist": artist,
                    "url": url,
                    "thumbnail": thumb,
                    "type": "track",
                }
            )

        # Albums
        for item in (data.get("albums", {}).get("items") or [])[:3]:
            if not item:
                continue
            artists = item.get("artists") or []
            artist = artists[0].get("name", "") if artists else ""
            images = item.get("images") or []
            thumb = images[-1].get("url", "") if images else ""
            url = item.get("external_urls", {}).get("spotify", "")
            if not url:
                continue
            results.append(
                {
                    "title": item.get("name", "Unknown"),
                    "artist": artist,
                    "url": url,
                    "thumbnail": thumb,
                    "type": "album",
                }
            )

        # Playlists
        for item in (data.get("playlists", {}).get("items") or [])[:3]:
            if not item:
                continue
            owner = item.get("owner") or {}
            artist = owner.get("display_name", "")
            images = item.get("images") or []
            thumb = images[-1].get("url", "") if images else ""
            url = item.get("external_urls", {}).get("spotify", "")
            if not url:
                continue
            results.append(
                {
                    "title": item.get("name", "Unknown"),
                    "artist": artist,
                    "url": url,
                    "thumbnail": thumb,
                    "type": "playlist",
                }
            )

        return {"results": results[:limit]}
    except Exception as exc:
        return {"results": [], "error": str(exc)}