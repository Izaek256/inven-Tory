/**
 * UI Lab state — DEVELOPMENT ONLY.
 *
 * Every export in this module is gated on `import.meta.env.DEV`, which Vite
 * replaces with the literal `false` for production builds (`vite build`).
 * That compile-time constant is the security boundary: in production builds
 * `isUiLabEnabled()` is `false`, the store never activates, and callers in
 * App.tsx are dead-code eliminated. No query parameter, localStorage flag or
 * runtime check is relied upon for production safety.
 */

import { useSyncExternalStore } from 'react';

/** Mock response profiles applied to intercepted Tauri commands. */
export type LabProfile = 'realistic' | 'empty' | 'slow' | 'error';

export type LabView = 'gallery' | 'preview' | 'scenario';

export interface UiLabState {
  /** True while the lab overlay is mounted/visible. */
  open: boolean;
  /** Which panel the overlay shows. */
  view: LabView;
  /** Currently previewed registry entry id (also the active scenario id). */
  entryId: string | null;
  /** Mock response profile used by the invoke interceptor. */
  profile: LabProfile;
  /**
   * Persisted startup scenario id. When set, the lab re-opens in scenario
   * mode on the next app boot and App.tsx skips its real bootstrap so the
   * scenario is what the user sees instead of the real startup flow.
   */
  startupScenario: string | null;
}

/** localStorage key for the persisted startup scenario override. */
export const STARTUP_SCENARIO_KEY = 'inven_tory_ui_lab_startup_v1';

export function isUiLabEnabled(): boolean {
  return import.meta.env.DEV;
}

function readPersistedScenario(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = localStorage.getItem(STARTUP_SCENARIO_KEY);
    return raw ? ((JSON.parse(raw) as { scenarioId?: string } | null)?.scenarioId ?? null) : null;
  } catch {
    return null;
  }
}

function persistScenario(scenarioId: string | null): void {
  try {
    if (scenarioId === null) localStorage.removeItem(STARTUP_SCENARIO_KEY);
    else localStorage.setItem(STARTUP_SCENARIO_KEY, JSON.stringify({ scenarioId }));
  } catch {
    // Storage unavailable — override simply won't survive reloads.
  }
}

function initialState(): UiLabState {
  const startupScenario = readPersistedScenario();
  return {
    open: startupScenario !== null,
    view: startupScenario !== null ? 'scenario' : 'gallery',
    entryId: startupScenario,
    profile: 'realistic',
    startupScenario,
  };
}

let state: UiLabState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getUiLabState(): UiLabState {
  return state;
}

export function subscribeUiLab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setUiLab(patch: Partial<UiLabState>): void {
  if (!import.meta.env.DEV) return;
  const next = { ...state, ...patch };
  if (
    next.open === state.open &&
    next.view === state.view &&
    next.entryId === state.entryId &&
    next.profile === state.profile &&
    next.startupScenario === state.startupScenario
  ) {
    return;
  }
  state = next;
  emit();
}

export function openUiLab(entryId?: string): void {
  setUiLab({ open: true, view: entryId ? 'preview' : 'gallery', entryId: entryId ?? null });
}

export function closeUiLab(): void {
  setUiLab({ open: false, view: 'gallery', entryId: null });
}

/**
 * Activate (or clear) the persisted startup scenario override.
 * Set: lab re-opens in scenario mode now and on every app boot (dev only).
 * Clear: previous mode is restored and App.tsx bootstrap resumes on exit.
 */
export function setStartupScenario(scenarioId: string | null): void {
  if (!import.meta.env.DEV) return;
  persistScenario(scenarioId);
  if (scenarioId === null) {
    setUiLab({ startupScenario: null, view: 'gallery', entryId: null });
  } else {
    setUiLab({ startupScenario: scenarioId, entryId: scenarioId, view: 'scenario', open: true });
  }
}

/** React subscription hook — always returns `false` in production builds. */
export function useUiLabState(): UiLabState {
  return useSyncExternalStore(
    subscribeUiLab,
    () => getUiLabState(),
    () => DEFAULT_SNAPSHOT,
  );
}

/** Convenience for App.tsx: whether the lab currently suppresses bootstrap. */
export function useUiLabOpen(): boolean {
  return useSyncExternalStore(
    subscribeUiLab,
    () => (import.meta.env.DEV ? getUiLabState().open : false),
    () => false,
  );
}

const DEFAULT_SNAPSHOT: UiLabState = {
  open: false,
  view: 'gallery',
  entryId: null,
  profile: 'realistic',
  startupScenario: null,
};
