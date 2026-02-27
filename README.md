# Dromeport

A self-hosted music downloader built with [Navidrome](https://www.navidrome.org/) (and any other music server) in mind. Wraps **yt-dlp** and **SpotiFLAC-CLI** into a clean web UI, both tools are bundled in the Docker image, so there is nothing to install manually.

---

## Features

- Download tracks and playlists from **YouTube Music** via yt-dlp
- Download lossless FLAC from **Spotify** via SpotiFLAC (no account / subscription required!)
- Update yt-dlp and SpotiFLAC from inside the UI, no image rebuild needed
- Designed to sit alongside Navidrome and write directly into your music library
- Live download log, per-download progress, queue management

---

## Quick Start (Docker)

### 1. Add Dromeport to Navidrome's `docker-compose.yml`

Append the `dromeport` service to your existing file. Your volume paths must match the ones already used by Navidrome, but **without** the `:ro` flag so Dromeport can write to them.

```yaml
services:
  navidrome:
    image: deluan/navidrome:latest
    user: 1000:1000
    ports:
      - "4533:4533"
    restart: unless-stopped
    volumes:
      - "/path/to/navidrome-data:/data"
      - "/path/to/Music:/music:ro"

  dromeport:
    image: ghcr.io/sensor0x0/dromeport:latest
    ports:
      - "8080:8080"
    restart: unless-stopped
    volumes:
      - "/path/to/Music:/music"        # same host path, writable
    environment:
      - DROMEPORT_LIBRARY_1=/music|My Music
      # Add more libraries as needed:
      # - DROMEPORT_LIBRARY_2=/another_library|Another Library
```

### 2. Start the stack

```bash
docker compose up -d
```

### 3. Open the web UI

Navigate to **http://localhost:8080** (or your server's IP).

---

## Configuration

All configuration is done in the web UI under the **Configuration** tab. Changes save automatically.

### Libraries

Libraries are defined by `DROMEPORT_LIBRARY_*` environment variables in your `docker-compose.yml`. Each one maps a container path to a display name shown in the UI.

```
DROMEPORT_LIBRARY_1=/music|My Music
DROMEPORT_LIBRARY_2=/john_music|John's Music
```

You can rename libraries from within the UI without editing the compose file, the container path is always fixed to what you mounted.

> **Can't see your library?** Make sure the `DROMEPORT_LIBRARY_*` variable points to the exact container path you mounted in `volumes:`, then restart the container.

### Spotify / SpotiFLAC

SpotiFLAC-CLI is pre-installed and doesn't require an account, subscription, or API key.

### YouTube Music

yt-dlp is pre-installed and works out of the box. No account or API key required.

---

## Updating yt-dlp and SpotiFLAC

Go to **Configuration - Bundled Tools** and click **Update All**. Live output streams in the UI. No container restart or image rebuild is needed.


---

## Adding a New Library

1. Add the host path to `volumes:` in `docker-compose.yml`
2. Add a matching `DROMEPORT_LIBRARY_*` environment variable
3. Restart the container: `docker compose up -d dromeport`

Example for adding a Podcasts library.

```yaml
volumes:
  - "/path/to/Podcasts:/podcasts"
environment:
  - DROMEPORT_LIBRARY_3=/podcasts|Podcasts
```

---

## Development / Setup without Docker (non-Navidrome use case)

### Prerequisites

- Python 3.10+
- Node.js 20+
- yt-dlp (`pip install yt-dlp`)
- ffmpeg
- SpotiFLAC-CLI (clone manually and set the path in Configuration)

### Backend

```bash
$ cd backend
$ python -m venv venv
$ source venv/bin/activate      # Windows: venv\Scripts\activate
$ pip install -r requirements.txt
$ python main.py
```

### Frontend

```bash
$ cd dromeport
$ npm install
$ npm run dev
```

The app is available at **http://localhost:5173**. API calls are proxied to the backend on port 8080.

---

## Ports

| Port | Service |
|------|---------|
| 4533 | Navidrome |
| 8080 | Dromeport |

---

## License

GNU Affero General Public License v3.0