# Dromeport

A self-hosted music downloader built with [Navidrome](https://www.navidrome.org/) in mind. It wraps yt-dlp and SpotiFLAC-CLI into a clean web UI.

> Dromeport is in beta. If you run into any bugs / issues, please report them at [github.com/sensor0x0/Dromeport/issues](https://github.com/sensor0x0/Dromeport/issues).

---

## Features

- Download tracks / playlists from Spotify (lossless quality FLAC) and YouTube Music (high quality lossy)
- Auto-sync playlists using a task scheduler
- Designed to write directly into your Navidrome music library
- Live download progress, queue, and logs

<details>
<summary>Roadmap (click to expand)</summary>

- [ ] Implement a search feature, so the user doesn't need to directly input a URL.
- [ ] Fallback to using yt-dlp if SpotiFLAC fails, and vice versa.
- [ ] Trigger a Navidrome rescan after finishing playlist / song download. [Subsonic API reference](https://www.navidrome.org/docs/developers/subsonic-api/)
</details>

---

## Screenshots

Check out the interface in [docs/screenshots](docs/screenshots/).

---

## Setup

For setup instructions when using Docker, see [INSTALL.MD](docs/INSTALL.md).

For running Dromeport without Docker, see [NON_DOCKER.md](docs/NON_DOCKER.md).

---

## Adding a library

Adding a library is simple. They are defined by the `DROMEPORT_LIBRARY_*` variable in your compose file's environment variables. Each one maps a container's path to a display name shown.

To add a new library, edit your `docker-compose.yml` file's environment variables.

Each new library is formatted as so: `- DROMEPORT_LIBRARY_*=/library_path|Library Display Name`
with `*` being the number 1 higher than the last library.

Example compose file:
```yaml
dromeport:
  image: ghcr.io/sensor0x0/dromeport:latest
  user: 1000:1000
  ports:
    - "8080:8080"
  restart: unless-stopped
  volumes:
    - "/path/to/Music:/music"
  environment:
    - DROMEPORT_LIBRARY_1=/music|My Music Library

    # Add more libraries like this:
    - DROMEPORT_LIBRARY_2=/library_path|Library Display Name
```

Per new library you add, you must `+1` to the `*` in `DROMEPORT_LIBRARY_*` otherwise your library will not show.

---

## Issues and Improvements

Dromeport is currently in beta. If something breaks or doesn't work as expected, or you would just like to request an improvement, please open an issue at [github.com/sensor0x0/Dromeport/issues](https://github.com/sensor0x0/Dromeport/issues).

---

## Small note

Some parts of this project were generated with AI (sorry purists, haha), but I’ve reviewed it and fully understand all of its output.

---

## License

GNU Affero General Public License v3.0