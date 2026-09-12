import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
