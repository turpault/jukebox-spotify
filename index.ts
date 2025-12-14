import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import { createManagementRoutes } from "./src/management";
import { createSpotifyRoutes } from "./src/spotify";
import { createLibrespotRoutes, createLibrespotWebSocket } from "./src/librespot";

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
      // Upgrade will be handled by the websocket handler
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined as any; // Return undefined to indicate upgrade
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    
    // Let routes handle other requests - return undefined to fall through to routes
    return undefined as any;
  },
  websocket: createLibrespotWebSocket(),
  routes: {
    ...createManagementRoutes(isKioskMode),
    ...createSpotifyRoutes(),
    ...createLibrespotRoutes(),
    "/manage": manageHtml,
    "/": indexHtml,    
  },
  development: true,
});
