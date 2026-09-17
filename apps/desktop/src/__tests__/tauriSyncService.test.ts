/**
 * tauriSyncService tests
 *
 * Tests the enhanced sync service with restore mode functionality.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { triggerSync } from '../services/tauriSyncService';
import type { SyncConfig } from '../services/tauriSyncService';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock auth service
vi.mock('../services/tauriAuthService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/tauriAuthService')>();
  return {
    ...actual,
    getAccessToken: vi.fn(),
  };
});

describe('tauriSyncService — Restore Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stores: [],
        users: [],
        products: [],
        stock_balances: [],
        recent_transactions: [],
        server_time: '2024-01-01T00:00:00Z',
      }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects restore mode from config', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue({
      stores: [
        {
          id: 'STORE-1',
          code: 'MAIN',
          name: 'Main Store',
          address: '123 Test St',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      users: [
        {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'GLOBAL_ADMIN',
          assigned_store_id: 'STORE-1',
          is_active: true,
        },
      ],
      products: [
        {
          id: 'PROD-1',
          sku: 'SKU-001',
          name: 'Test Product',
          brand: null,
          model: null,
          category: 'General',
          unit: 'pcs',
          barcode: null,
          alternate_names: null,
          serial_tracking_enabled: false,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      stock_balances: [
        {
          id: 'BAL-1',
          store_id: 'STORE-1',
          product_id: 'PROD-1',
          stock_bucket: 'AVAILABLE',
          quantity: 100,
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      recent_transactions: [],
      server_time: '2024-01-01T00:00:00Z',
    });

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
      onProgress: vi.fn(),
    };

    const result = await triggerSync(config);

    expect(result).toBeDefined();
    expect(invoke).toHaveBeenCalledWith('apply_restore_critical', expect.any(Object));
  });

  it('calls progress callback during restore', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue({
      stores: [],
      users: [],
      products: [],
      stock_balances: [],
      recent_transactions: [],
      server_time: '2024-01-01T00:00:00Z',
    });

    const onProgress = vi.fn();

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
      onProgress,
    };

    await triggerSync(config);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'critical_restore',
        currentStep: expect.stringContaining('Validating'),
        progressPercent: 5,
        criticalComplete: false,
        canUseApp: false,
        totalComplete: false,
      }),
    );
  });

  it('marks critical complete after critical restore', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue({
      stores: [],
      users: [],
      products: [],
      stock_balances: [],
      recent_transactions: [],
      server_time: '2024-01-01T00:00:00Z',
    });

    const onProgress = vi.fn();

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
      onProgress,
    };

    await triggerSync(config);

    // Check that final progress call has critical_complete: true
    const finalCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(finalCall[0]).toMatchObject({
      phase: 'critical_restore',
      criticalComplete: true,
      canUseApp: true,
      totalComplete: false,
    });
  });

  it('handles restore mode when no access token available', async () => {
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue(null);

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      mode: 'restore',
    };

    const result = await triggerSync(config);

    expect(result.lastOutcome).toBe('offline');
  });

  it('fetches critical data from correct endpoint', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue({
      stores: [],
      users: [],
      products: [],
      stock_balances: [],
      recent_transactions: [],
      server_time: '2024-01-01T00:00:00Z',
    });

    // Mock fetch globally
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stores: [],
        users: [],
        products: [],
        stock_balances: [],
        recent_transactions: [],
        server_time: '2024-01-01T00:00:00Z',
      }),
    }) as any;

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
    };

    await triggerSync(config);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/restore/critical',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('applies critical data to local database', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue({
      stores: [
        {
          id: 'STORE-1',
          code: 'MAIN',
          name: 'Main Store',
          address: '123 Test St',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      users: [],
      products: [],
      stock_balances: [],
      recent_transactions: [],
      server_time: '2024-01-01T00:00:00Z',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stores: [
          {
            id: 'STORE-1',
            code: 'MAIN',
            name: 'Main Store',
            address: '123 Test St',
            is_active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        users: [],
        products: [],
        stock_balances: [],
        recent_transactions: [],
        server_time: '2024-01-01T00:00:00Z',
      }),
    }) as any;

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
    };

    await triggerSync(config);

    expect(invoke).toHaveBeenCalledWith('apply_restore_critical', expect.any(Object));
  });

  it('handles restore server errors gracefully', async () => {
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
    };

    const result = await triggerSync(config);

    expect(result.lastOutcome).toBe('error');
    expect(result.lastError).toBe('Network error');
  });
});

describe('tauriSyncService — Incremental Mode (Default)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses incremental mode by default', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue([]);

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
    };

    await triggerSync(config);

    // Should not call restore endpoints
    expect(invoke).not.toHaveBeenCalledWith('apply_restore_critical');
  });

  it('does not call progress callback in incremental mode', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue([]);

    const onProgress = vi.fn();

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      onProgress,
    };

    await triggerSync(config);

    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('tauriSyncService — Mixed Mode Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents concurrent sync runs', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');
    vi.mocked(invoke).mockResolvedValue([]);

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
    };

    // Start first sync
    const firstSync = triggerSync(config);

    // Try second sync while first is running
    const secondSync = triggerSync(config);

    const [firstResult, secondResult] = await Promise.all([firstSync, secondSync]);

    // Second should return without running
    expect(secondResult.lastOutcome).toEqual(firstResult.lastOutcome);
    expect(secondResult.isOnline).toEqual(firstResult.isOnline);
  });

  it('respects abort signal in restore mode', async () => {
    const { getAccessToken } = await import('../services/tauriAuthService');

    vi.mocked(getAccessToken).mockResolvedValue('test-token');

    const abortController = new AbortController();
    abortController.abort();

    const config: SyncConfig = {
      apiBaseUrl: 'http://localhost:8000/api/v1',
      accessToken: 'test-token',
      mode: 'restore',
      signal: abortController.signal,
    };

    const result = await triggerSync(config);

    expect(result.lastOutcome).toBe('error');
  });
});
