import os
from fastapi import APIRouter

router = APIRouter()


@router.get("/api/config")
async def get_config():
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

    return {"libraries": libraries}
