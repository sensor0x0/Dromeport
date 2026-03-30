import pathlib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sync import SyncManager
from config import router as config_router
from tools import router as tools_router
from download import router as download_router, get_active_jobs
from search import router as search_router
from sync_api import setup_sync_routes


sync_manager = SyncManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    sync_manager.start()
    yield
    sync_manager.stop()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(tools_router)
app.include_router(download_router)
app.include_router(search_router)

sync_router = setup_sync_routes(sync_manager)
app.include_router(sync_router)


_static_dir = pathlib.Path(__file__).parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)