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
