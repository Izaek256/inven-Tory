/**
 * useCountUp — brief count-up animation for KPI tile values (Task E).
 *
 * Animates a number from 0 to `target` on first appearance, then from the
 * previous displayed value to the new one on live updates. Uses a single
 * requestAnimationFrame loop with an ease-out curve (~700ms) so it reads as
 * "settle", not a gimmick. Snaps instantly when the user prefers reduced
 * motion or rAF is unavailable, so tests/SSR/AT never see a stuck 0.
 */
import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(target: number, durationMs: number = DEFAULT_DURATION_MS): number {
  const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [display, setDisplay] = useState<number>(() =>
    typeof requestAnimationFrame === 'undefined' || durationMs <= 0 || prefersReducedMotion()
      ? target
      : 0,
  );
  const displayedRef = useRef<number>(display);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = displayedRef.current;
    if (from === target) {
      displayedRef.current = target;
      setDisplay(target);
      return undefined;
    }
    if (typeof requestAnimationFrame === 'undefined' || durationMs <= 0 || prefersReducedMotion()) {
      displayedRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const start = performance.now();
    // Read the clock inside the tick (do NOT trust the rAF callback timestamp —
    // its time origin differs between browsers and jsdom) and clamp progress to
    // [0, 1] so a clock hiccup can never overshoot past the target value.
    const tick = (): void => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / durationMs));
      const next = Math.round(from + (target - from) * easeOutCubic(t));
      displayedRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return (): void => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}
