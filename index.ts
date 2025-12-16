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
import { handlePostErrors } from "./src/errors";
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

serve({
  port: 3000,
  idleTimeout: 40, // Allow long polling requests (30s timeout) with buffer
  fetch: async (req: Request, server) => {
    // All requests are handled by routes
    return new Response(null, { status: 404 });
  },
  routes: {
    // Management routes
    "/api/kiosk": {
      GET: (req: Request, server) => handleGetKiosk(req, server, isKioskMode),
    },
    "/api/config/version": {
      GET: (req: Request, server) => handleGetConfigVersion(req, server),
    },
    "/api/hotkeys": {
      GET: handleGetHotkeys,
      POST: handlePostHotkeys,
    },
    "/api/theme": {
      GET: handleGetTheme,
      POST: handlePostTheme,
    },
    "/api/view": {
      GET: handleGetView,
      POST: handlePostView,
    },
    "/api/stats": {
      GET: handleGetStats,
    },
    // Librespot routes
    "/api/events": {
      GET: handleGetEvents,
    },
    "/status": {
      GET: handleGetStatus,
    },
    "/player/playpause": {
      POST: handlePostPlayPause,
    },
    "/player/next": {
      POST: handlePostNext,
    },
    "/player/prev": {
      POST: handlePostPrev,
    },
    "/player/volume": {
      POST: handlePostVolume,
    },
    "/player/seek": {
      POST: handlePostSeek,
    },
    "/player/repeat_context": {
      POST: handlePostRepeatContext,
    },
    "/player/repeat_track": {
      POST: handlePostRepeatTrack,
    },
    "/player/shuffle_context": {
      POST: handlePostShuffleContext,
    },
    "/player/add_to_queue": {
      POST: handlePostAddToQueue,
    },
    // Spotify routes
    "/api/spotify/tracks/:id": {
      GET: handleGetTrack,
    },
    "/api/spotify/albums/:id/tracks": {
      GET: handleGetAlbumTracks,
    },
    "/api/spotify/playlists/:id/tracks": {
      GET: handleGetPlaylistTracks,
    },
    "/api/spotify/artists/:id/top-tracks": {
      GET: handleGetArtistTopTracks,
    },
    "/api/spotify/metadata/:id": {
      GET: handleGetMetadata,
    },
    "/api/spotify/ids": {
      GET: handleGetSpotifyIds,
      POST: handlePostSpotifyIds,
    },
    "/api/spotify/recent-artists": {
      GET: handleGetRecentArtists,
      POST: handlePostRecentArtists,
      DELETE: handleDeleteRecentArtists,
    },
    "/api/spotify/search": {
      GET: handleGetSearch,
    },
    "/api/spotify/config": {
      POST: handlePostSpotifyConfig,
    },
    "/api/spotify/recent-artists-limit": {
      GET: handleGetRecentArtistsLimit,
      POST: handlePostRecentArtistsLimit,
    },
    "/api/image/:base64EncodedImageUrl": {
      GET: handleGetImage,
    },
    // Error routes
    "/api/errors": {
      POST: handlePostErrors,
    },
    // HTML routes
    "/manage": manageHtml,
    "/": indexHtml,
    "/app": appHtml,
  },
  development: true,
});