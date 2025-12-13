import { serve } from "bun";
import { readFile, writeFile } from "fs/promises";
import indexHtml from "./public/index.html";

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
          
          const success = await setTheme(themeName);
          if (success) {
            return Response.json({ theme: themeName });
          } else {
            return Response.json({ error: "Invalid theme name" }, { status: 400 });
          }
        } catch (error) {
          return Response.json({ error: "Failed to set theme" }, { status: 500 });
        }
      },
    },
    "/": indexHtml
    
  },
});
