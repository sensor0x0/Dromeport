from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()


def setup_sync_routes(sync_manager):
    @router.get("/api/sync/playlists")
    async def list_sync_playlists():
        return sync_manager.list_playlists()

    @router.post("/api/sync/playlists")
    async def add_sync_playlist(data: dict):
        try:
            playlist = sync_manager.add_playlist(data)
            return playlist
        except (KeyError, ValueError) as e:
            raise HTTPException(status_code=422, detail=str(e))

    @router.put("/api/sync/playlists/{pid}")
    async def update_sync_playlist(pid: str, data: dict):
        result = sync_manager.update_playlist(pid, data)
        if result is None:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        return result

    @router.delete("/api/sync/playlists/{pid}")
    async def delete_sync_playlist(pid: str):
        if not sync_manager.delete_playlist(pid):
            raise HTTPException(status_code=404, detail="Playlist not found.")
        return {"status": "deleted"}

    @router.get("/api/sync/playlists/{pid}/run")
    async def run_sync_playlist(pid: str):
        playlist = sync_manager.get_playlist(pid)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        return StreamingResponse(
            sync_manager.run_sync_stream(pid),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
