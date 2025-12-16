// Error logging route handler

export function createErrorRoutes() {
  return {
    "/api/errors": {
      POST: async (req: Request) => {
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
      },
    },
  };
}

