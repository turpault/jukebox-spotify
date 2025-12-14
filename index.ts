import { readFile, writeFile, stat } from "fs/promises";
import { createHash } from "crypto";
import indexHtml from "./public/index.html";
import manageHtml from "./public/manage.html";
import { serve } from "bun";

// Configuration file
const CONFIG_FILE = "config.json";

interface Config {
  theme?: string;
  view?: string;
  hotkeys?: {
    keyboard?: {
      playPause?: string;
      next?: string;
      previous?: string;
      volumeUp?: string;
      volumeDown?: string;
      seekForward?: string;
      seekBackward?: string;
      shuffle?: string;
      repeat?: string;
    };
    gamepad?: {
      playPause?: number;
      next?: number;
      previous?: number;
      volumeUp?: number;
      volumeDown?: number;
      shuffle?: number;
      repeat?: number;
    };
    volumeStep?: number;
    seekStep?: number;
  };
  spotify?: {
    clientId?: string;
    clientSecret?: string;
    spotifyIds?: string[];
  };
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

// Get configuration version hash
async function getConfigVersion(): Promise<string> {
  try {
    const hash = createHash('md5');
    
    // Hash config file (which now contains theme, hotkeys, and spotify config)
    try {
      const configData = await readFile(CONFIG_FILE, "utf-8");
      hash.update(configData);
    } catch {
      // File doesn't exist, use default
      hash.update('{}');
    }
    
    return hash.digest('hex');
  } catch (error) {
    // Fallback to timestamp if hashing fails
    return Date.now().toString();
  }
}

async function getTheme(): Promise<string> {
  try {
    const config = await getConfig();
    return config.theme || "steampunk";
  } catch (error) {
    // Default theme if config doesn't exist
    return "steampunk";
  }
}

async function setTheme(themeName: string): Promise<void> {
  const config = await getConfig();
  config.theme = themeName;
  await setConfig(config);
}

async function getView(): Promise<string> {
  try {
    const config = await getConfig();
    return config.view || "default";
  } catch (error) {
    // Default view if config doesn't exist
    return "default";
  }
}

async function setView(viewName: string): Promise<void> {
  const config = await getConfig();
  config.view = viewName;
  await setConfig(config);
}

async function getHotkeys(): Promise<any> {
  try {
    const config = await getConfig();
    if (config.hotkeys) {
      return config.hotkeys;
    }
    // Return default hotkeys if not in config
    return {
      keyboard: {
        playPause: "Space",
        next: "ArrowRight",
        previous: "ArrowLeft",
        volumeUp: "ArrowUp",
        volumeDown: "ArrowDown",
        seekForward: "KeyF",
        seekBackward: "KeyB",
        shuffle: "KeyS",
        repeat: "KeyR"
      },
      gamepad: {
        playPause: 0,
        next: 1,
        previous: 2,
        volumeUp: 3,
        volumeDown: 4,
        shuffle: 5,
        repeat: 6
      },
      volumeStep: 5,
      seekStep: 10000
    };
  } catch (error) {
    // Return default hotkeys if config doesn't exist
    return {
      keyboard: {
        playPause: "Space",
        next: "ArrowRight",
        previous: "ArrowLeft",
        volumeUp: "ArrowUp",
        volumeDown: "ArrowDown",
        seekForward: "KeyF",
        seekBackward: "KeyB",
        shuffle: "KeyS",
        repeat: "KeyR"
      },
      gamepad: {
        playPause: 0,
        next: 1,
        previous: 2,
        volumeUp: 3,
        volumeDown: 4,
        shuffle: 5,
        repeat: 6
      },
      volumeStep: 5,
      seekStep: 10000
    };
  }
}

async function setHotkeys(hotkeys: any): Promise<void> {
  const config = await getConfig();
  config.hotkeys = hotkeys;
  await setConfig(config);
}

async function getConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function setConfig(config: Config): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get Spotify access token using client credentials flow
async function getSpotifyToken(): Promise<string | null> {
  // Check cache first
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now()) {
    return spotifyTokenCache.token;
  }

  const config = await getConfig();
  const clientId = config.spotify?.clientId;
  const clientSecret = config.spotify?.clientSecret;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in || 3600;
    
    // Cache token (expire 1 minute before actual expiry)
    spotifyTokenCache = {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    return token;
  } catch (error) {
    console.error('Failed to get Spotify token:', error);
    return null;
  }
}


const isKioskMode = process.env.KIOSK === "1" || process.env.KIOSK === "true";

// Function to check if Chrome is already running
async function isChromeRunning(): Promise<boolean> {
  const platform = process.platform;
  
  try {
    if (platform === "darwin") {
      // macOS: Check for Chrome processes
      const proc = Bun.spawn(["pgrep", "-f", "Google Chrome"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } else if (platform === "win32") {
      // Windows: Check for chrome.exe processes
      const proc = Bun.spawn(["tasklist", "/FI", "IMAGENAME eq chrome.exe"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) return false;
      const output = await new Response(proc.stdout).text();
      return output.includes("chrome.exe");
    } else {
      // Linux: Check for chrome/chromium processes
      const proc = Bun.spawn(["pgrep", "-f", "chrome|chromium"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    }
  } catch (error) {
    // If check fails, assume Chrome is not running to be safe
    return false;
  }
}

// Function to launch Chrome in kiosk mode
async function launchChromeKiosk() {
  // Check if Chrome is already running
  const chromeRunning = await isChromeRunning();
  if (chromeRunning) {
    console.log("Chrome is already running, skipping launch");
    return;
  }

  const url = "http://localhost:3000";
  const platform = process.platform;
  
  // Chrome kiosk mode flags
  const chromeFlags = [
    "--kiosk",
    `--app=${url}`,
    "--disable-infobars",
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--disable-restore-session-state",
    "--disable-features=TranslateUI",
    "--disable-pinch",
    "--overscroll-history-navigation=0",
    "--disable-extensions",
    "--disable-default-apps",
  ];

  try {
    let command: string;
    let args: string[];

    if (platform === "darwin") {
      // macOS
      command = "open";
      args = ["-a", "Google Chrome", "--args", ...chromeFlags];
    } else if (platform === "win32") {
      // Windows
      const chromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      ];
      
      // Try to find Chrome by checking if file exists
      let chromePath: string | undefined;
      for (const path of chromePaths) {
        try {
          const file = Bun.file(path);
          if (await file.exists()) {
            chromePath = path;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!chromePath) {
        // Fallback: try to find Chrome in PATH
        command = "chrome";
        args = chromeFlags;
      } else {
        command = chromePath;
        args = chromeFlags;
      }
    } else {
      // Linux - try common Chrome/Chromium commands
      command = "google-chrome"; // Default
      args = chromeFlags;
      
      // Common Linux Chrome/Chromium paths (will try in order when spawning)
      const chromePaths = [
        "google-chrome",
        "chromium-browser",
        "chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ];
      
      // Use first available (spawn will fail if not found, which is handled)
      command = chromePaths[0];
    }

    console.log(`Launching Chrome in kiosk mode: ${command} ${args.join(" ")}`);
    
    const child = Bun.spawn([command, ...args], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    
    child.unref(); // Allow parent process to exit independently
    
    // Give Chrome a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("Chrome launched in kiosk mode");
  } catch (error) {
    console.error("Failed to launch Chrome:", error);
    console.log("Please manually open Chrome and navigate to:", url);
  }
}

// Launch Chrome in kiosk mode if enabled
if (isKioskMode) {
  // Wait a moment for server to start, then launch Chrome
  setTimeout(() => {
    launchChromeKiosk();
  }, 1000);
}

serve({
  port: 3000,
  routes: {
    // Kiosk mode API
    "/api/kiosk": {
      GET: async () => {
        return Response.json({ kiosk: isKioskMode });
      },
    },
    // Hotkeys API
    "/api/hotkeys": {
      GET: async () => {
        try {
          const hotkeys = await getHotkeys();
          return Response.json(hotkeys);
        } catch (error) {
          return Response.json({ error: "Failed to get hotkeys" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as any;
          await setHotkeys(body);
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to set hotkeys" }, { status: 500 });
        }
      },
    },
    // Theme API routes
    "/api/theme": {
      GET: async () => {
        try {
          const themeName = await getTheme();
          return Response.json({ theme: themeName });
        } catch (error) {
          return Response.json({ error: "Failed to get theme" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { theme?: string };
          const themeName = body.theme;
          
          if (!themeName) {
            return Response.json({ error: "Theme name is required" }, { status: 400 });
          }
          
          await setTheme(themeName);
          return Response.json({ theme: themeName });
        } catch (error) {
          return Response.json({ error: "Failed to set theme" }, { status: 500 });
        }
      },
    },
    "/api/view": {
      GET: async () => {
        try {
          const viewName = await getView();
          return Response.json({ view: viewName });
        } catch (error) {
          return Response.json({ error: "Failed to get view" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { view?: string };
          const viewName = body.view;
          
          if (!viewName) {
            return Response.json({ error: "View name is required" }, { status: 400 });
          }
          
          await setView(viewName);
          return Response.json({ view: viewName });
        } catch (error) {
          return Response.json({ error: "Failed to set view" }, { status: 500 });
        }
      },
    },
    // Spotify token API
    "/api/spotify/token": {
      GET: async () => {
        try {
          const token = await getSpotifyToken();
          if (!token) {
            return Response.json({ error: "Failed to get Spotify token. Check client ID and secret." }, { status: 401 });
          }
          return Response.json({ token });
        } catch (error) {
          return Response.json({ error: "Failed to get Spotify token" }, { status: 500 });
        }
      },
    },
    // Spotify IDs API
    "/api/spotify/ids": {
      GET: async () => {
        try {
          const config = await getConfig();
          const spotifyIds = config.spotify?.spotifyIds || [];
          
          // Get token and fetch metadata for each ID
          const token = await getSpotifyToken();
          if (!token) {
            return Response.json({ ids: spotifyIds.map(id => ({ id, name: 'Unknown', type: 'unknown' })) });
          }

          // Fetch metadata for all IDs
          const idsWithMetadata = await Promise.all(
            spotifyIds.map(async (id: string) => {
              try {
                // Parse Spotify URI: spotify:track:xxx or spotify:album:xxx
                const parts = id.split(':');
                if (parts.length < 3 || parts[0] !== 'spotify') {
                  return { id, name: 'Invalid URI', type: 'unknown' };
                }

                const type = parts[1]; // track, album, playlist, artist
                const spotifyId = parts[2]; // The actual ID

                const response = await fetch(`https://api.spotify.com/v1/${type}s/${spotifyId}`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  },
                });

                if (!response.ok) {
                  return { id, name: 'Unknown', type };
                }

                const data = await response.json();
                const name = data.name || 'Unknown';
                let displayName = name;
                let imageUrl = '';

                if (type === 'track') {
                  const artist = data.artists?.[0]?.name || '';
                  displayName = artist ? `${name} - ${artist}` : name;
                  imageUrl = data.album?.images?.[0]?.url || data.album?.images?.[1]?.url || '';
                } else if (type === 'album') {
                  const artist = data.artists?.[0]?.name || '';
                  displayName = artist ? `${name} - ${artist}` : name;
                  imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
                } else if (type === 'playlist') {
                  const owner = data.owner?.display_name || data.owner?.id || '';
                  displayName = owner ? `${name} (by ${owner})` : name;
                  imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
                } else if (type === 'artist') {
                  imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
                }

                return { id, name: displayName, type, imageUrl };
              } catch (error) {
                const parts = id.split(':');
                return { id, name: 'Unknown', type: parts[1] || 'unknown' };
              }
            })
          );

          return Response.json({ ids: idsWithMetadata });
        } catch (error) {
          return Response.json({ error: "Failed to get Spotify IDs" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { ids?: string[] };
          const ids = body.ids || [];
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          config.spotify.spotifyIds = ids;
          await setConfig(config);
          
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to set Spotify IDs" }, { status: 500 });
        }
      },
    },
    // Spotify search API
    "/api/spotify/search": {
      GET: async (req) => {
        try {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          const type = url.searchParams.get('type') || 'track,album,playlist,artist';

          if (!query) {
            return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
          }

          const token = await getSpotifyToken();
          if (!token) {
            return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
          }

          const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (!response.ok) {
            return Response.json({ error: "Spotify API error" }, { status: response.status });
          }

          const data = await response.json();
          return Response.json(data);
        } catch (error) {
          return Response.json({ error: "Failed to search Spotify" }, { status: 500 });
        }
      },
    },
    // Spotify config API
    "/api/spotify/config": {
      GET: async () => {
        try {
          const config = await getConfig();
          return Response.json({
            clientId: config.spotify?.clientId || '',
            clientSecret: config.spotify?.clientSecret || '',
          });
        } catch (error) {
          return Response.json({ error: "Failed to get Spotify config" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { clientId?: string; clientSecret?: string };
          const config = await getConfig();
          
          if (!config.spotify) {
            config.spotify = {};
          }
          
          if (body.clientId !== undefined) {
            config.spotify.clientId = body.clientId;
          }
          if (body.clientSecret !== undefined) {
            config.spotify.clientSecret = body.clientSecret;
          }
          
          // Clear token cache when credentials change
          spotifyTokenCache = null;
          
          await setConfig(config);
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to set Spotify config" }, { status: 500 });
        }
      },
    },
    "/manage": manageHtml,
    "/": indexHtml,    
  },
  development: true,
});
