// Tracing utility for API calls and WebSocket traffic

interface TraceContext {
  traceId: string;
  startTime: number;
  method?: string;
  path?: string;
  direction?: 'inbound' | 'outbound';
  type?: 'api' | 'websocket';
}

// Generate a unique trace ID
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Format trace log entry
function formatTrace(
  level: 'info' | 'error' | 'warn',
  message: string,
  context: TraceContext,
  additionalData?: any
): void {
  const timestamp = new Date().toISOString();
  const duration = context.startTime ? Date.now() - context.startTime : undefined;
  
  const logEntry: any = {
    timestamp,
    traceId: context.traceId,
    level,
    message,
    ...(context.method && { method: context.method }),
    ...(context.path && { path: context.path }),
    ...(context.direction && { direction: context.direction }),
    ...(context.type && { type: context.type }),
    ...(duration !== undefined && { durationMs: duration }),
    ...(additionalData && { data: additionalData }),
  };

  const logString = `[TRACE] [${timestamp}] [${context.traceId}] ${level.toUpperCase()}: ${message}`;
  
  if (level === 'error') {
    console.error(logString, logEntry);
  } else if (level === 'warn') {
    console.warn(logString, logEntry);
  } else {
    console.log(logString, logEntry);
  }
}

// Trace API request start
export function traceApiStart(
  method: string,
  path: string,
  direction: 'inbound' | 'outbound' = 'inbound',
  requestBody?: any
): TraceContext {
  const traceId = generateTraceId();
  const context: TraceContext = {
    traceId,
    startTime: Date.now(),
    method,
    path,
    direction,
    type: 'api',
  };

  formatTrace('info', `${direction === 'inbound' ? 'Incoming' : 'Outgoing'} API request`, context, {
    requestBody: requestBody ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : undefined,
  });

  return context;
}

// Trace API response
export function traceApiEnd(
  context: TraceContext,
  statusCode?: number,
  responseBody?: any,
  error?: any
): void {
  if (error) {
    formatTrace('error', 'API request failed', context, {
      error: error instanceof Error ? error.message : String(error),
      statusCode,
    });
  } else {
    formatTrace('info', 'API request completed', context, {
      statusCode,
      responseBody: responseBody ? (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)) : undefined,
    });
  }
}

// Trace WebSocket event
export function traceWebSocket(
  event: string,
  direction: 'inbound' | 'outbound',
  data?: any,
  error?: any,
  traceId?: string
): string {
  const contextTraceId = traceId || generateTraceId();
  const context: TraceContext = {
    traceId: contextTraceId,
    startTime: Date.now(),
    direction,
    type: 'websocket',
  };

  if (error) {
    formatTrace('error', `WebSocket ${event}`, context, {
      error: error instanceof Error ? error.message : String(error),
    });
  } else {
    formatTrace('info', `WebSocket ${event}`, context, {
      data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
    });
  }

  return contextTraceId;
}

// Trace WebSocket connection
export function traceWebSocketConnection(
  event: 'open' | 'close' | 'error',
  direction: 'inbound' | 'outbound',
  additionalData?: any
): string {
  const traceId = generateTraceId();
  const context: TraceContext = {
    traceId,
    startTime: Date.now(),
    direction,
    type: 'websocket',
  };

  const level = event === 'error' ? 'error' : 'info';
  formatTrace(level, `WebSocket connection ${event}`, context, additionalData);

  return traceId;
}

// Wrap an async API handler with tracing
export async function withApiTrace<T>(
  method: string,
  path: string,
  handler: (context: TraceContext) => Promise<T>,
  requestBody?: any
): Promise<T> {
  const context = traceApiStart(method, path, 'inbound', requestBody);
  
  try {
    const result = await handler(context);
    traceApiEnd(context, 200, result);
    return result;
  } catch (error: any) {
    const statusCode = error?.status || 500;
    traceApiEnd(context, statusCode, null, error);
    throw error;
  }
}

// Wrap a response with tracing
export function traceResponse(
  context: TraceContext,
  response: Response
): Response {
  // Note: We can't easily trace the response body without consuming it
  // This is a limitation, but we can at least trace the status
  traceApiEnd(context, response.status);
  return response;
}

