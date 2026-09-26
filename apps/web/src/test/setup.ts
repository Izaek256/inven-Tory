import '@testing-library/jest-dom';
import { beforeEach, afterEach, vi } from 'vitest';
import React from 'react';

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

  return {
    ...actual,
    render: (ui: React.ReactElement, options?: any) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });

      return actual.render(
        React.createElement(QueryClientProvider, { client: queryClient }, ui),
        options,
      );
    },
  };
});

// Pin timezone to UTC for consistent date formatting across environments
// This prevents snapshot failures due to timezone differences (e.g., CI vs local)
process.env.TZ = 'UTC';

// Polyfill ResizeObserver for recharts (not implemented in jsdom)
(globalThis as Record<string, unknown>).ResizeObserver =
  (globalThis as Record<string, unknown>).ResizeObserver ??
  class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

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

let _rafTime = 0;
const _rafCallbacks = new Map<number, FrameRequestCallback>();
let _rafId = 1;

beforeEach(() => {
  sessionStorage.clear();
  _rafTime = 0;
  _rafCallbacks.clear();
  _rafId = 1;

  const realPerfNow = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => (_rafTime > 0 ? _rafTime : realPerfNow()));

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    const id = _rafId++;
    _rafCallbacks.set(id, cb);
    queueMicrotask(() => {
      _rafTime += 100_000;
      _rafCallbacks.delete(id);
      cb(_rafTime);
    });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    _rafCallbacks.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
