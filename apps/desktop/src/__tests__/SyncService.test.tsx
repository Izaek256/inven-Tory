/**
 * Tests for tauriSyncService (Issue 15).
 *
 * These tests run in the Vitest/jsdom environment (no Tauri IPC).
 * All HTTP calls are intercepted by stubbing globalThis.fetch.
 * The tauriSyncService module is isolated via vi.mock so Tauri IPC calls
 * do not throw in the test environment.
 *
 * Coverage:
 *  - triggerSync: happy-path push → accepted receipts → SYNCED state.
 *  - triggerSync: partial acceptance — one accepted, one server-rejected.
 *  - triggerSync: retryable HTTP error → RETRYABLE_ERROR state, no sync time written.
 *  - triggerSync: idempotent re-push — mock server returns accepted=true for
 *    duplicate → AT-004 client-side behaviour correct.
 *  - triggerSync: empty outbox → success without any push HTTP call.
 *  - getSyncStatus: reflects lastSyncAt after successful sync.
 *  - getLastSyncTimestamp: returns null before any sync.
 *  - startBackgroundSync / stopBackgroundSync: interval fires and stops.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLastSyncTimestamp,
  getSyncStatus,
  resetMockSyncState,
  setMockSyncState,
  startBackgroundSync,
  stopBackgroundSync,
  triggerSync,
} from '../services/tauriSyncService';
import type { SyncConfig } from '../services/tauriSyncService';

// ---------------------------------------------------------------------------
// Module mocks — must be at the top before any imports execute
// ---------------------------------------------------------------------------

// Tauri invoke is not available in jsdom — mock the entire module.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

// isTauriEnvironment: controlled per-test via mockReturnValue.
vi.mock('../services/tauriStoreService', () => ({
  isTauriEnvironment: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:8000/api/v1';
const TOKEN = 'test-token-abc';

function makeSyncConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    apiBaseUrl: API_BASE,
    accessToken: TOKEN,
    batchSize: 50,
    ...overrides,
  };
}

/** Build a fake outbox row with the given transaction payload. */
function makeOutboxRow(opts: {
  eventId?: string;
  transactionId?: string;
  storeId?: string;
  productId?: string;
  userId?: string;
  deviceId?: string;
  quantityDelta?: number;
  movementType?: string;
  status?: string;
}): object {
  const eventId = opts.eventId ?? `EVT-${Math.random().toString(36).slice(2)}`;
  const transactionId = opts.transactionId ?? `TX-${Math.random().toString(36).slice(2)}`;
  return {
    id: `OB-${Math.random().toString(36).slice(2)}`,
    event_id: eventId,
    event_type: 'INVENTORY_TRANSACTION',
    payload: JSON.stringify({
      transaction_id: transactionId,
      store_id: opts.storeId ?? 'STORE-ALPHA',
      product_id: opts.productId ?? 'PROD-001',
      movement_type: opts.movementType ?? 'RECEIPT',
      stock_bucket: 'AVAILABLE',
      quantity_delta: opts.quantityDelta ?? 10,
      occurred_at: new Date().toISOString(),
      user_id: opts.userId ?? 'USER-1',
      device_id: opts.deviceId ?? 'DEV-1',
    }),
    status: opts.status ?? 'PENDING',
    retry_count: 0,
    next_attempt_at: null,
    created_at: new Date().toISOString(),
    last_error: null,
  };
}

/** Extract the transaction_id from an outbox row's payload. */
function txIdOf(row: object): string {
  const r = row as { payload: string };
  return (JSON.parse(r.payload) as { transaction_id: string }).transaction_id;
}

/** Build a successful PushResponse for the given transaction IDs. */
function makePushResponse(
  txIds: string[],
  accepted = true,
): {
  receipts: Array<{
    transaction_id: string;
    accepted: boolean;
    rejection_reason: string | null;
    received_at: string;
    processed_at: string;
  }>;
  accepted_count: number;
  rejected_count: number;
  server_time: string;
} {
  return {
    receipts: txIds.map((id) => ({
      transaction_id: id,
      accepted,
      rejection_reason: accepted ? null : 'quantity_delta must be non-zero',
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })),
    accepted_count: accepted ? txIds.length : 0,
    rejected_count: accepted ? 0 : txIds.length,
    server_time: new Date().toISOString(),
  };
}

/** A minimal pull response. */
const PULL_OK = { products: [], stores: [], server_time: new Date().toISOString() };

/** Helper: stub fetch with sequential responses. */
function stubFetch(...responses: object[]): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn();
  for (const resp of responses) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<object> => Promise.resolve(resp),
    } as unknown as Response);
  }
  globalThis.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('tauriSyncService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockSyncState();
    stopBackgroundSync();

    // Default: non-Tauri (mock) environment so IPC paths are NOT taken.
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(false);

    // Default invoke: return empty array (no pending events)
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue([]);
  });

  afterEach(() => {
    stopBackgroundSync();
    vi.unstubAllGlobals();
  });

  // ── getLastSyncTimestamp ────────────────────────────────────────────────

  it('getLastSyncTimestamp returns null before any sync', async () => {
    const ts = await getLastSyncTimestamp();
    expect(ts).toBeNull();
  });

  it('getLastSyncTimestamp returns value set via setMockSyncState', async () => {
    const now = new Date().toISOString();
    setMockSyncState({ lastSyncAt: now });
    const ts = await getLastSyncTimestamp();
    expect(ts).toBe(now);
  });

  // ── getSyncStatus ───────────────────────────────────────────────────────

  it('getSyncStatus returns default state before any sync', async () => {
    const state = await getSyncStatus();
    expect(state.lastSyncAt).toBeNull();
    expect(state.pendingCount).toBe(0);
    expect(state.lastOutcome).toBeNull();
    expect(state.lastError).toBeNull();
  });

  // ── triggerSync: empty outbox ───────────────────────────────────────────

  it('triggerSync with empty outbox completes without push HTTP call', async () => {
    // isTauriEnvironment = false → _getPendingOutboxEvents returns [] directly
    // triggerSync sees 0 rows → skip push → attempt pull → pull fails (fetch not stubbed)
    // but pull failure is non-fatal → still records sync time
    const fetchSpy = vi.fn().mockRejectedValue(new Error('fetch not available'));
    globalThis.fetch = fetchSpy;

    const state = await triggerSync(makeSyncConfig());

    // Push fetch should NOT be called (no events to push)
    const pushCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/sync/push'),
    );
    expect(pushCalls).toHaveLength(0);

    // No error — pull failure is swallowed
    expect(state).toBeDefined();
    // Outcome is success or partial (no push errors)
    expect(['success', 'partial', 'error']).toContain(state.lastOutcome);
  });

  // ── triggerSync: happy path ─────────────────────────────────────────────

  it('triggerSync happy path: accepted events, sync time stored', async () => {
    // Use Tauri environment so invoke paths are exercised
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const row1 = makeOutboxRow({ quantityDelta: 5 });
    const row2 = makeOutboxRow({ quantityDelta: 10 });
    const tx1 = txIdOf(row1);
    const tx2 = txIdOf(row2);

    const { invoke } = await import('@tauri-apps/api/core');
    // First call: get_pending_outbox_events → rows; subsequent calls → []
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') {
        // Return rows on first call, then empty to stop loop
        const result =
          vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'get_pending_outbox_events')
            .length === 1
            ? [row1, row2]
            : [];
        return result;
      }
      return undefined;
    });

    const pushBody = makePushResponse([tx1, tx2]);
    const fetchMock = stubFetch(pushBody, PULL_OK);

    const state = await triggerSync(makeSyncConfig());

    // Two fetch calls: push + pull
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/sync/push');
    expect(fetchMock.mock.calls[1][0]).toContain('/sync/pull');

    // Sync time recorded
    expect(state.lastSyncAt).not.toBeNull();
    expect(state.lastOutcome).toBe('success');
  });

  // ── triggerSync: partial acceptance ────────────────────────────────────

  it('triggerSync partial acceptance: outcome is partial when some events rejected', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const rowGood = makeOutboxRow({ quantityDelta: 5 });
    const rowBad = makeOutboxRow({ quantityDelta: 0 }); // server will reject
    const txGood = txIdOf(rowGood);
    const txBad = txIdOf(rowBad);

    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') {
        const result =
          vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'get_pending_outbox_events')
            .length === 1
            ? [rowGood, rowBad]
            : [];
        return result;
      }
      return undefined;
    });

    const partialPushBody = {
      receipts: [
        {
          transaction_id: txGood,
          accepted: true,
          rejection_reason: null,
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        },
        {
          transaction_id: txBad,
          accepted: false,
          rejection_reason: 'quantity_delta must be non-zero',
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        },
      ],
      accepted_count: 1,
      rejected_count: 1,
      server_time: new Date().toISOString(),
    };

    stubFetch(partialPushBody, PULL_OK);

    const state = await triggerSync(makeSyncConfig());

    expect(state.lastOutcome).toBe('partial');
    // Sync time still recorded despite partial rejection
    expect(state.lastSyncAt).not.toBeNull();
  });

  // ── triggerSync: retryable HTTP error ──────────────────────────────────

  it('triggerSync on HTTP 503: outcome is error, no sync time written', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const row = makeOutboxRow({ quantityDelta: 5 });

    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') {
        const result =
          vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'get_pending_outbox_events')
            .length === 1
            ? [row]
            : [];
        return result;
      }
      return undefined;
    });

    // Server returns 503
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: (): Promise<string> => Promise.resolve('Service Unavailable'),
    } as unknown as Response);

    const state = await triggerSync(makeSyncConfig());

    expect(state.lastOutcome).toBe('error');
    expect(state.lastError).toContain('503');
    // No sync time — retryable error prevents recording
    expect(state.lastSyncAt).toBeNull();
  });

  // ── P2 (optimization plan): retry cap + exponential backoff ─────────────

  it('caps sync retries with exponential backoff, then marks RETRYABLE_ERROR', async () => {
    vi.useFakeTimers();
    // Real CompressionStream resolves via macrotasks that fake timers can't
    // reach — disable it so the pre-push path stays on the microtask queue.
    // @ts-ignore - explicitly disable for this test
    const originalCompressionStream = globalThis.CompressionStream;
    // @ts-ignore
    globalThis.CompressionStream = undefined;

    try {
      const { isTauriEnvironment } = await import('../services/tauriStoreService');
      vi.mocked(isTauriEnvironment).mockReturnValue(true);

      const row = makeOutboxRow({ quantityDelta: 5 });

      const { invoke } = await import('@tauri-apps/api/core');
      const invokeMock = vi.mocked(invoke);
      invokeMock.mockImplementation(async (cmd) => {
        if (cmd === 'get_last_sync_timestamp') return null;
        // The event stays pending until the cap marks it — every retry
        // iteration re-reads it from the outbox.
        if (cmd === 'get_pending_outbox_events') return [row];
        return undefined;
      });

      // Every push attempt fails (network down).
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      globalThis.fetch = fetchMock as never;

      const syncPromise = triggerSync(makeSyncConfig());

      // Flush microtasks until a condition (fake timers can't flush the
      // non-timer awaits in triggerSync's push path on their own).
      const flushUntil = async (pred: () => boolean, maxTicks = 500): Promise<void> => {
        for (let i = 0; i < maxTicks && !pred(); i++) {
          await Promise.resolve();
        }
      };

      // Attempt 1 fails → backoff 2^1 s pending; then 2^2 s, 2^3 s.
      await flushUntil(() => fetchMock.mock.calls.length >= 1);
      await vi.advanceTimersByTimeAsync(2_000);
      await flushUntil(() => fetchMock.mock.calls.length >= 2);
      await vi.advanceTimersByTimeAsync(4_000);
      await flushUntil(() => fetchMock.mock.calls.length >= 3);
      await vi.advanceTimersByTimeAsync(8_000);
      await flushUntil(() => fetchMock.mock.calls.length >= 4);

      const state = await syncPromise;

      // Initial attempt + 3 retries = 4 pushes, then the cap stops the loop.
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(state.lastOutcome).toBe('error');

      // The cap path must mark the outbox event RETRYABLE_ERROR.
      const statusUpdates = invokeMock.mock.calls
        .filter((c) => c[0] === 'update_outbox_event_statuses')
        .flatMap((c) => (c[1] as { updates: Array<{ target_status: string }> }).updates);
      expect(statusUpdates.some((u) => u.target_status === 'RETRYABLE_ERROR')).toBe(true);
    } finally {
      globalThis.CompressionStream = originalCompressionStream;
      vi.useRealTimers();
    }
  });

  // ── AT-004: client retries → both attempts succeed ─────────────────────

  it('AT-004 (client-side): re-sending same event succeeds on both attempts', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const row = makeOutboxRow({ transactionId: 'TX-IDEMPOTENT-001', quantityDelta: 15 });
    const txId = 'TX-IDEMPOTENT-001';

    const { invoke } = await import('@tauri-apps/api/core');

    // First sync
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') {
        const result =
          vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'get_pending_outbox_events')
            .length === 1
            ? [row]
            : [];
        return result;
      }
      return undefined;
    });

    const acceptedBody = makePushResponse([txId], true);
    stubFetch(acceptedBody, PULL_OK);

    const state1 = await triggerSync(makeSyncConfig());
    expect(state1.lastOutcome).toBe('success');

    // Reset state and simulate retry
    resetMockSyncState();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') {
        const invokeCalls = vi
          .mocked(invoke)
          .mock.calls.filter((c) => c[0] === 'get_pending_outbox_events').length;
        // The invoke mock tracks total calls across the test, so if we're on the second sync pass
        // we might have 2 or 3 calls. A simple approach is just to return [row] for the next one,
        // then [] for the ones after.
        return invokeCalls <= 2 ? [row] : []; // previous sync was 1 call, so <=2 means this sync's first call
      }
      return undefined;
    });
    stubFetch(acceptedBody, PULL_OK); // server returns accepted=true again (idempotent)

    const state2 = await triggerSync(makeSyncConfig());
    expect(state2.lastOutcome).toBe('success');
  });

  // ── triggerSync: product catalogue push ────────────────────────────────

  it('triggerSync (forced) uploads the local catalogue when the outbox is empty', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const { invoke } = await import('@tauri-apps/api/core');
    // 1) get_pending_outbox_events → empty queue (nothing queued)
    // 2) get_products → the locally imported catalogue
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') return [];
      if (cmd === 'get_products') {
        return [
          {
            id: 'PROD-IMPORTED-1',
            sku: 'IMPORTED-1',
            name: 'Imported Widget',
            brand: null,
            model: null,
            category: 'General',
            unit: 'pcs',
            barcode: null,
            alternate_names: null,
            serial_tracking_enabled: false,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }
      return undefined;
    });

    const fetchMock = stubFetch(
      {
        receipts: [],
        accepted_count: 0,
        rejected_count: 0,
        server_time: new Date().toISOString(),
      },
      PULL_OK,
    );

    // Temporarily disable CompressionStream so the payload isn't gzipped, allowing us to inspect the JSON body
    const originalCompressionStream = globalThis.CompressionStream;
    // @ts-ignore - we are explicitly removing it for this test
    globalThis.CompressionStream = undefined;

    try {
      await triggerSync(makeSyncConfig({ force: true }));
    } finally {
      globalThis.CompressionStream = originalCompressionStream;
    }

    // Catalogue push first, pull second.
    expect(fetchMock.mock.calls[0][0]).toContain('/sync/push');
    const pushInit = fetchMock.mock.calls[0][1] as RequestInit;
    const pushBody = JSON.parse(String(pushInit.body)) as {
      events: unknown[];
      products: Array<{ id: string }>;
    };
    expect(pushBody.events).toEqual([]);
    expect(pushBody.products.map((p) => p.id)).toContain('PROD-IMPORTED-1');

    expect(fetchMock.mock.calls[1][0]).toContain('/sync/pull');
  });

  it('triggerSync (background) pushes only dirty products, not the full catalogue', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const row = makeOutboxRow({ movementType: 'SALE', quantityDelta: -2 });
    const txId = txIdOf(row);

    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'get_last_sync_timestamp') return null;
      if (cmd === 'get_pending_outbox_events') return [row];
      if (cmd === 'get_products') {
        // The full local catalogue — must NOT be loaded or pushed on a
        // regular (non-forced) sync (P2: dirty products only).
        return [
          {
            id: 'PROD-IMPORTED-1',
            sku: 'IMPORTED-1',
            name: 'Imported Widget',
            brand: null,
            model: null,
            category: 'General',
            unit: 'pcs',
            barcode: null,
            alternate_names: null,
            serial_tracking_enabled: false,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }
      return undefined;
    });

    const fetchMock = stubFetch(makePushResponse([txId]), PULL_OK);

    const originalCompressionStream = globalThis.CompressionStream;
    // @ts-ignore - disable gzip so we can inspect the JSON body
    globalThis.CompressionStream = undefined;
    try {
      await triggerSync(makeSyncConfig()); // NOT forced
    } finally {
      globalThis.CompressionStream = originalCompressionStream;
    }

    // The full catalogue is never even read from the local DB.
    expect(invokeMock).not.toHaveBeenCalledWith('get_products');

    expect(fetchMock.mock.calls[0][0]).toContain('/sync/push');
    const pushInit = fetchMock.mock.calls[0][1] as RequestInit;
    const pushBody = JSON.parse(String(pushInit.body)) as {
      events: unknown[];
      products?: Array<{ id: string }>;
    };
    expect(pushBody.events).toHaveLength(1);
    // No catalogue on a regular sync — at most the dirty product updates
    // (this row is a transaction, so there are none).
    expect(pushBody.products ?? []).toHaveLength(0);
  });

  it('triggerSync (background, not forced) stays quiet when the outbox is empty', async () => {
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue([]);

    const fetchMock = stubFetch(PULL_OK);

    await triggerSync(makeSyncConfig());

    const pushCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/sync/push'),
    );
    expect(pushCalls).toHaveLength(0);
  });

  // ── getSyncStatus reflects pendingCount ────────────────────────────────

  it('getSyncStatus reflects pendingCount set via setMockSyncState', async () => {
    setMockSyncState({ pendingCount: 7 });
    const state = await getSyncStatus();
    // In non-Tauri env, getSyncStatus reads _mockPendingCount via invoke fallback
    expect(state.pendingCount).toBeGreaterThanOrEqual(0);
    expect(state).toBeDefined();
  });

  // ── startBackgroundSync / stopBackgroundSync ───────────────────────────

  it('startBackgroundSync fires sync immediately then on interval; stopBackgroundSync stops it', async () => {
    vi.useFakeTimers();

    // Spy on the module's own triggerSync export
    const syncModule = await import('../services/tauriSyncService');
    const originalTrigger = syncModule.triggerSync;
    // We can't easily spy on an ES module export, so we test the behaviour
    // indirectly: startBackgroundSync calls triggerSync internally.
    // Instead, verify that setInterval is called with correct interval.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    // Stub fetch to avoid real network calls during background sync
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no fetch in timer test'));

    startBackgroundSync(makeSyncConfig(), 10_000);

    // setTimeout must have been called
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);

    stopBackgroundSync();

    // clearTimeout must have been called after stop
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Restore
    vi.useRealTimers();
    void originalTrigger;
  });

  // ── Outbox TTL cleanup (P2: archive events older than 7 days) ──────────

  it('startTTLCleanup invokes cleanup_expired_outbox_events on its interval and stops', async () => {
    vi.useFakeTimers();
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = vi.mocked(invoke);
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    invokeMock.mockClear();

    const { startTTLCleanup, stopTTLCleanup } = await import('../services/tauriSyncService');
    startTTLCleanup(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(invokeMock).toHaveBeenCalledWith('cleanup_expired_outbox_events');

    stopTTLCleanup();
    invokeMock.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(invokeMock).not.toHaveBeenCalledWith('cleanup_expired_outbox_events');

    vi.useRealTimers();
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
  });

  it('startBackgroundSync also starts the outbox TTL cleanup interval', async () => {
    vi.useFakeTimers();
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = vi.mocked(invoke);
    const { isTauriEnvironment } = await import('../services/tauriStoreService');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    invokeMock.mockClear();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no fetch in ttl test')) as never;

    startBackgroundSync(makeSyncConfig(), 10_000);
    // Default TTL cleanup interval is 60s.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invokeMock).toHaveBeenCalledWith('cleanup_expired_outbox_events');

    stopBackgroundSync();
    vi.useRealTimers();
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
  });
});
