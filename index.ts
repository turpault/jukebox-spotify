import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import { createManagementRoutes } from "./src/management";
import { createSpotifyRoutes, handleMetadataRequest } from "./src/spotify";
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
    
    // Handle metadata requests (dynamic route) - must be checked before routes
    // since routes don't support dynamic path segments
    if (url.pathname.startsWith('/api/spotify/metadata/')) {
      console.log('[index.ts] Handling metadata request for:', url.pathname);
      const metadataResponse = await handleMetadataRequest(req);
      return metadataResponse;
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
  },
  development: true,
});
