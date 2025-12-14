import { readFile, writeFile } from "fs/promises";
import indexHtml from "./public/index.html";
import { serve } from "bun";

// Theme storage file
const THEME_FILE = ".theme.json";
// Hotkeys configuration file
const HOTKEYS_FILE = "hotkeys.json";

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

async function setTheme(themeName: string): Promise<void> {
  await writeFile(THEME_FILE, JSON.stringify({ name: themeName }, null, 2));
}

async function getHotkeys(): Promise<any> {
  try {
    const data = await readFile(HOTKEYS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Return default hotkeys if file doesn't exist
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
  await writeFile(HOTKEYS_FILE, JSON.stringify(hotkeys, null, 2));
}


const isKioskMode = process.env.KIOSK === "1" || process.env.KIOSK === "true";

// Function to launch Chrome in kiosk mode
async function launchChromeKiosk() {
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
    "/": indexHtml,    
  },
  development: true,
});
