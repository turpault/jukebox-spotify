import { serve } from "bun";

// go-librespot API base URL
const LIBRESPOT_API_URL = "http://localhost:3678";

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
    // Proxy API requests to go-librespot
    "/api/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace("/api", "");
      const targetUrl = `${LIBRESPOT_API_URL}${path}${url.search}`;
      
      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
          },
          body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
        });
        
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to connect to go-librespot" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
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
