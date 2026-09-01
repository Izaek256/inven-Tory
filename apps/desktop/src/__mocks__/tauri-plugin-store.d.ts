/**
 * Type declarations for @tauri-apps/plugin-store mock
 *
 * This provides proper TypeScript types for the mock implementation.
 */

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

export function load(
  path: string,
  options?: { autoSave?: boolean }
): Promise<Store>;
