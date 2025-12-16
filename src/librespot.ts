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

// Long polling endpoint for status updates
export async function handleGetEvents(req: Request) {
  const traceContext = traceApiStart('GET', '/api/events', 'inbound');
  try {
    const url = new URL(req.url);
    const lastVersion = parseInt(url.searchParams.get('version') || '0', 10);
    const timeout = parseInt(url.searchParams.get('timeout') || '30000', 10);

    // Wait for state change or timeout
    const result = await librespotStateService.pollState(lastVersion, timeout);

    // Connection status: true if WebSocket is connected to go-librespot
    // This means go-librespot is running and available as a Spotify Connect device
    // The user can connect from their Spotify app even if no session is currently active
    const wsConnected = librespotStateService.isConnected();

    traceApiEnd(traceContext, 200);
    return Response.json({
      state: result.state,
      version: result.version,
      connected: wsConnected,
    });
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to poll state" }, { status: 500 });
  }
}

// Proxy go-librespot REST API endpoints
export async function handleGetStatus(req: Request) {
  console.log("GET /status");
  const traceContext = traceApiStart('GET', '/status', 'inbound');
  try {
    const response = await proxyToLibrespot('/status', 'GET');
    traceApiEnd(traceContext, response.status);
    return response;
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    throw error;
  }
}

export async function handlePostPlayPause(req: Request) {
  const traceContext = traceApiStart('POST', '/player/playpause', 'inbound');
  try {
    const response = await proxyToLibrespot('/player/playpause', 'POST');
    traceApiEnd(traceContext, response.status);
    return response;
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    throw error;
  }
}

export async function handlePostNext(req: Request) {
  const traceContext = traceApiStart('POST', '/player/next', 'inbound');
  try {
    const response = await proxyToLibrespot('/player/next', 'POST');
    traceApiEnd(traceContext, response.status);
    return response;
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    throw error;
  }
}

export async function handlePostPrev(req: Request) {
  const traceContext = traceApiStart('POST', '/player/prev', 'inbound');
  try {
    const response = await proxyToLibrespot('/player/prev', 'POST');
    traceApiEnd(traceContext, response.status);
    return response;
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    throw error;
  }
}

export async function handlePostVolume(req: Request) {
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
}

export async function handlePostSeek(req: Request) {
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
}

export async function handlePostRepeatContext(req: Request) {
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
}

export async function handlePostRepeatTrack(req: Request) {
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
}

export async function handlePostShuffleContext(req: Request) {
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
}

export async function handlePostAddToQueue(req: Request) {
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
}


