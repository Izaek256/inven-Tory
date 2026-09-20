import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdaterProvider } from './context/UpdaterContext';

import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';

// Mark application startup start time for performance tracking
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
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <UpdaterProvider>
            <App />
          </UpdaterProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
