import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { serve } from "bun";
import { isKioskMode, launchChromeKiosk } from "./src/kiosk";
import { createManagementRoutes } from "./src/management";
import { createSpotifyRoutes } from "./src/spotify";
import { createLibrespotRoutes, createLibrespotWebSocket } from "./src/librespot";

// Load inlined HTML for /app route (dynamically to handle build-time generation)
function getInlinedHtml(): string | null {
  const appHtmlPath = join(process.cwd(), "public", "app.html");
  if (existsSync(appHtmlPath)) {
    return readFileSync(appHtmlPath, "utf-8");
  }
  return null;
}

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
      const upgraded = server.upgrade(req);
      if (upgraded) {
        // Return a response to indicate successful upgrade
        return new Response(null, { status: 101, statusText: "Switching Protocols" });
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    
    // Handle /app route with inlined HTML
    if (url.pathname === "/app") {
      const inlinedHtml = getInlinedHtml();
      if (inlinedHtml) {
        return new Response(inlinedHtml, {
          headers: { "Content-Type": "text/html" },
        });
      }
      // Fallback to regular HTML if inlined version not available
      return new Response(String(indexHtml), {
        headers: { "Content-Type": "text/html" },
      });
    }
    
    // For all other requests, return undefined to let routes handle it
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