import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { ThemeProvider, ToastProvider } from '@inven-tory/ui';
import '@inven-tory/ui/src/tokens.css';

// Mark application startup start time for performance tracking (NFR-PERF-001)
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('app-init-start');
  // eslint-disable-next-line no-console
  console.info('[PERF] Instrumentation started: app-init-start');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Root element '#root' not found in DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
