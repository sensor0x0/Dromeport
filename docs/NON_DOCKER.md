# Non-docker setup

### Prerequisites

- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/en/download)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`pip install yt-dlp`)
- [ffmpeg](https://www.ffmpeg.org/)
- [SpotiFLAC-CLI](https://github.com/jelte1/SpotiFLAC-Command-Line-Interface) (clone manually and set the path in the Configuration tab)

### 1. Clone the repository
```bash
$ git clone https://github.com/sensor0x0/Dromeport.git
$ cd Dromeport
```

### 2. Setup the backend
```bash
$ cd backend
$ python -m venv venv

# Linux (bash)
$ source venv/bin/activate

# Linux (fish)
$ source venv/bin/activate.fish

# Windows
$ venv\Scripts\activate

$ pip install -r requirements.txt
$ python main.py
```

### 3. Setup the frontend
Go back to the project's root folder (`cd ..`) and run
```bash
$ cd dromeport
$ npm install
$ npm run dev
```
### Done!

Dromeport will then be available at **http://localhost:5173**! 