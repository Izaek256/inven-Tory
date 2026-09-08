import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

// Polyfill window.matchMedia for jsdom
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

// Polyfill sessionStorage (available in jsdom but ensure clean state per test)
beforeEach(() => {
  sessionStorage.clear();
});
