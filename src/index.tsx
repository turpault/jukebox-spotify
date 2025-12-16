import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { JukeboxStateProvider } from './JukeboxStateProvider';
import { ConfigStateProvider } from './ConfigStateProvider';

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

