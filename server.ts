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
  tokens?: {
    refreshToken?: string;
  };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
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

let spotifyAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function refreshSpotifyToken() {
  if (spotifyAccessToken && Date.now() < tokenExpiresAt) {
    return spotifyAccessToken;
  }

  if (!config.tokens?.refreshToken) {
    console.log("No refresh token found. Please visit http://localhost:3000/auth/login to authenticate.");
    return null;
  }

  console.log("Refreshing Spotify token...");

  const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.tokens.refreshToken
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token Refresh Error: ${response.status} - ${errorText}`);
      if (response.status === 400 || response.status === 401) {
        console.log("Refresh token might be invalid. Please re-authenticate at http://localhost:3000/auth/login");
      }
      return null;
    }

    const data = await response.json() as TokenResponse;
    spotifyAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;

    // Update refresh token if a new one is returned
    if (data.refresh_token) {
      config.tokens.refreshToken = data.refresh_token;
      await saveConfig();
    }

    console.log("Spotify token refreshed successfully.");
    return spotifyAccessToken;
  } catch (error) {
    console.error("Error refreshing Spotify token:", error);
    return null;
  }
}

async function saveConfig() {
  await writeFile("config.json", JSON.stringify(config, null, 4));
}

// Initial attempt
await refreshSpotifyToken();

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
      const token = await refreshSpotifyToken();
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
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: config.spotify.redirectUri
        })
      });

      if (!response.ok) {
        return new Response(await response.text(), { status: 500 });
      }

      const data = await response.json() as TokenResponse;

      // Save tokens
      config.tokens = config.tokens || {};
      config.tokens.refreshToken = data.refresh_token;
      spotifyAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;

      await saveConfig();

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
