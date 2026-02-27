# Build Vite frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/dromeport

COPY dromeport/package.json dromeport/package-lock.json* ./
RUN npm ci

COPY dromeport/ ./
RUN npm run build


# Python backend and bundled tools
FROM python:3.12-slim

# git - initial SpotiFLAC clone + in-container updates
# ffmpeg - transcoding (Opus / MP3)
# stdbuf - line-buffered output
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        git \
        coreutils \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp
# pip-installed so "pip install -U yt-dlp" updates it inside the running
# container with no image rebuild needed.
RUN pip install --no-cache-dir yt-dlp

# SpotiFLAC-CLI
# Clone the repo, then install its dependencies as declared in pyproject.toml.
# No requirements.txt, deps are: requests, mutagen, pyotp.
# "git pull" inside the running container is enough to update the tool itself.
RUN git clone --depth 1 \
        https://github.com/jelte1/SpotiFLAC-Command-Line-Interface \
        /opt/spotiflac \
    && pip install --no-cache-dir \
        "requests~=2.32.3" \
        "mutagen~=1.47.0" \
        "pyotp~=2.9.0"

ENV SPOTIFLAC_PATH=/opt/spotiflac/launcher.py

# Backend
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

COPY --from=frontend-build /app/dromeport/dist ./static

RUN useradd -m -u 1000 dromeport \
    && chown -R dromeport:dromeport /opt/spotiflac \
    && chown -R dromeport:dromeport /app
USER dromeport

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]