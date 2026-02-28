# Docker setup

### 1. Add Dromeport to Navidrome's `docker-compose.yml`

Add the `dromeport` service to your Navidrome instance's compose file.
Make sure your volume paths are the same as used by Navidrome, but without using `:ro` so that Dromeport can write to them.

Example of a `docker-compose.yml`:
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

  # Add the service below
  dromeport:
    image: ghcr.io/sensor0x0/dromeport:latest
    user: 1000:1000
    ports:
      - "8080:8080"
    restart: unless-stopped
    volumes:
      - "/path/to/Music:/music" # same path, but writable (removed :ro)
    environment:
      - DROMEPORT_LIBRARY_1=/music|My Music
      # Add more libraries like this:
      # - DROMEPORT_LIBRARY_2=/another_library|Another Library
```

### 2. Start the frontend and backend
```bash
$ docker compose up -d
```

### 3. Open the web app

Go to **http://localhost:8080**. You are done and setup!

### 4. Exposing to the web (optional)

If you decide to expose Dromeport to the web via a domain or public IP for easy access away from your server, I strongly recommend using Caddy as a reverse proxy, which makes it easy to add password protection; important because Dromeport writes files to disk.