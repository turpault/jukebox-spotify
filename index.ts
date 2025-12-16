import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import appHtml from "./public/app.html";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import {
  handleGetKiosk,
  handleGetConfigVersion,
  handleGetHotkeys,
  handlePostHotkeys,
  handleGetTheme,
  handlePostTheme,
  handleGetView,
  handlePostView,
  handleGetStats,
} from "./src/management";
import {
  startImageCacheCleanup,
  handleGetTrack,
  handleGetAlbumTracks,
  handleGetPlaylistTracks,
  handleGetArtistTopTracks,
  handleGetMetadata,
  handleGetSpotifyIds,
  handlePostSpotifyIds,
  handleGetRecentArtists,
  handlePostRecentArtists,
  handleDeleteRecentArtists,
  handleGetSearch,
  handlePostSpotifyConfig,
  handleGetRecentArtistsLimit,
  handlePostRecentArtistsLimit,
  handleGetImage,
} from "./src/spotify";
import {
  handleGetEvents,
  handleGetStatus,
  handlePostPlayPause,
  handlePostNext,
  handlePostPrev,
  handlePostVolume,
  handlePostSeek,
  handlePostRepeatContext,
  handlePostRepeatTrack,
  handlePostShuffleContext,
  handlePostAddToQueue,
} from "./src/librespot";
import { handlePostErrors, handlePostConsole } from "./src/errors";
import { librespotStateService } from "./src/librespot-state"; // Initialize state service

// Ensure go-librespot connection is established on server startup
console.log("Initializing go-librespot connection...");
librespotStateService.ensureConnected();

// Start periodic image cache cleanup
startImageCacheCleanup();

// Launch Chrome in kiosk mode if enabled
if (isKioskMode) {
  // Wait a moment for server to start, then launch Chrome
  setTimeout(() => {
    launchChromeKiosk();
  }, 1000);
}

function logRequest(request: Request, server) {
  const url = new URL(request.url);
  console.log("Request: " + request.method + " " + url.pathname + " Source IP Address: " + server.requestIP(request).address);
}

function wrapHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: Request, server) => {
    logRequest(request, server);
    return handler(request);
  }
}

serve({
  port: 3000,
  idleTimeout: 40, // Allow long polling requests (30s timeout) with buffer
  fetch: wrapHandler(async (request: Request) => new Response(null, { status: 404 })),
  routes: {
    // Management routes
    "/api/kiosk": {
      GET: wrapHandler(handleGetKiosk),
    },
    "/api/config/version": {
      GET: wrapHandler(handleGetConfigVersion),
    },
    "/api/hotkeys": {
      GET: wrapHandler(handleGetHotkeys),
      POST: wrapHandler(handlePostHotkeys),
    },
    "/api/theme": {
      GET: wrapHandler(handleGetTheme),
      POST: wrapHandler(handlePostTheme),
    },
    "/api/view": {
      GET: wrapHandler(handleGetView),
      POST: wrapHandler(handlePostView),
    },
    "/api/stats": {
      GET: wrapHandler(handleGetStats),
    },
    // Librespot routes
    "/api/events": {
      GET: wrapHandler(handleGetEvents),
    },
    "/status": {
      GET: wrapHandler(handleGetStatus),
    },
    "/player/playpause": {
      POST: wrapHandler(handlePostPlayPause),
    },
    "/player/next": {
      POST: wrapHandler(handlePostNext),
    },
    "/player/prev": {
      POST: wrapHandler(handlePostPrev),
    },
    "/player/volume": {
      POST: wrapHandler(handlePostVolume),
    },
    "/player/seek": {
      POST: wrapHandler(handlePostSeek),
    },
    "/player/repeat_context": {
      POST: wrapHandler(handlePostRepeatContext),
    },
    "/player/repeat_track": {
      POST: wrapHandler(handlePostRepeatTrack),
    },
    "/player/shuffle_context": {
      POST: wrapHandler(handlePostShuffleContext),
    },
    "/player/add_to_queue": {
      POST: wrapHandler(handlePostAddToQueue),
    },
    // Spotify routes
    "/api/spotify/tracks/:id": {
      GET: wrapHandler(handleGetTrack),
    },
    "/api/spotify/albums/:id/tracks": {
      GET: wrapHandler(handleGetAlbumTracks),
    },
    "/api/spotify/playlists/:id/tracks": {
      GET: wrapHandler(handleGetPlaylistTracks),
    },
    "/api/spotify/artists/:id/top-tracks": {
      GET: wrapHandler(handleGetArtistTopTracks),
    },
    "/api/spotify/metadata/:id": {
      GET: wrapHandler(handleGetMetadata),
    },
    "/api/spotify/ids": {
      GET: wrapHandler(handleGetSpotifyIds),
      POST: wrapHandler(handlePostSpotifyIds),
    },
    "/api/spotify/recent-artists": {
      GET: handleGetRecentArtists,
      POST: wrapHandler(handlePostRecentArtists),
      DELETE: handleDeleteRecentArtists,
    },
    "/api/spotify/search": {
      GET: wrapHandler(handleGetSearch),
    },
    "/api/spotify/config": {
      POST: wrapHandler(handlePostSpotifyConfig),
    },
    "/api/spotify/recent-artists-limit": {
      GET: wrapHandler(handleGetRecentArtistsLimit),
      POST: wrapHandler(handlePostRecentArtistsLimit),
    },
    "/api/image/:base64EncodedImageUrl": {
      GET: wrapHandler(handleGetImage),
    },
    // Error routes
    "/api/errors": {
      POST: wrapHandler(handlePostErrors),
    },
    // Console route
    "/api/console": {
      POST: wrapHandler(handlePostConsole),
    },
    // HTML routes
    "/manage": manageHtml,
    "/": indexHtml,
    "/app": appHtml,
  },
  development: true,
});