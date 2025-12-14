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
    
    // Handle metadata requests (dynamic route)
    if (url.pathname.startsWith('/api/spotify/metadata/')) {
      const metadataResponse = await handleMetadataRequest(req);
      if (metadataResponse) {
        return metadataResponse;
      }
    }
    
    // Trace HTTP requests (routes will handle the actual response)
    if (url.pathname !== "/" && url.pathname !== "/manage" && !url.pathname.startsWith("/cache/")) {
      const traceContext = traceApiStart(req.method, url.pathname, 'inbound');
      // Note: We can't easily trace the response here since routes handle it
      // But we at least trace the incoming request
    }
    
    // For all other requests, return a response that will be handled by routes
    // We need to return something, but routes will handle it
    return new Response(null, { status: 404 });
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
