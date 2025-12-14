import { getConfig, setConfig, getConfigVersion, Config } from "./config";

export async function getTheme(): Promise<string> {
  try {
    const config = await getConfig();
    return config.theme || "steampunk";
  } catch (error) {
    // Default theme if config doesn't exist
    return "steampunk";
  }
}

export async function setTheme(themeName: string): Promise<void> {
  const config = await getConfig();
  config.theme = themeName;
  await setConfig(config);
}

export async function getView(): Promise<string> {
  try {
    const config = await getConfig();
    return config.view || "default";
  } catch (error) {
    // Default view if config doesn't exist
    return "default";
  }
}

export async function setView(viewName: string): Promise<void> {
  const config = await getConfig();
  config.view = viewName;
  await setConfig(config);
}

export async function getHotkeys(): Promise<any> {
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

export async function setHotkeys(hotkeys: any): Promise<void> {
  const config = await getConfig();
  config.hotkeys = hotkeys;
  await setConfig(config);
}

export function createManagementRoutes(isKioskMode: boolean) {
  return {
    // Kiosk mode API
    "/api/kiosk": {
      GET: async () => {
        return Response.json({ kiosk: isKioskMode });
      },
    },
    // Config version API
    "/api/config/version": {
      GET: async () => {
        try {
          const version = await getConfigVersion();
          return Response.json({ version });
        } catch (error) {
          return Response.json({ error: "Failed to get config version" }, { status: 500 });
        }
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
  };
}

