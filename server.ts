import { serve } from "bun";
import { readFile, writeFile } from "fs/promises";

// go-librespot API base URL
const LIBRESPOT_API_URL = "http://localhost:3678";

// Theme storage file
const THEME_FILE = ".theme.json";

// Available themes
const AVAILABLE_THEMES = ["steampunk", "matrix"];

async function getTheme(): Promise<string> {
  try {
    const data = await readFile(THEME_FILE, "utf-8");
    const theme = JSON.parse(data);
    return theme.name || "steampunk";
  } catch (error) {
    // Default theme if file doesn't exist
    return "steampunk";
  }
}

async function setTheme(themeName: string): Promise<boolean> {
  if (!AVAILABLE_THEMES.includes(themeName)) {
    return false;
  }
  try {
    await writeFile(THEME_FILE, JSON.stringify({ name: themeName }, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save theme:", error);
    return false;
  }
}

// Build frontend
const buildResult = await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './public/build',
  minify: false,
  naming: "[name].js",
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
}

console.log(`Server starting on http://localhost:3000`);

serve({
  port: 3000,
  routes: {
    // Theme API routes
    "/api/theme": {
      GET: async () => {
        const timestamp = new Date().toISOString();
        console.log(`[Theme API] [${timestamp}] GET /api/theme`);
        try {
          const themeName = await getTheme();
          console.log(`[Theme API] [${timestamp}] GET /api/theme - Current theme: ${themeName}`);
          return Response.json({ theme: themeName });
        } catch (error) {
          console.error(`[Theme API] [${timestamp}] GET /api/theme - ERROR:`, error);
          return Response.json({ error: "Failed to get theme" }, { status: 500 });
        }
      },
      POST: async (req) => {
        const timestamp = new Date().toISOString();
        console.log(`[Theme API] [${timestamp}] POST /api/theme`);
        try {
          const body = await req.json() as { theme?: string };
          const themeName = body.theme;
          
          if (!themeName) {
            return Response.json({ error: "Theme name is required" }, { status: 400 });
          }
          
          const success = await setTheme(themeName);
          if (success) {
            console.log(`[Theme API] [${timestamp}] POST /api/theme - Theme set to: ${themeName}`);
            return Response.json({ theme: themeName });
          } else {
            return Response.json({ error: "Invalid theme name" }, { status: 400 });
          }
        } catch (error) {
          console.error(`[Theme API] [${timestamp}] POST /api/theme - ERROR:`, error);
          return Response.json({ error: "Failed to set theme" }, { status: 500 });
        }
      },
    },

    // Proxy API requests to go-librespot
    "/api/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace("/api", "");
      const targetUrl = `${LIBRESPOT_API_URL}${path}${url.search}`;
      const timestamp = new Date().toISOString();
      const method = req.method;
      
      // Read request body if present
      let requestBody: string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        requestBody = await req.text();
      }
      
      console.log(`[Server Proxy] [${timestamp}] ${method} ${path}${url.search}`);
      if (requestBody) {
        console.log(`[Server Proxy] Request body:`, requestBody);
      }
      
      try {
        const startTime = Date.now();
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        });
        
        const duration = Date.now() - startTime;
        const data = await response.text();
        
        console.log(`[Server Proxy] [${timestamp}] ${method} ${path} - ${response.status} ${response.statusText} (${duration}ms)`);
        
        // Log response body (truncate if too long)
        if (data) {
          const preview = data.length > 500 ? data.substring(0, 500) + '...' : data;
          console.log(`[Server Proxy] Response body:`, preview);
        }
        
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
          },
        });
      } catch (error) {
        console.error(`[Server Proxy] [${timestamp}] ${method} ${path} - ERROR:`, error);
        return Response.json({ error: "Failed to connect to go-librespot" }, { status: 503 });
      }
    },

    // Serve bundled JS
    "/index.js": async () => {
      const buildFile = Bun.file("./public/build/index.js");
      // Rebuild on request to ensure latest changes
      const rebuild = await Bun.build({
        entrypoints: ['./src/index.tsx'],
        outdir: './public/build',
        naming: "[name].js",
      });
      if (rebuild.success) {
        return new Response(buildFile);
      }
      return new Response("Build failed", { status: 500 });
    },

    // SPA Fallback (Serve index.html for all other routes)
    "/*": () => {
      return new Response(Bun.file("./public/index.html"), {
        headers: { "Content-Type": "text/html" }
      });
    }
  },
});
