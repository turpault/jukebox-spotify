import { readFile, writeFile } from "fs/promises";
import indexHtml from "./public/index.html";
import { serve } from "bun";

// Theme storage file
const THEME_FILE = ".theme.json";

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
