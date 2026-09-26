import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';
import { initToken } from './services/apiClient';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

initToken().then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
});
