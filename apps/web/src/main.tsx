import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, ToastProvider, SplashScreen } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';
import { initToken } from './services/apiClient';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const root = ReactDOM.createRoot(rootElement);

// Boot splash — shown synchronously while the session token hydrates
// (previously this window was a blank page).
root.render(<SplashScreen />);

initToken().then(() => {
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
});
