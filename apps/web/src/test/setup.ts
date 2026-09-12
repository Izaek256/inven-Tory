import '@testing-library/jest-dom';
import { beforeEach, afterEach, vi } from 'vitest';

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

// Synchronous requestAnimationFrame for deterministic tests.
//
// jsdom's real rAF uses the browser's compositor clock, which under vitest
// fires at wall-clock ~16ms intervals.  Hooks like useCountUp rely on rAF
// to drive a timed animation; with real rAF the animation either (a) never
// settles within a test's waitFor window, or (b) overshoots wildly when the
// event loop is busy (the "3 h ago" → "-386,342" failure mode).  Replacing
// rAF with a synchronous stub that advances a virtual clock lets animations
// complete on the very first tick, so tests assert the final settled state.
let _rafTime = 0;
const _rafCallbacks = new Map<number, FrameRequestCallback>();
let _rafId = 1;

beforeEach(() => {
  sessionStorage.clear();
  _rafTime = 0;
  _rafCallbacks.clear();
  _rafId = 1;

  // Shared virtual clock: performance.now() and requestAnimationFrame both
  // advance off this single counter so duration-based animations (useCountUp)
  // see a coherent, fast-advancing timeline instead of jsdom's slow wall
  // clock.  Each rAF tick jumps the clock forward by a large delta — enough
  // that any animation treats the elapsed time as >= its duration and snaps
  // to its final value on the very first tick.
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
