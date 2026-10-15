import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UpdaterProvider } from './context/UpdaterContext';

import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';

// UI Lab — development only. `import.meta.env.DEV` is a compile-time constant
// (false for `vite build`), so this lazy import and the whole uiLab module are
// dead-code eliminated from production bundles.
const UiLab = import.meta.env.DEV ? React.lazy(() => import('./uiLab/UiLab')) : null;

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
    <ThemeProvider>
      <ToastProvider>
        <UpdaterProvider>
          <App />
          {UiLab && (
            <React.Suspense fallback={null}>
              <UiLab />
            </React.Suspense>
          )}
        </UpdaterProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
