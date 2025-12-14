# Jukebox

A web-based jukebox interface for controlling Spotify playback via go-librespot, featuring customizable themes, hotkeys, and a management console.

## Prerequisites

This project requires two main dependencies:

### 1. Bun

[Bun](https://bun.sh) is a fast all-in-one JavaScript runtime, bundler, and package manager.

**Installation:**

```bash
curl -fsSL https://bun.sh/install | bash
```

After installation, verify it's working:

```bash
bun --version
```

For more information, visit the [Bun installation guide](https://bun.sh/docs/installation).

### 2. go-librespot

[go-librespot](https://github.com/devgianlu/go-librespot) is an open-source Spotify Connect client that provides a REST API and WebSocket interface for controlling Spotify playback.

**Installation:**

1. **Install Go** (version 1.22 or higher):
   - Download from [go.dev](https://go.dev/dl/)

2. **Install required libraries:**

   **Debian/Ubuntu/Raspbian:**
   ```bash
   sudo apt-get install libogg-dev libvorbis-dev libflac-dev libasound2-dev
   ```

   **macOS:**
   ```bash
   brew install libogg libvorbis flac
   ```

3. **Clone and build go-librespot:**
   ```bash
   git clone https://github.com/devgianlu/go-librespot.git
   cd go-librespot
   go run ./cmd/daemon
   ```

   The daemon will run on `http://localhost:3678` by default.

For more detailed instructions, visit the [go-librespot GitHub repository](https://github.com/devgianlu/go-librespot).

## Installation

1. **Clone this repository:**
   ```bash
   git clone <repository-url>
   cd jukebox
   ```

2. **Install project dependencies:**
   ```bash
   bun install
   ```

3. **Configure Spotify credentials:**
   - Create a `config.json` file (see `config-sample.md` for reference)
   - Add your Spotify Client ID and Client Secret
   - You can get these from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## Running

**Development mode:**
```bash
bun run dev
```

**Production mode:**
```bash
bun start
```

The application will be available at `http://localhost:3000`.

## Features

- **Web-based UI** - Access from any device on your network
- **Real-time playback control** - Control Spotify playback via go-librespot
- **Customizable themes** - Steampunk and Matrix themes included
- **Configurable hotkeys** - Keyboard and gamepad support
- **Kiosk mode** - Full-screen mode for dedicated displays
- **Management console** - Configure settings at `/manage`
- **iOS home screen support** - Add to iOS home screen for app-like experience
- **Spotify integration** - Search and manage Spotify playlists, albums, and artists
- **Disk caching** - Cached Spotify metadata and artwork for faster loading

## Configuration

See `config-sample.md` for configuration options including:
- Spotify credentials
- Theme selection
- Hotkey configuration
- View modes (default/dash)
- Spotify ID management

## Kiosk Mode

To run in kiosk mode (full-screen, auto-launches Chrome):

```bash
KIOSK=1 bun start
```

## Management Console

Access the management interface at `http://localhost:3000/manage` to:
- Configure hotkeys (keyboard and gamepad)
- Change themes and views
- Manage Spotify IDs
- Search and add Spotify content
- Configure recent artists list

## License

MIT
