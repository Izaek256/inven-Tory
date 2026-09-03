import '@testing-library/jest-dom';
import { _setMemSession } from './helpers';

// Polyfill window.matchMedia for jsdom (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  }),
});

// Pre-seed an authenticated session for all tests so App.test.tsx works
// without needing to mock tauriAuthService individually.
_setMemSession({
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  user_id: 'USER-DEMO',
  username: 'demo',
  full_name: 'Demo User',
  role: 'STORE_MANAGER',
  assigned_store_id: null,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(), // +24 h
  token_expired_offline: false,
});
