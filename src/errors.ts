// Error logging route handler
export async function handlePostErrors(req: Request) {
  try {
    const errorData = await req.json();
    
    // Log to console.error with full details
    console.error("[CLIENT ERROR]", {
      timestamp: new Date().toISOString(),
      message: errorData.message || 'Unknown error',
      source: errorData.source || 'unknown',
      lineno: errorData.lineno,
      colno: errorData.colno,
      filename: errorData.filename,
      stack: errorData.stack,
      userAgent: errorData.userAgent || req.headers.get('user-agent'),
      url: errorData.url || req.url,
      ...(errorData.error && { error: errorData.error }),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[ERROR HANDLER] Failed to process error:", error);
    return Response.json({ success: false, error: "Failed to process error" }, { status: 500 });
  }
}

// Console logging route handler
export async function handlePostConsole(req: Request) {
  try {
    const data = await req.json();
    
    // Log to console.info
    console.info("[CONSOLE]", data);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[CONSOLE HANDLER] Failed to process console data:", error);
    return Response.json({ success: false, error: "Failed to process console data" }, { status: 500 });
  }
}

