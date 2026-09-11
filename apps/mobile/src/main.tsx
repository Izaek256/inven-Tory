import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import '@invenTory/ui/tokens.css';
import { useAppState } from './hooks/useAppState';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const appState = useAppState();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App initialUser={appState.initialUser} isOnline={appState.isOnline} />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
