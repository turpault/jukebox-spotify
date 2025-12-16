import { traceApiStart, traceApiEnd } from "./tracing";
import { librespotStateService } from "./librespot-state";

// go-librespot API base URL
const LIBRESPOT_API_URL = "http://localhost:3678";

// Proxy function for go-librespot REST API
async function proxyToLibrespot(path: string, method: string = 'GET', body?: any): Promise<Response> {
  const traceContext = traceApiStart(method, path, 'outbound', body);
  try {
    const url = `${LIBRESPOT_API_URL}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json().catch(() => null);
    traceApiEnd(traceContext, response.status, data);
    return Response.json(data, { status: response.status });
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    console.error(`Error proxying to go-librespot ${path}:`, error);
    return Response.json({ error: "Failed to proxy request" }, { status: 500 });
  }
}

export function createLibrespotRoutes() {
  return {
    // Long polling endpoint for status updates
    "/api/events": {
      GET: async (req: Request) => {
        const traceContext = traceApiStart('GET', '/api/events', 'inbound');
        try {
          const url = new URL(req.url);
          const lastVersion = parseInt(url.searchParams.get('version') || '0', 10);
          const timeout = parseInt(url.searchParams.get('timeout') || '30000', 10);
          
          // Wait for state change or timeout
          const result = await librespotStateService.pollState(lastVersion, timeout);
          
          traceApiEnd(traceContext, 200);
          return Response.json({
            state: result.state,
            version: result.version,
            connected: librespotStateService.isConnected(),
          });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to poll state" }, { status: 500 });
        }
      },
    },
    // Proxy go-librespot REST API endpoints
    "/status": {
      GET: async (req: Request) => {
        const traceContext = traceApiStart('GET', '/status', 'inbound');
        try {
          const response = await proxyToLibrespot('/status', 'GET');
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/playpause": {
      POST: async (req: Request) => {
        const traceContext = traceApiStart('POST', '/player/playpause', 'inbound');
        try {
          const response = await proxyToLibrespot('/player/playpause', 'POST');
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/next": {
      POST: async (req: Request) => {
        const traceContext = traceApiStart('POST', '/player/next', 'inbound');
        try {
          const response = await proxyToLibrespot('/player/next', 'POST');
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/prev": {
      POST: async (req: Request) => {
        const traceContext = traceApiStart('POST', '/player/prev', 'inbound');
        try {
          const response = await proxyToLibrespot('/player/prev', 'POST');
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/volume": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/volume', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/volume', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/seek": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/seek', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/seek', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/repeat_context": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/repeat_context', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/repeat_context', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/repeat_track": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/repeat_track', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/repeat_track', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/shuffle_context": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/shuffle_context', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/shuffle_context', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
    "/player/add_to_queue": {
      POST: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const traceContext = traceApiStart('POST', '/player/add_to_queue', 'inbound', body);
        try {
          const response = await proxyToLibrespot('/player/add_to_queue', 'POST', body);
          traceApiEnd(traceContext, response.status);
          return response;
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          throw error;
        }
      },
    },
  };
}


