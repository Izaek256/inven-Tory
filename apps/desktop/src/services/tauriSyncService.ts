/**
 * tauriSyncService.
 *
 * Implements the client-side push/pull sync engine:
 *
 *   triggerSync(config)
 *     Push loop: reads PENDING outbox events in batches, posts to
 *     /api/v1/sync/push, marks each event as ACCEPTED/SYNCED or
 *     RETRYABLE_ERROR with exponential backoff (SYNC-011).
 *
 *     Pull loop: fetches /api/v1/sync/pull after a successful push
 *     and upserts the server-side product/store catalogue into local SQLite.
 *
 *     Stores the last-successful-sync timestamp via set_last_sync_timestamp
 *     so the Header can display it.
 *
 *   getLastSyncTimestamp()
 *     Returns the ISO string of the last successful sync, or null.
 *
 *   getSyncStatus()
 *     Returns a snapshot of the current sync state.
 *
 *   Background scheduling (startBackgroundSync / stopBackgroundSync):
 *     Runs triggerSync on a configurable interval (default: 30 s).
 *     Never blocks foreground entry — runs in the background.
 *
 * Design notes
 * ------------
 * * All Tauri IPC calls are guarded by isTauriEnvironment().  In test/web
 *   environments the mock layer is used so tests stay in-process.
 * * Backoff is implemented on the client (SYNC-011): after a retryable
 *   failure the event is set to RETRYABLE_ERROR in SQLite and the next
 *   window's get_pending_outbox_events will skip it until next_attempt_at.
 * * A single global mutex (via a boolean flag) prevents concurrent sync
 *   runs stomping on each other.
 * * The module exports mock helpers so Vitest tests can inject state.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';
import { invalidateStockBalanceCache } from './tauriTransactionService';
import { Product } from '../types/product';
import {
  ClientSyncState,
  OutboxEventRow,
  ProductSnapshot,
  PullResponse,
  PushResponse,
  SyncOutcome,
  TransactionPushItem,
} from '../types/sync';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SyncConfig {
  /** Base URL of the API server, e.g. http://localhost:8000/api/v1 */
  apiBaseUrl: string;
  /**
   * JWT Bearer token for authenticated requests.
   * If omitted, tauriSyncService will attempt to obtain it from tauriAuthService.
   * If null/empty and tauriAuthService returns null (expired offline), sync is
   * skipped but pending transactions are NOT discarded (offline rule).
   */
  accessToken?: string;
  /** Maximum number of outbox events per push request (default: 500). */
  batchSize?: number;
  /** Force sync even if last attempt was recent or if events are in retry backoff. */
  force?: boolean;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Sync mode: incremental (default) or restore (full restore with priorities) */
  mode?: 'incremental' | 'restore';
  /** Progress callback for restore mode */
  onProgress?: (progress: {
    phase: string;
    currentStep: string;
    progressPercent: number;
    criticalComplete: boolean;
    canUseApp: boolean;
    totalComplete: boolean;
  }) => void;
  /** Maximum number of sync retries (default: 3) */
  maxSyncRetries?: number;
  /** Coalescing window in ms before triggering sync (default: 500) */
  coalescingWindowMs?: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingOperation {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  status: 'pending' | 'syncing' | 'confirmed' | 'failed';
  optimisticData?: unknown;
  onProgress?: (progress: number) => void;
}

export interface OutboxEventWithTTL extends OutboxEventRow {
  expires_at: string | null;
}

export type SyncStatusIndicator = 'syncing' | 'synced' | 'error' | 'idle';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Prevent concurrent sync runs. */
let _syncInProgress = false;

/** Handle returned by setTimeout for background sync chaining. */
let _backgroundTimeoutId: ReturnType<typeof setTimeout> | null = null;
let _backgroundSyncActive = false;

/** Coalescing timer for debounced sync triggers. */
let _coalescingTimer: ReturnType<typeof setTimeout> | null = null;

/** Pending operations queue for batch coalescing. */
const pendingOperations: PendingOperation[] = [];

/** Optimistic updates map tracking pending operations. */
const optimisticUpdates = new Map<string, PendingOperation>();

/** Current sync status indicator. */
let _syncStatus: SyncStatusIndicator = 'idle';

// @visibleForTesting
/** In-memory sync state for mock/test environment. */
let _mockPendingCount = 0;
let _mockLastSyncAt: string | null = null;
let _mockLastOutcome: SyncOutcome | null = null;
let _mockLastError: string | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COALESCING_WINDOW_MS = 500;
const MAX_SYNC_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const PULL_PAGE_SIZE = 5000;

// ---------------------------------------------------------------------------
// Mock helpers (for Vitest / web environment)
// ---------------------------------------------------------------------------

/** Reset all mock sync state. Used in beforeEach in tests. */
export function resetMockSyncState(): void {
  _mockLastSyncAt = null;
  _mockPendingCount = 0;
  _mockLastOutcome = null;
  _mockLastError = null;
}

export function setMockSyncState(partial: Partial<ClientSyncState>): void {
  if (partial.lastSyncAt !== undefined) _mockLastSyncAt = partial.lastSyncAt;
  if (partial.pendingCount !== undefined) _mockPendingCount = partial.pendingCount;
  if (partial.lastOutcome !== undefined) _mockLastOutcome = partial.lastOutcome;
  if (partial.lastError !== undefined) _mockLastError = partial.lastError;
}

// ---------------------------------------------------------------------------
// Tauri IPC wrappers
// ---------------------------------------------------------------------------

async function _getPendingOutboxEvents(limit: number, force?: boolean): Promise<OutboxEventRow[]> {
  if (isTauriEnvironment()) {
    return invoke<OutboxEventRow[]>('get_pending_outbox_events', { limit, force: force ?? false });
  }
  return [];
}

/** Batch status transition — one IPC call per push batch instead of per event. */
async function _updateOutboxEventStatuses(
  updates: Array<{ event_id: string; target_status: string; error_msg?: string | null }>,
): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('update_outbox_event_statuses', { updates });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncService] Failed to invoke update_outbox_event_statuses:', err);
      throw err;
    }
  }
}

/** Batch transaction sync-status update — one IPC call per push batch. */
async function _updateTransactionSyncStatuses(
  updates: Array<{
    transaction_id: string;
    sync_status: string;
    server_accepted_at?: string | null;
  }>,
): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('update_transaction_sync_statuses', { updates });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncService] Failed to invoke update_transaction_sync_statuses:', err);
      throw err;
    }
  }
}

async function _getLastSyncTimestamp(): Promise<string | null> {
  if (isTauriEnvironment()) {
    if (_mockLastSyncAt !== null) {
      return _mockLastSyncAt;
    }
    const result = await invoke<string | null | undefined>('get_last_sync_timestamp');
    return result ?? null;
  }
  return _mockLastSyncAt;
}

async function _setLastSyncTimestamp(timestamp: string): Promise<void> {
  _mockLastSyncAt = timestamp;
  if (isTauriEnvironment()) {
    await invoke<void>('set_last_sync_timestamp', { timestamp });
  }
}

// ---------------------------------------------------------------------------
// Public API — timestamp / status
// ---------------------------------------------------------------------------

export async function getLastSyncTimestamp(): Promise<string | null> {
  return _getLastSyncTimestamp();
}

export async function getSyncStatus(): Promise<
  ClientSyncState & { syncStatus?: SyncStatusIndicator }
> {
  const lastSyncAt = await _getLastSyncTimestamp();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  let pendingCount = _mockPendingCount;
  if (isTauriEnvironment()) {
    try {
      pendingCount = await invoke<number>('get_pending_outbox_count');
    } catch {
      pendingCount = 0;
    }
  }

  return {
    lastSyncAt,
    pendingCount,
    isOnline,
    lastOutcome: _mockLastOutcome,
    lastError: _mockLastError,
    syncStatus: _syncStatus,
  };
}

export function getSyncStatusIndicator(): SyncStatusIndicator {
  return _syncStatus;
}

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

async function _compressPayload(data: string): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return new TextEncoder().encode(data);
  }
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  writer.write(new TextEncoder().encode(data));
  writer.close();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fetch helpers with timeout and compression
// ---------------------------------------------------------------------------

function _withTimeout(timeoutMs: number, signal: AbortSignal | undefined): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }
  return controller.signal;
}

/**
 * POST a batch of events to /api/v1/sync/push with optional compression.
 * Returns the PushResponse, or throws on network/HTTP error
 */
async function _httpPush(
  apiBaseUrl: string,
  accessToken: string,
  items: TransactionPushItem[],
  products?: Array<Product | ProductSnapshot>,
  signal?: AbortSignal,
): Promise<PushResponse> {
  const payload: { events: TransactionPushItem[]; products?: Array<Product | ProductSnapshot> } = {
    events: items,
  };
  if (products && products.length > 0) {
    payload.products = products;
  }
  const body = JSON.stringify(payload);
  const compressedBody = await _compressPayload(body);
  const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, signal);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
  if (compressedBody instanceof Uint8Array && compressedBody.length < body.length) {
    headers['Content-Encoding'] = 'gzip';
  }

  const bodyToSend: BodyInit =
    compressedBody instanceof Uint8Array && compressedBody.length < body.length
      ? (compressedBody.buffer.slice(0) as ArrayBuffer)
      : body;

  const response = await fetch(`${apiBaseUrl}/sync/push`, {
    method: 'POST',
    headers,
    body: bodyToSend,
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    // eslint-disable-next-line no-console
    console.error('[SyncService] Push HTTP error:', response.status, text);
    throw new Error(`Push HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<PushResponse>;
}

/**
 * POST to /api/v1/sync/pull and return the response.
 *
 * Uses delta sync (`since`) and page slicing (`limit`/`offset`) so the wire
 * payload stays proportional to the change set.  `since` should be the
 * server_time returned by the previous pull.
 */
async function _httpPull(
  apiBaseUrl: string,
  accessToken: string,
  signal: AbortSignal | undefined,
  options: { since?: string | null; limit?: number; offset?: number } = {},
): Promise<PullResponse> {
  const params = new URLSearchParams();
  if (options.since) {
    params.set('since', options.since);
  }
  if (options.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options.offset && options.offset > 0) {
    params.set('offset', String(options.offset));
  }
  const qs = params.toString();
  const url = `${apiBaseUrl}/sync/pull${qs ? `?${qs}` : ''}`;

  const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, signal);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    // eslint-disable-next-line no-console
    console.error('[SyncService] Pull HTTP error:', response.status, text);
    throw new Error(`Pull HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<PullResponse>;
}

/** Pull page size — server slices the combined stream at the DB level. */

/**
 * Optimized _httpPullAll that always uses pagination with delta sync.
 * Never pulls ALL data at once.
 */
async function _httpPullAll(
  apiBaseUrl: string,
  accessToken: string,
  signal: AbortSignal | undefined,
): Promise<PullResponse> {
  const lastSync = await _getLastSyncTimestamp();
  const since = lastSync || undefined;

  let offset = 0;
  let hasMore = true;
  let merged: PullResponse | null = null;

  while (hasMore) {
    // Abort check
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const page = await _httpPull(apiBaseUrl, accessToken, signal, {
      since,
      limit: PULL_PAGE_SIZE,
      offset,
    });
    if (!merged) {
      merged = page;
    } else {
      merged.products.push(...page.products);
      merged.stores.push(...page.stores);
      if (!merged.stock_balances) {
        merged.stock_balances = [];
      }
      merged.stock_balances.push(...(page.stock_balances ?? []));
    }
    if (page.pagination && page.pagination.has_more) {
      offset = page.pagination.next_offset;
      hasMore = true;
    } else {
      hasMore = false;
    }
  }

  return (
    merged ?? {
      products: [],
      stores: [],
      stock_balances: [],
      server_time: new Date().toISOString(),
    }
  );
}

// ---------------------------------------------------------------------------
// Pending operations queue & batch support
// ---------------------------------------------------------------------------

function _generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Add a stock operation to the pending queue and schedule a debounced sync.
 * Operations within the coalescing window are batched together.
 */
export function enqueueStockOperation(
  operation: Omit<PendingOperation, 'id' | 'timestamp' | 'status'> & { type?: string },
  coalescingWindowMs?: number,
): string {
  const id = _generateId();
  const op: PendingOperation = {
    ...operation,
    id,
    timestamp: Date.now(),
    status: 'pending',
    type: operation.type ?? 'STOCK_UPDATE',
  };
  pendingOperations.push(op);

  // Clear existing timer and set new one
  if (_coalescingTimer) {
    clearTimeout(_coalescingTimer);
  }
  const windowMs = coalescingWindowMs ?? DEFAULT_COALESCING_WINDOW_MS;
  _coalescingTimer = setTimeout(() => {
    _flushPendingOperations();
  }, windowMs);

  return id;
}

function _flushPendingOperations(): void {
  if (_coalescingTimer) {
    clearTimeout(_coalescingTimer);
    _coalescingTimer = null;
  }

  if (pendingOperations.length === 0) return;

  const batch = [...pendingOperations];
  pendingOperations.length = 0;

  // Mark all as syncing
  for (const op of batch) {
    op.status = 'syncing';
    optimisticUpdates.set(op.id, op);
  }

  _syncStatus = 'syncing';

  // Trigger sync with the batched operations
  const envBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;
  const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

  void triggerSync({ apiBaseUrl, force: true }).catch(() => undefined);
}

/**
 * Batch stock operation support: batch multiple stock operations into a single push.
 */
export async function batchStockOperations(
  operations: Array<{ type: string; payload: unknown; onProgress?: (progress: number) => void }>,
  _config: SyncConfig,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];
  const total = operations.length;

  for (let i = 0; i < total; i++) {
    const op = operations[i];
    const id = _generateId();
    const pendingOp: PendingOperation = {
      id,
      type: op.type,
      payload: op.payload,
      timestamp: Date.now(),
      status: 'pending',
      onProgress: op.onProgress,
    };
    optimisticUpdates.set(id, pendingOp);

    try {
      pendingOp.status = 'syncing';
      _syncStatus = 'syncing';

      // Add to outbox via Tauri IPC
      if (isTauriEnvironment()) {
        await invoke('add_outbox_event', {
          eventType: op.type,
          payload: JSON.stringify(op.payload),
        });
      }

      pendingOp.status = 'confirmed';
      optimisticUpdates.set(id, pendingOp);
      succeeded.push(id);
    } catch {
      pendingOp.status = 'failed';
      optimisticUpdates.set(id, pendingOp);
      failed.push(id);
    }

    // Report progress
    if (op.onProgress) {
      op.onProgress(Math.round(((i + 1) / total) * 100));
    }
  }

  _syncStatus = failed.length > 0 ? 'error' : 'synced';

  return { succeeded, failed };
}

/**
 * Rollback an optimistic update on failure.
 */
export function rollbackOptimisticUpdate(id: string): void {
  const op = optimisticUpdates.get(id);
  if (op && op.optimisticData) {
    // Dispatch rollback event for UI to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('optimistic-rollback', {
          detail: { operationId: id, data: op.optimisticData },
        }),
      );
    }
  }
  optimisticUpdates.delete(id);
}

// ---------------------------------------------------------------------------
// TTL-based outbox cleanup
// ---------------------------------------------------------------------------

async function _cleanupExpiredOutboxEvents(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke('cleanup_expired_outbox_events');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncService] Failed to cleanup expired outbox events:', err);
    }
  }
}

/** Periodically clean expired outbox events. */
let _ttlCleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startTTLCleanup(intervalMs: number = 60_000): void {
  if (_ttlCleanupInterval !== null) return;
  _ttlCleanupInterval = setInterval(_cleanupExpiredOutboxEvents, intervalMs);
}

export function stopTTLCleanup(): void {
  if (_ttlCleanupInterval !== null) {
    clearInterval(_ttlCleanupInterval);
    _ttlCleanupInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Optimistic UI updates
// ---------------------------------------------------------------------------

/**
 * Apply an optimistic update locally before server confirmation.
 */
export function applyOptimisticUpdate<T extends { id: string }>(
  item: T,
  updateFn: (item: T) => T,
): string {
  const id = _generateId();
  optimisticUpdates.set(id, {
    id,
    type: 'OPTIMISTIC_UPDATE',
    payload: item,
    timestamp: Date.now(),
    status: 'pending',
    optimisticData: updateFn(item),
  });

  // Immediately update local UI by dispatching event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('optimistic-update', {
        detail: { operationId: id, item: updateFn(item) },
      }),
    );
  }

  return id;
}

function _confirmOptimisticUpdate(id: string): void {
  const op = optimisticUpdates.get(id);
  if (op) {
    op.status = 'confirmed';
    optimisticUpdates.set(id, op);
  }
}

function _failOptimisticUpdate(id: string): void {
  rollbackOptimisticUpdate(id);
}

// ---------------------------------------------------------------------------
// Restore sync runner (for server restore functionality)
// ---------------------------------------------------------------------------

async function triggerRestoreSync(config: SyncConfig): Promise<ClientSyncState> {
  if (_syncInProgress) {
    return getSyncStatus();
  }

  _syncInProgress = true;
  _syncStatus = 'syncing';

  try {
    // Delta sync check: if we have a recent sync and not forced, skip
    const lastSync = await _getLastSyncTimestamp();
    if (lastSync && !config.force) {
      // Check if we actually need to restore
      // For restore mode we always proceed
    }

    // Resolve access token for restore
    let resolvedToken = config.accessToken;
    if (!resolvedToken) {
      const { getAccessToken } = await import('./tauriAuthService');
      resolvedToken = (await getAccessToken()) ?? undefined;
    }

    if (!resolvedToken) {
      _mockLastOutcome = 'offline';
      _syncStatus = 'error';
      _syncInProgress = false;
      return getSyncStatus();
    }

    // Phase 1: Critical data restore
    if (config.onProgress) {
      config.onProgress({
        phase: 'critical_restore',
        currentStep: 'Validating server credentials...',
        progressPercent: 5,
        criticalComplete: false,
        canUseApp: false,
        totalComplete: false,
      });
    }

    const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, config.signal);
    const criticalResponse = await fetch(`${config.apiBaseUrl}/restore/critical`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedToken}`,
      },
      signal: timeoutSignal,
    });

    if (!criticalResponse.ok) {
      throw new Error(`Critical restore failed: ${criticalResponse.status}`);
    }

    const criticalData = await criticalResponse.json();

    if (config.onProgress) {
      config.onProgress({
        phase: 'critical_restore',
        currentStep: 'Restoring stores and users...',
        progressPercent: 20,
        criticalComplete: false,
        canUseApp: false,
        totalComplete: false,
      });
    }

    if (isTauriEnvironment()) {
      try {
        await invoke('apply_restore_critical', {
          stores: criticalData.stores || [],
          users: criticalData.users || [],
          products: criticalData.products || [],
          stock_balances: criticalData.stock_balances || [],
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SyncService] Failed to apply critical restore:', err);
        throw new Error('Failed to restore critical data');
      }
    }

    if (config.onProgress) {
      config.onProgress({
        phase: 'critical_restore',
        currentStep: 'Restoring recent transactions...',
        progressPercent: 60,
        criticalComplete: false,
        canUseApp: false,
        totalComplete: false,
      });
    }

    if (isTauriEnvironment() && criticalData.recent_transactions) {
      try {
        await invoke('apply_restore_transactions', {
          transactions: criticalData.recent_transactions,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SyncService] Failed to restore recent transactions:', err);
        // Non-fatal - continue with restore
      }
    }

    if (config.onProgress) {
      config.onProgress({
        phase: 'critical_restore',
        currentStep: 'Critical data restored',
        progressPercent: 100,
        criticalComplete: true,
        canUseApp: true,
        totalComplete: false,
      });
    }

    await _setLastSyncTimestamp(criticalData.server_time || new Date().toISOString());

    _mockLastOutcome = 'success';
    _mockLastError = null;
    _syncStatus = 'synced';

    setTimeout(() => {
      triggerBackgroundRestore(config, resolvedToken);
    }, 1000);

    return getSyncStatus();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    _mockLastOutcome = 'error';
    _mockLastError = errorMsg;
    _syncStatus = 'error';
    // eslint-disable-next-line no-console
    console.error('[SyncService] Restore failed:', errorMsg);
    return getSyncStatus();
  } finally {
    _syncInProgress = false;
  }
}

async function triggerBackgroundRestore(config: SyncConfig, accessToken: string): Promise<void> {
  try {
    if (config.onProgress) {
      config.onProgress({
        phase: 'background_sync',
        currentStep: 'Syncing recent history...',
        progressPercent: 10,
        criticalComplete: true,
        canUseApp: true,
        totalComplete: false,
      });
    }

    const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, undefined);
    const importantResponse = await fetch(`${config.apiBaseUrl}/restore/important`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: timeoutSignal,
    });

    if (importantResponse.ok) {
      const importantData = await importantResponse.json();

      if (isTauriEnvironment()) {
        try {
          await invoke('apply_restore_important', {
            recent_history: importantData.recent_history || [],
            active_day_books: importantData.active_day_books || [],
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[SyncService] Failed to apply important restore:', err);
        }
      }
    }

    if (config.onProgress) {
      config.onProgress({
        phase: 'background_sync',
        currentStep: 'Syncing historical data...',
        progressPercent: 50,
        criticalComplete: true,
        canUseApp: true,
        totalComplete: false,
      });
    }

    const backgroundResponse = await fetch(`${config.apiBaseUrl}/restore/background`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: timeoutSignal,
    });

    if (backgroundResponse.ok) {
      const backgroundData = await backgroundResponse.json();

      if (isTauriEnvironment()) {
        try {
          await invoke('apply_restore_background', {
            historical_transactions: backgroundData.historical_transactions || [],
            analytics: backgroundData.analytics || [],
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[SyncService] Failed to apply background restore:', err);
        }
      }
    }

    if (config.onProgress) {
      config.onProgress({
        phase: 'background_sync',
        currentStep: 'Restore complete',
        progressPercent: 100,
        criticalComplete: true,
        canUseApp: true,
        totalComplete: true,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SyncService] Background restore failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Main sync runner
// ---------------------------------------------------------------------------

/**
 * Trigger an end-to-end sync cycle (Push then Pull).
 *
 * Push loop:
 *   - Fetches pending outbox rows from SQLite up to batchSize.
 *   - Optimistically marks them as SENDING.
 *   - Reorders batch so baseline/increases precede decreases.
 *   - POSTs to /api/v1/sync/push with compression.
 *   - Inspects per-item receipts:
 *       accepted=true  -> marks event SYNCED in SQLite.
 *       accepted=false -> marks event PERMANENT_REJECTION.
 *   - On network / 5xx error: marks rows RETRYABLE_ERROR with backoff.
 *   - Retry count capped at maxSyncRetries.
 *   - Delta sync: always uses `since` parameter with lastSyncTimestamp.
 *
 * Pull loop (runs once after all push batches complete):
 *   - Fetch /api/v1/sync/pull with delta sync and pagination.
 *
 * Returns a ClientSyncState snapshot after the run.
 */
export async function triggerSync(config: SyncConfig): Promise<ClientSyncState> {
  if (_syncInProgress) {
    return getSyncStatus();
  }

  // Handle restore mode
  if (config.mode === 'restore') {
    return triggerRestoreSync(config);
  }

  // Delta sync check: always use lastSyncTimestamp for delta mode
  const lastSync = await _getLastSyncTimestamp();
  if (lastSync && !config.force) {
    // Delta mode is now the default — we always use since
  }

  // Resolve access token — prefer explicit config.accessToken, then auth service.
  const maxRetries = config.maxSyncRetries ?? MAX_SYNC_RETRIES;
  const retryDelayMs = 1000;
  let resolvedToken = config.accessToken;
  if (!resolvedToken) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { getAccessToken } = await import('./tauriAuthService');
        resolvedToken = (await getAccessToken()) ?? undefined;

        if (resolvedToken) {
          break;
        }

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SyncService] TOKEN ERROR:', err);
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
  }

  // Offline-token-expiry guard
  if (!resolvedToken) {
    _mockLastOutcome = 'offline';
    _syncStatus = 'error';
    return getSyncStatus();
  }

  _syncInProgress = true;
  _syncStatus = 'syncing';

  const batchSize = config.batchSize ?? 500;
  let totalRejected = 0;
  let hadRetryableError = false;
  let retryCount = 0;
  let lastErrorMsg: string | null = null;
  let pullResponse: PullResponse | null = null;
  let pushedAnything = false;

  try {
    // ── Push loop ────────────────────────────────────────────────────
    let keepGoing = true;

    while (keepGoing) {
      // Abort check
      if (config.signal?.aborted) {
        break;
      }

      const rows = await _getPendingOutboxEvents(batchSize, config.force);

      const isFirstIteration = !pushedAnything;
      const shouldPushCatalogue = Boolean(config.force && isFirstIteration);

      if ((!rows || rows.length === 0) && !shouldPushCatalogue) {
        keepGoing = false;
        break;
      }

      await _updateOutboxEventStatuses(
        rows.map((row) => ({ event_id: row.event_id, target_status: 'SENDING' })),
      ).catch(() => undefined);

      const itemsWithRows: Array<{ item: TransactionPushItem; row: OutboxEventRow }> = [];
      const productUpdates: Array<{ product: ProductSnapshot; row: OutboxEventRow }> = [];
      const unparseable: OutboxEventRow[] = [];
      for (const row of rows) {
        if (row.event_type === 'PRODUCT_UPDATE') {
          const product = _buildProductUpdate(row);
          if (product) {
            productUpdates.push({ product, row });
          } else {
            unparseable.push(row);
          }
        } else {
          const item = _buildPushItem(row);
          if (item) {
            itemsWithRows.push({ item, row });
          } else {
            unparseable.push(row);
          }
        }
      }
      if (unparseable.length > 0) {
        await _updateOutboxEventStatuses(
          unparseable.map((row) => ({
            event_id: row.event_id,
            target_status: 'PERMANENT_REJECTION',
            error_msg: 'Outbox payload could not be parsed',
          })),
        ).catch(() => undefined);
      }

      if (itemsWithRows.length === 0 && productUpdates.length === 0) {
        if (!shouldPushCatalogue) {
          continue;
        }
      }

      const sortedItemsWithRows = _sortPushItems(itemsWithRows);
      // P2 (optimization plan): only push the full catalogue on a forced
      // first-iteration sync; regular syncs push just the dirty
      // PRODUCT_UPDATE events from the outbox instead of the whole
      // catalogue on every cycle.
      const dirtyProductSnapshots = productUpdates.map((x) => x.product);
      const pushProducts = shouldPushCatalogue
        ? [...(await _loadLocalProducts()), ...dirtyProductSnapshots]
        : dirtyProductSnapshots;

      try {
        const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, config.signal);
        const pushResp = await _httpPush(
          config.apiBaseUrl,
          resolvedToken,
          sortedItemsWithRows.map((x) => x.item),
          pushProducts,
          timeoutSignal,
        );
        pushedAnything = true;
        retryCount = 0; // Reset retry count on success

        const receiptMap = new Map(pushResp.receipts.map((r) => [r.transaction_id, r]));

        const outboxStatusUpdates: Array<{
          event_id: string;
          target_status: string;
          error_msg?: string | null;
        }> = [];
        const txStatusUpdates: Array<{
          transaction_id: string;
          sync_status: string;
          server_accepted_at?: string | null;
        }> = [];

        for (const { item, row } of sortedItemsWithRows) {
          const receipt = receiptMap.get(item.transaction_id);
          if (!receipt) {
            outboxStatusUpdates.push({
              event_id: row.event_id,
              target_status: 'RETRYABLE_ERROR',
              error_msg: 'No receipt returned from server',
            });
            hadRetryableError = true;
            continue;
          }

          if (receipt.accepted) {
            outboxStatusUpdates.push({
              event_id: row.event_id,
              target_status: 'SYNCED',
            });
            txStatusUpdates.push({
              transaction_id: item.transaction_id,
              sync_status: 'SYNCED',
              server_accepted_at: receipt.received_at,
            });
            // Confirm optimistic updates tied to this transaction
            for (const [opId, op] of optimisticUpdates) {
              if (
                op.payload &&
                typeof op.payload === 'object' &&
                'transaction_id' in op.payload &&
                (op.payload as Record<string, unknown>).transaction_id === item.transaction_id
              ) {
                _confirmOptimisticUpdate(opId);
              }
            }
          } else {
            const rejectionReason = receipt.rejection_reason ?? 'Server rejected transaction';
            // eslint-disable-next-line no-console
            console.error(
              '[SyncService] Event rejected:',
              item.transaction_id,
              'Reason:',
              rejectionReason,
            );

            const isPermanent = _isPermanentRejection(rejectionReason);
            const targetStatus = isPermanent ? 'PERMANENT_REJECTION' : 'RETRYABLE_ERROR';

            if (!isPermanent && retryCount < maxRetries) {
              retryCount++;
            }

            totalRejected++;

            outboxStatusUpdates.push({
              event_id: row.event_id,
              target_status: targetStatus,
              error_msg: rejectionReason,
            });
            txStatusUpdates.push({
              transaction_id: item.transaction_id,
              sync_status: targetStatus,
            });

            // Rollback optimistic updates on permanent rejection
            if (isPermanent) {
              for (const [opId, op] of optimisticUpdates) {
                if (
                  op.payload &&
                  typeof op.payload === 'object' &&
                  'transaction_id' in op.payload &&
                  (op.payload as Record<string, unknown>).transaction_id === item.transaction_id
                ) {
                  _failOptimisticUpdate(opId);
                }
              }
            }
          }
        }

        for (const { row } of productUpdates) {
          outboxStatusUpdates.push({ event_id: row.event_id, target_status: 'SYNCED' });
        }

        await Promise.all([
          _updateOutboxEventStatuses(outboxStatusUpdates).catch((e) => {
            // eslint-disable-next-line no-console
            console.error('[SyncService] Failed to batch-mark outbox events:', e);
          }),
          _updateTransactionSyncStatuses(txStatusUpdates).catch((e) => {
            // eslint-disable-next-line no-console
            console.error('[SyncService] Failed to batch-mark transactions:', e);
          }),
        ]);

        if (rows.length < batchSize) {
          keepGoing = false;
        }
      } catch (pushError) {
        const errMsg = pushError instanceof Error ? pushError.message : String(pushError);
        lastErrorMsg = errMsg;
        hadRetryableError = true;

        if (retryCount < maxRetries) {
          retryCount++;
          const backoffMs = Math.pow(2, retryCount) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          keepGoing = true; // Retry
        } else {
          // Cap reached: mark as retryable error and stop
          await _updateOutboxEventStatuses(
            itemsWithRows.map(({ row }) => ({
              event_id: row.event_id,
              target_status: 'RETRYABLE_ERROR',
              error_msg: errMsg,
            })),
          ).catch(() => undefined);
          keepGoing = false;
        }
      }
    }

    // ── Catalogue push (repair pass) ──────────────────────────────
    if (!pushedAnything && !hadRetryableError && config.force) {
      const localProducts = await _loadLocalProducts();
      if (localProducts.length > 0) {
        try {
          const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, config.signal);
          await _httpPush(config.apiBaseUrl, resolvedToken, [], localProducts, timeoutSignal);
        } catch (catalogueError) {
          // eslint-disable-next-line no-console
          console.error('[SyncService] Catalogue push failed:', catalogueError);
        }
      }
    }

    // ── Pull loop (only if push didn't error out) ─────────────────
    if (!hadRetryableError) {
      try {
        const timeoutSignal = _withTimeout(REQUEST_TIMEOUT_MS, config.signal);
        pullResponse = await _httpPullAll(config.apiBaseUrl, resolvedToken, timeoutSignal);

        if (isTauriEnvironment()) {
          try {
            await invoke('apply_sync_pull', {
              products: pullResponse.products,
              stores: pullResponse.stores,
              stock_balances: pullResponse.stock_balances ?? [],
            });
            // Server-side balance changes landed locally — drop the cache.
            invalidateStockBalanceCache();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[SyncService] Failed to apply sync pull snapshot:', err);
          }
        }
      } catch {
        // Pull failure is non-fatal
      }
      const syncTime = pullResponse?.server_time ?? new Date().toISOString();
      await _setLastSyncTimestamp(syncTime);
      _mockLastSyncAt = syncTime;
    }

    const outcome: SyncOutcome = hadRetryableError
      ? 'error'
      : totalRejected > 0
        ? 'partial'
        : 'success';

    _mockLastOutcome = outcome;
    _mockLastError = lastErrorMsg;
    _syncStatus = outcome === 'error' ? 'error' : 'synced';

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('inventory-sync-complete'));
    }
  } finally {
    _syncInProgress = false;
  }

  return getSyncStatus();
}

// ---------------------------------------------------------------------------
// Background sync scheduler (setTimeout chaining)
// ---------------------------------------------------------------------------

/**
 * Start a background sync loop using setTimeout chaining that resets
 * on activity. Under load, the chain stays active and doesn't pile up.
 *
 * @param config     Sync configuration (apiBaseUrl, accessToken).
 * @param intervalMs How often to attempt a sync (default: 30 000 ms).
 */
export function startBackgroundSync(config: SyncConfig, intervalMs: number = 30_000): void {
  if (_backgroundSyncActive) {
    return; // Already running
  }

  _backgroundSyncActive = true;
  // P2 (optimization plan): archive terminal outbox events older than the
  // retention window while the sync engine runs.
  startTTLCleanup();

  function _scheduleNext(): void {
    if (!_backgroundSyncActive) return;

    _backgroundTimeoutId = setTimeout(() => {
      void triggerSync(config).finally(() => {
        if (_backgroundSyncActive) {
          _scheduleNext();
        }
      });
    }, intervalMs);
  }

  // Fire immediately on first call, then chain
  void triggerSync(config).catch(() => undefined);
  _scheduleNext();
}

/**
 * Stop the background sync loop.
 */
export function stopBackgroundSync(): void {
  _backgroundSyncActive = false;
  stopTTLCleanup();
  if (_backgroundTimeoutId !== null) {
    clearTimeout(_backgroundTimeoutId);
    _backgroundTimeoutId = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers (kept from original)
// ---------------------------------------------------------------------------

async function _loadLocalProducts(): Promise<Product[]> {
  if (!isTauriEnvironment()) {
    return [];
  }
  try {
    const prods = await invoke<Product[]>('get_products');
    return Array.isArray(prods) ? prods : [];
  } catch {
    return [];
  }
}

const MOVEMENT_PUSH_PRIORITY: Record<string, number> = {
  ADJUSTMENT: 0,
  RECEIPT: 1,
  TRANSFER_IN: 1,
  RETURN: 1,
  SALE: 2,
  TRANSFER_OUT: 2,
  DAMAGE: 2,
};

const PERMANENT_REJECTION_PREFIXES = [
  'transaction_id is required',
  'store_id is required',
  'product_id is required',
  'user_id must be a positive integer',
  'device_id is required',
  'movement_type is required',
  'quantity_delta must be non-zero',
  'movement_type must be one of',
];

function _isPermanentRejection(reason: string): boolean {
  const normalized = (reason ?? '').toLowerCase();
  return PERMANENT_REJECTION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function _sortPushItems<T extends { item: TransactionPushItem }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const pa = MOVEMENT_PUSH_PRIORITY[a.item.movement_type] ?? 3;
    const pb = MOVEMENT_PUSH_PRIORITY[b.item.movement_type] ?? 3;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.item.occurred_at).getTime();
    const tb = new Date(b.item.occurred_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.item.transaction_id.localeCompare(b.item.transaction_id);
  });
}

function _buildPushItem(row: OutboxEventRow): TransactionPushItem | null {
  try {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const userIdStr = String(p.user_id ?? '').trim();
    const deviceIdStr = String(p.device_id ?? '').trim();

    let userId: number;
    if (userIdStr && !isNaN(Number(userIdStr))) {
      userId = Number(userIdStr);
    } else {
      if (userIdStr === 'LOCAL-USER' || userIdStr === 'USER-LOCAL') {
        userId = 1;
      } else {
        userId = 1;
      }
    }

    return {
      transaction_id: String(p.transaction_id ?? ''),
      store_id: String(p.store_id ?? ''),
      product_id: String(p.product_id ?? ''),
      movement_type: String(p.movement_type ?? ''),
      quantity_delta: Number(p.quantity_delta ?? 0),
      occurred_at: String(p.occurred_at || new Date().toISOString()),
      user_id: userId,
      device_id: deviceIdStr || 'SINGLE-USER-DEVICE',
      stock_bucket: String(p.stock_bucket || 'AVAILABLE'),
      reference_number: (p.reference_number as string | null | undefined) ?? null,
      reason_code: (p.reason_code as string | null | undefined) ?? null,
      transfer_id: (p.transfer_id as string | null | undefined) ?? null,
      purchase_order_id: (p.purchase_order_id as string | null | undefined) ?? null,
      batch_id: null,
      client_sequence: null,
      original_transaction_id: null,
    };
  } catch {
    return null;
  }
}

function _buildProductUpdate(row: OutboxEventRow): ProductSnapshot | null {
  try {
    const p = JSON.parse(row.payload) as {
      product_id: string;
      sku: string;
      name: string;
      brand: string | null;
      model: string | null;
      category: string;
      unit: string;
      barcode: string | null;
      alternate_names: string | null;
      serial_tracking_enabled: boolean;
      is_active: boolean;
      updated_at: string;
    };
    return {
      id: p.product_id,
      sku: p.sku,
      name: p.name,
      brand: p.brand ?? null,
      model: p.model ?? null,
      category: p.category,
      unit: p.unit,
      barcode: p.barcode ?? null,
      alternate_names: p.alternate_names ?? null,
      serial_tracking_enabled: p.serial_tracking_enabled,
      is_active: p.is_active,
      updated_at: p.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
