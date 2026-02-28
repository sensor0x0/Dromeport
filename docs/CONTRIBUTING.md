# Contributing to Dromeport

Thanks for considering contributing! The community's help is key to improving open-source tools for everyone.

## Where to start

- Bug reports: If you find a bug, please [open an issue](https://github.com/sensor0x0/dromeport/issues) on GitHub. Please include your OS and steps to reproduce.

- Feature requests: If you have an idea for a new feature, please [open an issue](https://github.com/sensor0x0/dromeport/issues) with the **enhancement** label and explain it!

- Pull requests: If you want to fix a bug or add a new feature, feel free to open a pull request.

## Development setup

See [NON_DOCKER.md](./NON_DOCKER.md) for setup.

> Note: You should start the backend using `uvicorn main:app --reload --port 8080` instead of `python main.py` to allow hot reloads.

## How it works

Dromeport is seperated into a frontend UI and a backend API.

- Frontend is located in `dromeport/` and is built using Vite (React + TypeScript). It uses Shadcn/ui components and Tailwind for its interface. When it isn't ran in a container, it runs on port 5173 and proxies /api requests to the backend.

- Backend is located in `backend/` and is built with Python and FastAPI. It downloads audio using [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [SpotiFLAC-cli](https://github.com/jelte1/SpotiFLAC-Command-Line-Interface), and streams output line by line via server-sent-events (SSE). It embeds metadata from MusicBrainz and optionally Last.fm. It also manages scheduled playlist synchronisation. It runs on port 8080.

## PR guidelines

- Please keep backend dependencies minimal. If adding a new package, add it to `backend/requirements.txt`.

- Try to match the existing frontend design using Shadcn/ui components and Tailwindcss.

- Please test your code before submitting. For the frontend, this means running `npm run lint`.