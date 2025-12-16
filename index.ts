import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import { createManagementRoutes } from "./src/management";
import { createSpotifyRoutes, startImageCacheCleanup } from "./src/spotify";
import { createLibrespotRoutes } from "./src/librespot";
import "./src/librespot-state"; // Initialize state service

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
  fetch: async (req: Request, server) => {
    // All requests are handled by routes
    return new Response(null, { status: 404 });
  },
  routes: {
    ...createManagementRoutes(isKioskMode),
    ...createSpotifyRoutes(),
    ...createLibrespotRoutes(),
    "/manage": manageHtml,
    "/": indexHtml,
  },
  development: true,
});