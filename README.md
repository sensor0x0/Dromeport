# Dromeport

A simple frontend downloader with many configurable features designed for Navidrome servers, but works great for general music downloading, which wraps both yt-dlp and SpotiFLAC-cli together into a clean web app. 

## Prerequisites

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [SpotiFLAC-CLI](github.com/jelte1/SpotiFLAC-Command-Line-Interface)
- [FFmpeg](https://www.ffmpeg.org/)
- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js](https://nodejs.org/en)

## Setup

### Docker

Coming soon. You will be able to simply append Dromeport to your existing Navidrome Docker compose file.

### Manual

```
$ git clone https://github.com/sensor0x0/Dromeport.git
$ cd Dromeport
```

### Backend

```
$ cd backend
$ python -m venv venv

# Linux (bash):
$ source venv/bin/activate

# Windows:
$ venv\Scripts\activate

$ pip install -r requirements.txt
$ python main.py
```

### Frontend

```
$ cd dromeport
$ npm install
$ npm run dev
```

### Finished!

The web app is now available at http://localhost:5173!

## Configuration

All configuration is done on the web app.