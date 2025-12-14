import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

// Use legacy render for iOS 9 compatibility
// React 19 still supports ReactDOM.render for backwards compatibility
const rootElement = document.getElementById('root');
if (rootElement) {
  // Always use legacy render for maximum compatibility with iOS 9
  // ReactDOM.render is deprecated but still works in React 19
  ReactDOM.render(React.createElement(App), rootElement);
}

