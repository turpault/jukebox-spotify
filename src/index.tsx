import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { JukeboxStateProvider } from './JukeboxStateProvider';
import { ConfigStateProvider } from './ConfigStateProvider';

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

