// go-librespot API base URL
const LIBRESPOT_API_URL = "http://localhost:3678";
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";

// Proxy function for go-librespot REST API
async function proxyToLibrespot(path: string, method: string = 'GET', body?: any): Promise<Response> {
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
    return Response.json(data, { status: response.status });
  } catch (error) {
    console.error(`Error proxying to go-librespot ${path}:`, error);
    return Response.json({ error: "Failed to proxy request" }, { status: 500 });
  }
}

export function createLibrespotRoutes() {
  return {
    // Proxy go-librespot REST API endpoints
    "/status": {
      GET: async () => {
        return proxyToLibrespot('/status', 'GET');
      },
    },
    "/player/playpause": {
      POST: async () => {
        return proxyToLibrespot('/player/playpause', 'POST');
      },
    },
    "/player/next": {
      POST: async () => {
        return proxyToLibrespot('/player/next', 'POST');
      },
    },
    "/player/prev": {
      POST: async () => {
        return proxyToLibrespot('/player/prev', 'POST');
      },
    },
    "/player/volume": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/volume', 'POST', body);
      },
    },
    "/player/seek": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/seek', 'POST', body);
      },
    },
    "/player/repeat_context": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/repeat_context', 'POST', body);
      },
    },
    "/player/repeat_track": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/repeat_track', 'POST', body);
      },
    },
    "/player/shuffle_context": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/shuffle_context', 'POST', body);
      },
    },
    "/player/add_to_queue": {
      POST: async (req) => {
        const body = await req.json().catch(() => ({}));
        return proxyToLibrespot('/player/add_to_queue', 'POST', body);
      },
    },
  };
}

export function createLibrespotWebSocket() {
  return {
    async open(ws: any) {
      try {
        // Connect to go-librespot WebSocket
        const librespotWs = new WebSocket(LIBRESPOT_WS_URL);
        
        // Forward messages from go-librespot to client
        librespotWs.onmessage = (event: MessageEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };
        
        // Forward messages from client to go-librespot
        ws.onmessage = (message: string | ArrayBuffer | Uint8Array) => {
          if (librespotWs.readyState === WebSocket.OPEN) {
            if (typeof message === 'string') {
              librespotWs.send(message);
            } else if (message instanceof ArrayBuffer) {
              librespotWs.send(message);
            } else if (message instanceof Uint8Array) {
              librespotWs.send(message);
            }
          }
        };
        
        // Handle errors
        librespotWs.onerror = (error: Event) => {
          console.error('go-librespot WebSocket error:', error);
          ws.close();
        };
        
        librespotWs.onclose = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
        
        ws.onclose = () => {
          if (librespotWs.readyState === WebSocket.OPEN) {
            librespotWs.close();
          }
        };
        
        // Store the librespot connection on the ws object
        (ws as any).librespotWs = librespotWs;
      } catch (error) {
        console.error('Failed to connect to go-librespot WebSocket:', error);
        ws.close();
      }
    },
    message(ws: any, message: string | ArrayBuffer | Uint8Array) {
      // Forward message to go-librespot
      const librespotWs = (ws as any).librespotWs;
      if (librespotWs && librespotWs.readyState === WebSocket.OPEN) {
        if (typeof message === 'string') {
          librespotWs.send(message);
        } else if (message instanceof ArrayBuffer) {
          librespotWs.send(message);
        } else if (message instanceof Uint8Array) {
          librespotWs.send(message);
        }
      }
    },
    close(ws: any) {
      const librespotWs = (ws as any).librespotWs;
      if (librespotWs && librespotWs.readyState === WebSocket.OPEN) {
        librespotWs.close();
      }
    },
  };
}

