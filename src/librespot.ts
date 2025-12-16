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
      
      // Store connection state
      const state = {
        librespotWs: null as WebSocket | null,
        reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
        reconnectAttempts: 0,
        messageQueue: [] as (string | ArrayBuffer | Uint8Array)[],
        isClientClosed: false,
        maxReconnectDelay: 30000, // 30 seconds max delay
        initialReconnectDelay: 1000, // Start with 1 second
      };
      
      (ws as any).librespotState = state;
      
      // Function to connect to go-librespot
      const connectToLibrespot = () => {
        // Clear any existing reconnection timeout
        if (state.reconnectTimeout) {
          clearTimeout(state.reconnectTimeout);
          state.reconnectTimeout = null;
        }
        
        // Don't try to reconnect if client is closed
        if (state.isClientClosed) {
          return;
        }
        
        // Close existing connection if any
        if (state.librespotWs) {
          try {
            state.librespotWs.onclose = null;
            state.librespotWs.onerror = null;
            state.librespotWs.onmessage = null;
            state.librespotWs.onopen = null;
            if (state.librespotWs.readyState === WebSocket.OPEN || state.librespotWs.readyState === WebSocket.CONNECTING) {
              state.librespotWs.close();
            }
          } catch (e) {
            // Ignore errors when closing
          }
          state.librespotWs = null;
        }
        
        try {
          traceWebSocket('Connecting to go-librespot', 'outbound', { 
            url: LIBRESPOT_WS_URL,
            attempt: state.reconnectAttempts + 1 
          });
          const librespotWs = new WebSocket(LIBRESPOT_WS_URL);
          state.librespotWs = librespotWs;
          
          librespotWs.onopen = () => {
            traceWebSocketConnection('open', 'outbound', { librespotConnected: true });
            state.reconnectAttempts = 0; // Reset on successful connection
            
            // Send any queued messages
            while (state.messageQueue.length > 0 && librespotWs.readyState === WebSocket.OPEN) {
              const queuedMessage = state.messageQueue.shift();
              if (queuedMessage) {
                try {
                  if (typeof queuedMessage === 'string') {
                    librespotWs.send(queuedMessage);
                  } else if (queuedMessage instanceof ArrayBuffer) {
                    librespotWs.send(queuedMessage);
                  } else if (queuedMessage instanceof Uint8Array) {
                    librespotWs.send(queuedMessage);
                  }
                } catch (e) {
                  // If send fails, put message back in queue
                  state.messageQueue.unshift(queuedMessage);
                  break;
                }
              }
            }
          };
          
          // Forward messages from go-librespot to client
          librespotWs.onmessage = (event: MessageEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              traceWebSocket('Message from go-librespot to client', 'inbound', 
                typeof event.data === 'string' ? event.data : '[binary data]');
              try {
                ws.send(event.data);
              } catch (e) {
                console.error('Failed to send message to client:', e);
              }
            }
          };
          
          // Handle errors - don't close client connection, just try to reconnect
          librespotWs.onerror = (error: Event) => {
            traceWebSocket('go-librespot WebSocket error', 'outbound', null, error);
            console.error('go-librespot WebSocket error:', error);
            // Don't close client connection, will reconnect below
          };
          
          librespotWs.onclose = (event: CloseEvent) => {
            traceWebSocketConnection('close', 'outbound', { 
              code: event.code, 
              reason: event.reason, 
              wasClean: event.wasClean 
            });
            
            // Don't close client connection, try to reconnect
            if (!state.isClientClosed && ws.readyState === WebSocket.OPEN) {
              // Calculate exponential backoff delay
              const delay = Math.min(
                state.initialReconnectDelay * Math.pow(2, state.reconnectAttempts),
                state.maxReconnectDelay
              );
              state.reconnectAttempts++;
              
              traceWebSocket('Scheduling reconnect to go-librespot', 'outbound', { 
                delayMs: delay,
                attempt: state.reconnectAttempts 
              });
              
              state.reconnectTimeout = setTimeout(() => {
                connectToLibrespot();
              }, delay);
            }
          };
        } catch (error) {
          traceWebSocket('Failed to create go-librespot WebSocket connection', 'outbound', null, error);
          console.error('Failed to create go-librespot WebSocket connection:', error);
          
          // Schedule reconnect
          if (!state.isClientClosed && ws.readyState === WebSocket.OPEN) {
            const delay = Math.min(
              state.initialReconnectDelay * Math.pow(2, state.reconnectAttempts),
              state.maxReconnectDelay
            );
            state.reconnectAttempts++;
            
            state.reconnectTimeout = setTimeout(() => {
              connectToLibrespot();
            }, delay);
          }
        }
      };
      
      // Forward messages from client to go-librespot
      ws.onmessage = (message: string | ArrayBuffer | Uint8Array) => {
        if (state.librespotWs && state.librespotWs.readyState === WebSocket.OPEN) {
          const messageStr = typeof message === 'string' ? message : '[binary data]';
          traceWebSocket('Message from client to go-librespot', 'outbound', messageStr);
          try {
            if (typeof message === 'string') {
              state.librespotWs.send(message);
            } else if (message instanceof ArrayBuffer) {
              state.librespotWs.send(message);
            } else if (message instanceof Uint8Array) {
              state.librespotWs.send(message);
            }
          } catch (e) {
            console.error('Failed to send message to go-librespot:', e);
            // Queue message for later if connection is lost
            state.messageQueue.push(message);
          }
        } else {
          // Queue message if not connected
          state.messageQueue.push(message);
          traceWebSocket('Queued message from client (go-librespot not connected)', 'outbound', 
            typeof message === 'string' ? message : '[binary data]');
        }
      };
      
      ws.onclose = (event: CloseEvent) => {
        traceWebSocketConnection('close', 'inbound', { 
          code: event.code, 
          reason: event.reason, 
          wasClean: event.wasClean 
        });
        state.isClientClosed = true;
        
        // Clear reconnection timeout
        if (state.reconnectTimeout) {
          clearTimeout(state.reconnectTimeout);
          state.reconnectTimeout = null;
        }
        
        // Close librespot connection
        if (state.librespotWs) {
          try {
            state.librespotWs.onclose = null;
            state.librespotWs.onerror = null;
            state.librespotWs.onmessage = null;
            state.librespotWs.onopen = null;
            if (state.librespotWs.readyState === WebSocket.OPEN || state.librespotWs.readyState === WebSocket.CONNECTING) {
              state.librespotWs.close();
            }
          } catch (e) {
            // Ignore errors
          }
          state.librespotWs = null;
        }
      };
      
      // Initial connection attempt
      connectToLibrespot();
    },
    message(ws: any, message: string | ArrayBuffer | Uint8Array) {
      // Forward message to go-librespot
      const state = (ws as any).librespotState;
      if (!state) return;
      
      if (state.librespotWs && state.librespotWs.readyState === WebSocket.OPEN) {
        const messageStr = typeof message === 'string' ? message : '[binary data]';
        traceWebSocket('Message from client to go-librespot', 'outbound', messageStr);
        try {
          if (typeof message === 'string') {
            state.librespotWs.send(message);
          } else if (message instanceof ArrayBuffer) {
            state.librespotWs.send(message);
          } else if (message instanceof Uint8Array) {
            state.librespotWs.send(message);
          }
        } catch (e) {
          console.error('Failed to send message to go-librespot:', e);
          state.messageQueue.push(message);
        }
      } else {
        // Queue message if not connected
        state.messageQueue.push(message);
        traceWebSocket('Queued message from client (go-librespot not connected)', 'outbound', 
          typeof message === 'string' ? message : '[binary data]');
      }
    },
    close(ws: any) {
      traceWebSocketConnection('close', 'inbound');
      const state = (ws as any).librespotState;
      if (!state) return;
      
      state.isClientClosed = true;
      
      // Clear reconnection timeout
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
        state.reconnectTimeout = null;
      }
      
      // Close librespot connection
      if (state.librespotWs) {
        try {
          state.librespotWs.onclose = null;
          state.librespotWs.onerror = null;
          state.librespotWs.onmessage = null;
          state.librespotWs.onopen = null;
          if (state.librespotWs.readyState === WebSocket.OPEN || state.librespotWs.readyState === WebSocket.CONNECTING) {
            state.librespotWs.close();
          }
        } catch (e) {
          // Ignore errors
        }
        state.librespotWs = null;
      }
    },
  };
}

