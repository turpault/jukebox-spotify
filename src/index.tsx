import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { JukeboxStateProvider } from './JukeboxStateProvider';
import { ConfigStateProvider } from './ConfigStateProvider';

// Detect iOS 9
function isIOS9(): boolean {
  const ua = navigator.userAgent;
  // iOS 9 user agent contains "OS 9_" or "Version/9."
  return /iPhone|iPad|iPod/.test(ua) && (/OS 9_/.test(ua) || /Version\/9\./.test(ua));
}

// Overload console functions on iOS 9 to send to server
if (isIOS9()) {
  // Store original console functions
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Helper function to send console data to server
  function sendToServer(level: string, args: any[]) {
    try {
      // Convert arguments to a format that can be serialized
      const data = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.parse(JSON.stringify(arg));
          } catch {
            return String(arg);
          }
        }
        return arg;
      });

      fetch('/api/console', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: level,
          args: data,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(() => {
        // Silently fail if request fails
      });
    } catch (err) {
      // Silently fail if anything goes wrong
    }
  }

  // Override console.info
  console.info = function(...args: any[]) {
    sendToServer('info', args);
    // Call original if it exists
    if (originalInfo) {
      originalInfo.apply(console, args);
    }
  };

  // Override console.warn
  console.warn = function(...args: any[]) {
    sendToServer('warn', args);
    // Call original if it exists
    if (originalWarn) {
      originalWarn.apply(console, args);
    }
  };

  // Override console.error
  console.error = function(...args: any[]) {
    sendToServer('error', args);
    // Call original if it exists
    if (originalError) {
      originalError.apply(console, args);
    }
  };
}

// Global error handler
window.addEventListener('error', (event) => {
  // Send error to server
  fetch('/api/errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: event.message,
      source: 'window.onerror',
      lineno: event.lineno,
      colno: event.colno,
      filename: event.filename,
      stack: event.error?.stack,
      error: event.error?.toString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }),
  }).catch(err => {
    // Silently fail if error reporting fails
    console.error('Failed to report error to server:', err);
  });
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  // Send error to server
  fetch('/api/errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
      source: 'unhandledrejection',
      stack: event.reason?.stack,
      error: event.reason?.toString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }),
  }).catch(err => {
    // Silently fail if error reporting fails
    console.error('Failed to report error to server:', err);
  });
});

const rootElement = document.getElementById('root');
if (rootElement) {
  // Use createRoot (React 18+ API)
  // For iOS 9 compatibility, this will be transpiled to ES5
  const root = createRoot(rootElement);
  root.render(
    React.createElement(ConfigStateProvider, null,
      React.createElement(JukeboxStateProvider, null,
        React.createElement(App)
      )
    )
  );
}

