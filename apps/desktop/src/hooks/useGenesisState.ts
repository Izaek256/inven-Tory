import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';

export interface GenesisState {
  ready: boolean;
  has_user_with_pin: boolean;
  has_any_store: boolean;
  has_tables: boolean;
}

export interface GenesisResult {
  success: boolean;
  message: string;
  username: string | null;
  store_code: string | null;
}

export interface RestorePreview {
  stores_count: number;
  products_count: number;
  transactions_count: number;
  last_sync_timestamp: string;
  estimated_critical_time_seconds: number;
  estimated_total_time_minutes: number;
}

export interface RestoreProgress {
  phase: string;
  current_step: string;
  progress_percent: number;
  critical_complete: boolean;
  can_use_app: boolean;
  total_complete: boolean;
}

export interface UseGenesisStateReturn {
  state: GenesisState | null;
  loading: boolean;
  runningGenesis: boolean;
  error: string | null;
  checkState: () => Promise<GenesisState | null>;
  runGenesis: (params: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: string;
    storeCode: string;
    storeName: string;
    storeAddress?: string;
    apiBaseUrl?: string;
  }) => Promise<{
    success: boolean;
    result: GenesisResult | null;
    newState: GenesisState | null;
    error?: string;
  }>;
  needsGenesis: boolean;
  validateRestore: (params: {
    apiBaseUrl: string;
    username: string;
    password: string;
  }) => Promise<{ success: boolean; preview: RestorePreview | null; error: string | null }>;
  startRestore: (params: {
    apiBaseUrl: string;
    username: string;
    password: string;
  }) => Promise<{ success: boolean; error: string | null }>;
  getRestoreProgress: () => Promise<{
    success: boolean;
    progress: RestoreProgress | null;
    error: string | null;
  }>;
}

/**
 * Hook to check and run genesis setup for first-time app installation.
 *
 * Genesis is needed when:
 * - The local SQLite database has no user with a pin_hash set
 * - This means the app has never been set up on this machine
 *
 * The hook:
 * 1. Checks genesis state on mount
 * 2. Provides a runGenesis() function to trigger the setup
 * 3. Re-checks state after running genesis
 */
export function useGenesisState(): UseGenesisStateReturn {
  const [state, setState] = useState<GenesisState | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningGenesis, setRunningGenesis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkState = useCallback(async (): Promise<GenesisState | null> => {
    try {
      const result = await invoke<GenesisState>('check_genesis_state');
      setState(result);
      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useGenesisState] check failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const runGenesis = useCallback(
    async (params: {
      username: string;
      email: string;
      fullName: string;
      password: string;
      role: string;
      storeCode: string;
      storeName: string;
      storeAddress?: string;
      apiBaseUrl?: string;
    }) => {
      setRunningGenesis(true);
      setError(null);
      try {
        // Tauri v2 #[tauri::command] uses rename_all="camelCase" by default,
        // so Rust param `full_name` expects JS key `fullName` — no conversion needed.
        const result = await invoke<GenesisResult>('run_genesis', {
          username: params.username,
          email: params.email,
          fullName: params.fullName,
          password: params.password,
          role: params.role,
          storeCode: params.storeCode,
          storeName: params.storeName,
          storeAddress: params.storeAddress,
          apiBaseUrl: params.apiBaseUrl,
        });
        if (result.success) {
          // Re-check state to confirm
          const newState = await checkState();
          return { success: true, result, newState };
        } else {
          return { success: false, result, newState: null };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return {
          success: false,
          result: { success: false, message: msg, username: null, store_code: null },
          newState: null,
        };
      } finally {
        setRunningGenesis(false);
      }
    },
    [checkState],
  );

  useEffect(() => {
    checkState();
  }, [checkState]);

  return {
    state,
    loading,
    runningGenesis,
    error,
    checkState,
    runGenesis,
    needsGenesis: state ? !state.ready : true,
    validateRestore: useCallback(
      async (params: { apiBaseUrl: string; username: string; password: string }) => {
        try {
          // Convert camelCase to snake_case for Rust backend
          const rustParams = {
            api_base_url: params.apiBaseUrl,
            username: params.username,
            password: params.password,
          };
          const result = await invoke<RestorePreview>('validate_restore_credentials', {
            creds: rustParams,
          });
          return { success: true, preview: result, error: null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, preview: null, error: msg };
        }
      },
      [],
    ),
    startRestore: useCallback(
      async (params: { apiBaseUrl: string; username: string; password: string }) => {
        try {
          // Convert camelCase to snake_case for Rust backend
          const rustParams = {
            api_base_url: params.apiBaseUrl,
            username: params.username,
            password: params.password,
          };
          await invoke<string>('start_prioritized_restore', { creds: rustParams });
          return { success: true, error: null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: msg };
        }
      },
      [],
    ),
    getRestoreProgress: useCallback(async () => {
      try {
        const result = await invoke<RestoreProgress>('get_restore_progress');
        return { success: true, progress: result, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, progress: null, error: msg };
      }
    }, []),
  };
}
