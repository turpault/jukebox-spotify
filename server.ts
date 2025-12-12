import { serve } from "bun";
import { writeFile } from "fs/promises";

// Load configuration
interface Config {
  spotify: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    connectDeviceName: string;
    username?: string;
    password?: string;
  };
}

let config: Config;
async function loadConfig() {
  try {
    config = await Bun.file("config.json").json();
  } catch (e) {
    console.error("Failed to load config.json.");
    process.exit(1);
  }
}
await loadConfig();

interface TokenFile {
  access_token: string;
  expires_at: number;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const tokenFile = await Bun.file(".spotify_token.json").json() as TokenFile;
    
    // Check if token is still valid (with 5 minute buffer)
    if (tokenFile.expires_at && Date.now() < tokenFile.expires_at - 300000) {
      return tokenFile.access_token;
    }
    
    // Token expired or missing
    return null;
  } catch (e) {
    // Token file doesn't exist or is invalid
    return null;
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
    // API: Get Token
    "/api/token": async () => {
      const token = await getAccessToken();
      if (!token) {
        return new Response(JSON.stringify({
          error: "Authentication required",
          authUrl: "/auth/login"
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        token,
        connectDeviceName: config.spotify.connectDeviceName
      }), {
        headers: { "Content-Type": "application/json" }
      });
    },

    // Auth: Login
    "/auth/login": () => {
      const scope = "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.spotify.clientId,
        scope: scope,
        redirect_uri: config.spotify.redirectUri,
      });
      return Response.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
    },

    // Auth: Callback
    "/auth/callback": async (req) => {
      // This endpoint is handled by Puppeteer renderer
      // Just redirect to home
      return Response.redirect("/");
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
