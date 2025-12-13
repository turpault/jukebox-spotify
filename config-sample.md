# Configuration Sample

This application connects to a local go-librespot instance running on port 3678.

No configuration file is required. The application will automatically connect to `http://localhost:3678` for the REST API and `ws://localhost:3678/events` for WebSocket events.

## Requirements

- go-librespot must be running and accessible on `http://localhost:3678`
- The go-librespot instance should be properly configured with your Spotify credentials

