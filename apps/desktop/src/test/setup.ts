import '@testing-library/jest-dom';
import { _setMemSession } from './helpers';
import { vi } from 'vitest';

// Polyfill ResizeObserver for recharts (not implemented in jsdom)
const g = globalThis as Record<string, unknown>;
if (!g.ResizeObserver) {
  g.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

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

// Mock Tauri invoke for all tests - this prevents "window.__TAURI_INTERNALS__.invoke is not a function" errors
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {
    invoke: vi.fn((_cmd: string, _args?: unknown) => {
      // Default mock implementation - individual tests can override this
      // eslint-disable-next-line no-console
      console.warn(`[Tauri Mock] Unhandled invoke: ${_cmd}`, _args);
      return Promise.reject(new Error(`Tauri command '${_cmd}' not mocked in test setup`));
    }),
  },
  writable: true,
  configurable: true,
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
