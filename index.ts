import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import { createManagementRoutes } from "./src/management";
import { createSpotifyRoutes, handleMetadataRequest, handleTrackRequest, handleAlbumTracksRequest, handlePlaylistTracksRequest, handleArtistTopTracksRequest } from "./src/spotify";
import { createLibrespotRoutes, createLibrespotWebSocket } from "./src/librespot";
import { traceApiStart, traceApiEnd, traceWebSocketConnection } from "./src/tracing";

// Launch Chrome in kiosk mode if enabled
if (isKioskMode) {
  // Wait a moment for server to start, then launch Chrome
  setTimeout(() => {
    launchChromeKiosk();
  }, 1000);
}

const server = serve({
  port: 3000,
  fetch: async (req: Request) => {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade for /api/ws
    if (url.pathname === "/api/ws" && req.headers.get("upgrade") === "websocket") {
      traceWebSocketConnection('open', 'inbound', { path: url.pathname });
      const upgraded = server.upgrade(req);
      if (upgraded) {
        // Return a response to indicate successful upgrade
        return new Response(null, { status: 101, statusText: "Switching Protocols" });
      }
      traceWebSocketConnection('error', 'inbound', { error: "WebSocket upgrade failed" });
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    
    // Handle dynamic Spotify API routes - must be checked before routes
    // since routes don't support dynamic path segments
    if (url.pathname.startsWith('/api/spotify/metadata/')) {
      const metadataResponse = await handleMetadataRequest(req);
      return metadataResponse;
    }
    
    if (url.pathname.startsWith('/api/spotify/tracks/')) {
      const trackResponse = await handleTrackRequest(req);
      if (trackResponse) return trackResponse;
    }
    
    if (url.pathname.match(/^\/api\/spotify\/albums\/[^\/]+\/tracks$/)) {
      const albumTracksResponse = await handleAlbumTracksRequest(req);
      if (albumTracksResponse) return albumTracksResponse;
    }
    
    if (url.pathname.match(/^\/api\/spotify\/playlists\/[^\/]+\/tracks$/)) {
      const playlistTracksResponse = await handlePlaylistTracksRequest(req);
      if (playlistTracksResponse) return playlistTracksResponse;
    }
    
    if (url.pathname.match(/^\/api\/spotify\/artists\/[^\/]+\/top-tracks$/)) {
      const artistTracksResponse = await handleArtistTopTracksRequest(req);
      if (artistTracksResponse) return artistTracksResponse;
    }
    
    // For all other requests, Bun will check the routes object
    // We return undefined to let Bun process routes
    return undefined as any;
  },
  websocket: createLibrespotWebSocket(),
  routes: {
    ...createManagementRoutes(isKioskMode),
    ...createSpotifyRoutes(),
    ...createLibrespotRoutes(),
    "/manage": manageHtml,
    "/": indexHtml,
    // Serve bundled client code for iOS 9 compatibility
    "/dist/index.js": async () => {
      try {
        const file = Bun.file("./public/dist/index.js");
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": "application/javascript",
            },
          });
        }
      } catch (e) {
        // Bundle doesn't exist, fall through
      }
      return new Response("Bundle not found. Run 'bun run build:client' first.", { status: 404 });
    },
  },
  development: true,
});
