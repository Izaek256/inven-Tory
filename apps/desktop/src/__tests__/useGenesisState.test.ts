/**
 * useGenesisState hook tests
 *
 * Tests the enhanced useGenesisState hook with restore functionality.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useGenesisState } from '../hooks/useGenesisState';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useGenesisState — Basic Genesis Functionality', () => {
  it('initializes with loading state', () => {
    const { result } = renderHook(() => useGenesisState());

    expect(result.current.loading).toBe(true);
    expect(result.current.state).toBeNull();
  });

  it('checks genesis state on mount', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue({
      ready: false,
      has_user_with_pin: false,
      has_any_store: false,
      has_tables: false,
    });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.state).toEqual({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      });
    });
  });

  it('sets needsGenesis to true when state is not ready', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue({
      ready: false,
      has_user_with_pin: false,
      has_any_store: false,
      has_tables: false,
    });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.needsGenesis).toBe(true);
    });
  });

  it('sets needsGenesis to false when state is ready', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue({
      ready: true,
      has_user_with_pin: true,
      has_any_store: true,
      has_tables: true,
    });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.needsGenesis).toBe(false);
    });
  });
});

describe('useGenesisState — Run Genesis', () => {
  it('runs genesis with provided parameters', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'Genesis complete',
        username: 'testuser',
        store_code: 'MAIN',
      })
      .mockResolvedValue({
        ready: true,
        has_user_with_pin: true,
        has_any_store: true,
        has_tables: true,
      });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const genesisResult = await result.current.runGenesis({
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'password123',
      role: 'GLOBAL_ADMIN',
      storeCode: 'MAIN',
      storeName: 'My Store',
      storeAddress: '123 Test St',
      apiBaseUrl: 'http://localhost:8000/api/v1',
    });

    expect(genesisResult.success).toBe(true);
    expect(genesisResult.result?.username).toBe('testuser');
    expect(genesisResult.result?.store_code).toBe('MAIN');
  });

  it('handles genesis run failure', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'Genesis failed',
        username: null,
        store_code: null,
      });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const genesisResult = await result.current.runGenesis({
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'password123',
      role: 'GLOBAL_ADMIN',
      storeCode: 'MAIN',
      storeName: 'My Store',
    });

    expect(genesisResult.success).toBe(false);
    expect(genesisResult.result?.message).toBe('Genesis failed');
  });

  it('passes camelCase parameters to run_genesis command for Tauri backend', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'Genesis complete',
        username: 'testuser',
        store_code: 'MAIN',
      })
      .mockResolvedValue({
        ready: true,
        has_user_with_pin: true,
        has_any_store: true,
        has_tables: true,
      });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.runGenesis({
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'password123',
      role: 'GLOBAL_ADMIN',
      storeCode: 'MAIN',
      storeName: 'My Store',
    });

    expect(invoke).toHaveBeenCalledWith('run_genesis', {
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'password123',
      role: 'GLOBAL_ADMIN',
      storeCode: 'MAIN',
      storeName: 'My Store',
      storeAddress: undefined,
      apiBaseUrl: undefined,
    });
  });
});

describe('useGenesisState — Restore Functionality', () => {
  it('validates restore credentials', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValue({
        stores_count: 5,
        products_count: 100,
        transactions_count: 1000,
        last_sync_timestamp: '2 hours ago',
        estimated_critical_time_seconds: 30,
        estimated_total_time_minutes: 15,
      });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const validateResult = await result.current.validateRestore({
      apiBaseUrl: 'http://localhost:8000/api/v1',
      username: 'testuser',
      password: 'password123',
    });

    expect(validateResult.success).toBe(true);
    expect(validateResult.preview).toEqual({
      stores_count: 5,
      products_count: 100,
      transactions_count: 1000,
      last_sync_timestamp: '2 hours ago',
      estimated_critical_time_seconds: 30,
      estimated_total_time_minutes: 15,
    });
    expect(invoke).toHaveBeenCalledWith('validate_restore_credentials', {
      creds: {
        api_base_url: 'http://localhost:8000/api/v1',
        username: 'testuser',
        password: 'password123',
      },
    });
  });

  it('handles restore validation failure', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const validateResult = await result.current.validateRestore({
      apiBaseUrl: 'http://localhost:8000/api/v1',
      username: 'testuser',
      password: 'wrongpassword',
    });

    expect(validateResult.success).toBe(false);
    expect(validateResult.error).toBe('Invalid credentials');
    expect(invoke).toHaveBeenCalledWith('validate_restore_credentials', {
      creds: {
        api_base_url: 'http://localhost:8000/api/v1',
        username: 'testuser',
        password: 'wrongpassword',
      },
    });
  });

  it('starts prioritized restore', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValue('restore_id_12345');

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const restoreResult = await result.current.startRestore({
      apiBaseUrl: 'http://localhost:8000/api/v1',
      username: 'testuser',
      password: 'password123',
    });

    expect(restoreResult.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith('start_prioritized_restore', {
      creds: {
        api_base_url: 'http://localhost:8000/api/v1',
        username: 'testuser',
        password: 'password123',
      },
    });
  });

  it('handles restore start failure', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockRejectedValue(new Error('Server unreachable'));

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const restoreResult = await result.current.startRestore({
      apiBaseUrl: 'http://localhost:8000/api/v1',
      username: 'testuser',
      password: 'password123',
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toBe('Server unreachable');
  });

  it('gets restore progress', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockResolvedValue({
        phase: 'critical_restore',
        current_step: 'Downloading products and stock balances...',
        progress_percent: 45,
        critical_complete: false,
        can_use_app: false,
        total_complete: false,
      });

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const progressResult = await result.current.getRestoreProgress();

    expect(progressResult.success).toBe(true);
    expect(progressResult.progress).toEqual({
      phase: 'critical_restore',
      current_step: 'Downloading products and stock balances...',
      progress_percent: 45,
      critical_complete: false,
      can_use_app: false,
      total_complete: false,
    });
  });

  it('handles progress retrieval failure', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockRejectedValue(new Error('Restore not in progress'));

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const progressResult = await result.current.getRestoreProgress();

    expect(progressResult.success).toBe(false);
    expect(progressResult.error).toBe('Restore not in progress');
  });
});

describe('useGenesisState — Error Handling', () => {
  it('sets error state when checkState fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValue(new Error('Database error'));

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Database error');
    });
  });

  it('sets runningGenesis during genesis run', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    let resolveGenesis: (value: any) => void;
    const genesisPromise = new Promise((resolve) => {
      resolveGenesis = resolve;
    });

    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ready: false,
        has_user_with_pin: false,
        has_any_store: false,
        has_tables: false,
      })
      .mockReturnValueOnce(genesisPromise);

    const { result } = renderHook(() => useGenesisState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Start genesis (don't await)
    const runPromise = result.current.runGenesis({
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'password123',
      role: 'GLOBAL_ADMIN',
      storeCode: 'MAIN',
      storeName: 'My Store',
    });

    await waitFor(() => {
      expect(result.current.runningGenesis).toBe(true);
    });

    // Resolve genesis
    resolveGenesis!({
      success: true,
      message: 'Genesis complete',
      username: 'testuser',
      store_code: 'MAIN',
    });

    await runPromise;

    await waitFor(() => {
      expect(result.current.runningGenesis).toBe(false);
    });
  });
});
