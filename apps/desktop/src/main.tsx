import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Mark application startup start time for performance tracking (NFR-PERF-001)
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('app-init-start');
  // eslint-disable-next-line no-console
  console.info('[PERF] Instrumentation started: app-init-start');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
