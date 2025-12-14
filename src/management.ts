import { getConfig, setConfig, getConfigVersion, Config } from "./config";
import { traceApiStart, traceApiEnd } from "./tracing";
import { getApiStats } from "./api-logger";

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
        const traceContext = traceApiStart('GET', '/api/kiosk', 'inbound');
        try {
          traceApiEnd(traceContext, 200, { kiosk: isKioskMode });
          return Response.json({ kiosk: isKioskMode });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    // Config version API
    "/api/config/version": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/config/version', 'inbound');
        try {
          const version = await getConfigVersion();
          traceApiEnd(traceContext, 200, { version });
          return Response.json({ version });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get config version" }, { status: 500 });
        }
      },
    },
    // Hotkeys API
    "/api/hotkeys": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/hotkeys', 'inbound');
        try {
          const hotkeys = await getHotkeys();
          traceApiEnd(traceContext, 200, { hasHotkeys: !!hotkeys });
          return Response.json(hotkeys);
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get hotkeys" }, { status: 500 });
        }
      },
      POST: async (req) => {
        const body = await req.json() as any;
        const traceContext = traceApiStart('POST', '/api/hotkeys', 'inbound', { hasHotkeys: !!body });
        try {
          await setHotkeys(body);
          traceApiEnd(traceContext, 200, { success: true });
          return Response.json({ success: true });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set hotkeys" }, { status: 500 });
        }
      },
    },
    // Theme API routes
    "/api/theme": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/theme', 'inbound');
        try {
          const themeName = await getTheme();
          traceApiEnd(traceContext, 200, { theme: themeName });
          return Response.json({ theme: themeName });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get theme" }, { status: 500 });
        }
      },
      POST: async (req) => {
        const body = await req.json() as { theme?: string };
        const traceContext = traceApiStart('POST', '/api/theme', 'inbound', { theme: body.theme });
        try {
          const themeName = body.theme;
          
          if (!themeName) {
            traceApiEnd(traceContext, 400, { error: "Theme name is required" });
            return Response.json({ error: "Theme name is required" }, { status: 400 });
          }
          
          await setTheme(themeName);
          traceApiEnd(traceContext, 200, { theme: themeName });
          return Response.json({ theme: themeName });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set theme" }, { status: 500 });
        }
      },
    },
    "/api/view": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/view', 'inbound');
        try {
          const viewName = await getView();
          traceApiEnd(traceContext, 200, { view: viewName });
          return Response.json({ view: viewName });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get view" }, { status: 500 });
        }
      },
      POST: async (req) => {
        const body = await req.json() as { view?: string };
        const traceContext = traceApiStart('POST', '/api/view', 'inbound', { view: body.view });
        try {
          const viewName = body.view;
          
          if (!viewName) {
            traceApiEnd(traceContext, 400, { error: "View name is required" });
            return Response.json({ error: "View name is required" }, { status: 400 });
          }
          
          await setView(viewName);
          traceApiEnd(traceContext, 200, { view: viewName });
          return Response.json({ view: viewName });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set view" }, { status: 500 });
        }
      },
    },
    // API stats endpoint
    "/api/stats": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/stats', 'inbound');
        try {
          const stats = getApiStats();
          traceApiEnd(traceContext, 200, { statsRetrieved: true });
          return Response.json(stats);
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get API stats" }, { status: 500 });
        }
      },
    },
  };
}

