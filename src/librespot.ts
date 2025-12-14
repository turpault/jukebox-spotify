import { traceApiStart, traceApiEnd, traceWebSocket, traceWebSocketConnection } from "./tracing";

// go-librespot API base URL
const LIBRESPOT_API_URL = "http://localhost:3678";
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";

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

export function createLibrespotWebSocket() {
  return {
    async open(ws: any) {
      traceWebSocketConnection('open', 'inbound', { clientConnected: true });
      try {
        // Connect to go-librespot WebSocket
        traceWebSocket('Connecting to go-librespot', 'outbound', { url: LIBRESPOT_WS_URL });
        const librespotWs = new WebSocket(LIBRESPOT_WS_URL);
        
        librespotWs.onopen = () => {
          traceWebSocketConnection('open', 'outbound', { librespotConnected: true });
        };
        
        // Forward messages from go-librespot to client
        librespotWs.onmessage = (event: MessageEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            traceWebSocket('Message from go-librespot to client', 'inbound', 
              typeof event.data === 'string' ? event.data : '[binary data]');
            ws.send(event.data);
          }
        };
        
        // Forward messages from client to go-librespot
        ws.onmessage = (message: string | ArrayBuffer | Uint8Array) => {
          if (librespotWs.readyState === WebSocket.OPEN) {
            const messageStr = typeof message === 'string' ? message : '[binary data]';
            traceWebSocket('Message from client to go-librespot', 'outbound', messageStr);
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
          traceWebSocket('go-librespot WebSocket error', 'outbound', null, error);
          console.error('go-librespot WebSocket error:', error);
          ws.close();
        };
        
        librespotWs.onclose = (event: CloseEvent) => {
          traceWebSocketConnection('close', 'outbound', { 
            code: event.code, 
            reason: event.reason, 
            wasClean: event.wasClean 
          });
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
        
        ws.onclose = (event: CloseEvent) => {
          traceWebSocketConnection('close', 'inbound', { 
            code: event.code, 
            reason: event.reason, 
            wasClean: event.wasClean 
          });
          if (librespotWs.readyState === WebSocket.OPEN) {
            librespotWs.close();
          }
        };
        
        // Store the librespot connection on the ws object
        (ws as any).librespotWs = librespotWs;
      } catch (error) {
        traceWebSocket('Failed to connect to go-librespot WebSocket', 'outbound', null, error);
        console.error('Failed to connect to go-librespot WebSocket:', error);
        ws.close();
      }
    },
    message(ws: any, message: string | ArrayBuffer | Uint8Array) {
      // Forward message to go-librespot
      const librespotWs = (ws as any).librespotWs;
      if (librespotWs && librespotWs.readyState === WebSocket.OPEN) {
        const messageStr = typeof message === 'string' ? message : '[binary data]';
        traceWebSocket('Message from client to go-librespot', 'outbound', messageStr);
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
      traceWebSocketConnection('close', 'inbound');
      const librespotWs = (ws as any).librespotWs;
      if (librespotWs && librespotWs.readyState === WebSocket.OPEN) {
        librespotWs.close();
      }
    },
  };
}

