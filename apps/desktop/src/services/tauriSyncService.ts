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
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Prevent concurrent sync runs. */
let _syncInProgress = false;

/** Handle returned by setInterval for background sync. */
let _backgroundIntervalId: ReturnType<typeof setInterval> | null = null;

// @visibleForTesting
/** In-memory sync state for mock/test environment. */
let _mockPendingCount = 0;
let _mockLastSyncAt: string | null = null;
let _mockLastOutcome: SyncOutcome | null = null;
let _mockLastError: string | null = null;

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
  // In Tauri mode, prefer the in-memory cache first (set by _setLastSyncTimestamp).
  // Fall back to the IPC call so the persisted value survives restarts.
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
  // Always update the in-memory cache so reads in the same process are consistent.
  _mockLastSyncAt = timestamp;
  if (isTauriEnvironment()) {
    await invoke<void>('set_last_sync_timestamp', { timestamp });
  }
}

// ---------------------------------------------------------------------------
// Public API — timestamp / status
// ---------------------------------------------------------------------------

/**
 * Returns the ISO timestamp of the last successful sync, or null if none.
 * Feeds the Header's last-sync display.
 */
export async function getLastSyncTimestamp(): Promise<string | null> {
  return _getLastSyncTimestamp();
}

/**
 * Returns a snapshot of the current sync state.
 */
export async function getSyncStatus(): Promise<ClientSyncState> {
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
  };
}

// ---------------------------------------------------------------------------
// Core push loop
// ---------------------------------------------------------------------------

/**
 * Build the HTTP push payload from a raw outbox event row.
 * Parses the JSON payload blob stored in SQLite.
 */
interface ProductUpdatePayload {
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
  created_at: string;
  updated_at: string;
}

function _buildPushItem(row: OutboxEventRow): TransactionPushItem | null {
  try {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const userIdStr = String(p.user_id ?? '').trim();
    const deviceIdStr = String(p.device_id ?? '').trim();

    // Convert placeholder user IDs to numeric values
    let userId: number;
    if (userIdStr && !isNaN(Number(userIdStr))) {
      userId = Number(userIdStr);
    } else {
      if (userIdStr === 'LOCAL-USER' || userIdStr === 'USER-LOCAL') {
        userId = 1; // Default user ID for local operations
      } else {
        userId = 1; // Fallback to user ID 1
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
    const p = JSON.parse(row.payload) as ProductUpdatePayload;
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

/**
 * Load the local product catalogue (desktop runtime only).
 *
 * Returns an empty array outside Tauri or when the IPC call fails, so callers
 * can treat "nothing to push" and "cannot read" the same way.
 */
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

// Movement priority for deterministic push ordering.
// Lower number = processed first by the server.
const MOVEMENT_PUSH_PRIORITY: Record<string, number> = {
  ADJUSTMENT: 0, // Baseline / count reconciliation first
  RECEIPT: 1, // Then stock-increases
  TRANSFER_IN: 1,
  RETURN: 1,
  SALE: 2, // Then stock-decreases
  TRANSFER_OUT: 2,
  DAMAGE: 2,
};

/**
 * Validation errors returned by the server's _validate_payload are
 * permanent — retrying them will never succeed.  All other rejections
 * (domain errors like "Insufficient stock", server internal errors, etc.)
 * are potentially stale and should be retried with backoff.
 */
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

/**
 * POST a batch of events to /api/v1/sync/push.
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
  const response = await fetch(`${apiBaseUrl}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal,
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
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
const PULL_PAGE_SIZE = 5000;

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
// Restore sync runner (for server restore functionality)
// ---------------------------------------------------------------------------

/**
 * Trigger a prioritized restore sync for server data restoration.
 *
 * This implements the "Last synced to server, first restored to app" principle:
 * Phase 1 (Critical): Stores, users, products, stock balances - must complete before app usage
 * Phase 2 (Important): Recent transactions, active day books - background sync
 * Phase 3 (Background): Historical data - lowest priority
 */
async function triggerRestoreSync(config: SyncConfig): Promise<ClientSyncState> {
  if (_syncInProgress) {
    return getSyncStatus();
  }

  _syncInProgress = true;

  try {
    // Resolve access token for restore
    let resolvedToken = config.accessToken;
    if (!resolvedToken) {
      const { getAccessToken } = await import('./tauriAuthService');
      resolvedToken = (await getAccessToken()) ?? undefined;
    }

    if (!resolvedToken) {
      _mockLastOutcome = 'offline';
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

    // Fetch critical data from server
    const criticalResponse = await fetch(`${config.apiBaseUrl}/restore/critical`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedToken}`,
      },
      signal: config.signal,
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

    // Apply critical data to local database
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

    // Apply recent transactions
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

    // Critical phase complete - app can now be used
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

    // Set last sync timestamp
    await _setLastSyncTimestamp(criticalData.server_time || new Date().toISOString());

    _mockLastOutcome = 'success';
    _mockLastError = null;

    // Start background sync for remaining data (non-blocking)
    setTimeout(() => {
      triggerBackgroundRestore(config, resolvedToken);
    }, 1000);

    return getSyncStatus();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    _mockLastOutcome = 'error';
    _mockLastError = errorMsg;
    // eslint-disable-next-line no-console
    console.error('[SyncService] Restore failed:', errorMsg);
    return getSyncStatus();
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Background restore for non-critical data (runs after critical restore completes).
 * This is fire-and-forget - the app is already usable.
 */
async function triggerBackgroundRestore(config: SyncConfig, accessToken: string): Promise<void> {
  try {
    // Phase 2: Important data
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

    const importantResponse = await fetch(`${config.apiBaseUrl}/restore/important`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

    // Phase 3: Background data (lowest priority)
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

    // Complete
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
    // Non-fatal - app is already usable
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
 *   - POSTs to /api/v1/sync/push.
 *   - Inspects per-item receipts:
 *       accepted=true  -> marks event SYNCED in SQLite.
 *       accepted=false -> marks event PERMANENT_REJECTION.
 *   - On network / 5xx error: marks rows RETRYABLE_ERROR with backoff.
 *   - Repeats until outbox queue is drained or an error occurs.
 *
 * Pull loop (runs once after all push batches complete):
 *   - Fetch /api/v1/sync/pull and log the snapshot count (full upsert
 *     into local SQLite is a future enhancement — the data is available
 *     here for callers to consume via the returned PullResponse).
 *
 * Returns a ClientSyncState snapshot after the run.
 *
 * Guarantees:
 *   - Never blocks foreground entry — caller can fire-and-forget.
 *   - Re-entrant guard prevents concurrent runs.
 *   - Batched upload: up to batchSize events per HTTP call.
 *   - Exponential backoff on retryable errors stored in SQLite.
 */
export async function triggerSync(config: SyncConfig): Promise<ClientSyncState> {
  if (_syncInProgress) {
    return getSyncStatus();
  }

  // Handle restore mode
  if (config.mode === 'restore') {
    return triggerRestoreSync(config);
  }

  // Resolve access token — prefer explicit config.accessToken, then auth service.
  // Retry a few times if no token is available (background upgrade may still be in progress)
  let resolvedToken = config.accessToken;
  if (!resolvedToken) {
    const maxRetries = 3;
    const retryDelayMs = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { getAccessToken } = await import('./tauriAuthService');
        resolvedToken = (await getAccessToken()) ?? undefined;

        if (resolvedToken) {
          break; // Got token, no need to retry
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

  // Offline-token-expiry guard: if we have no token because the
  // token expired while offline, skip the sync entirely — but do NOT discard
  // pending transactions.  The outbox continues to queue; sync resumes after
  // re-authentication.
  if (!resolvedToken) {
    _mockLastOutcome = 'offline';
    return getSyncStatus();
  }

  _syncInProgress = true;

  const batchSize = config.batchSize ?? 500;
  let totalRejected = 0;
  let hadRetryableError = false;
  let lastErrorMsg: string | null = null;
  let pullResponse: PullResponse | null = null;
  /** True once this run has POSTed a batch to /sync/push. */
  let pushedAnything = false;

  try {
    // ── Push loop ────────────────────────────────────────────────────────────
    let keepGoing = true;

    while (keepGoing) {
      const rows = await _getPendingOutboxEvents(batchSize, config.force);

      if (!rows || rows.length === 0) {
        keepGoing = false;
        break;
      }

      // Mark all as SENDING in one batch call
      await _updateOutboxEventStatuses(
        rows.map((row) => ({ event_id: row.event_id, target_status: 'SENDING' })),
      ).catch(() => undefined);

      // Build push items; skip rows with unparseable payloads
      const itemsWithRows: Array<{ item: TransactionPushItem; row: OutboxEventRow }> = [];
      const productUpdates: Array<{ product: ProductSnapshot; row: OutboxEventRow }> = [];
      const unparseable: OutboxEventRow[] = [];
      for (const row of rows) {
        if (row.event_type === 'PRODUCT_UPDATE') {
          const product = _buildProductUpdate(row);
          if (product) {
            productUpdates.push({ product, row });
          } else {
            // Unparseable → permanent rejection
            unparseable.push(row);
          }
        } else {
          const item = _buildPushItem(row);
          if (item) {
            itemsWithRows.push({ item, row });
          } else {
            // Unparseable → permanent rejection
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
        continue;
      }

      // Reorder the batch so baseline (ADJUSTMENT) and stock-increase events
      // are pushed before stock-decrease events.  This mirrors the server-side
      // ingest_batch ordering and keeps the two sides consistent.
      const sortedItemsWithRows = _sortPushItems(itemsWithRows);

      // Product snapshots are piggy-backed on every push so transaction events
      // that reference a locally created product are accepted by the server.
      const localProducts = await _loadLocalProducts();

      // Add product updates to the products array for push
      const pushProducts = [...localProducts, ...productUpdates.map((x) => x.product)];

      try {
        const pushResp = await _httpPush(
          config.apiBaseUrl,
          resolvedToken,
          sortedItemsWithRows.map((x) => x.item),
          pushProducts,
          config.signal,
        );
        pushedAnything = true;

        // Build a lookup map by transaction_id
        const receiptMap = new Map(pushResp.receipts.map((r) => [r.transaction_id, r]));

        // Update each transaction event based on its receipt
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
            // No receipt returned — treat as retryable error
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
          } else {
            const rejectionReason = receipt.rejection_reason ?? 'Server rejected transaction';
            // eslint-disable-next-line no-console
            console.error(
              '[SyncService] Event rejected:',
              item.transaction_id,
              'Reason:',
              rejectionReason,
            );

            // Distinguish permanent validation failures from stale domain errors
            // (e.g. Insufficient stock) so offline-accumulated transactions are
            // retried once the underlying data changes.
            const isPermanent = _isPermanentRejection(rejectionReason);
            const targetStatus = isPermanent ? 'PERMANENT_REJECTION' : 'RETRYABLE_ERROR';

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
          }
        }

        // Mark product update events as SYNCED (they don't have individual receipts,
        // but the server upserts them as part of the push)
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

        // If fewer rows than batch size returned, we've drained the queue
        if (rows.length < batchSize) {
          keepGoing = false;
        }
      } catch (pushError) {
        // Network / 5xx error — retryable (SYNC-011)
        const errMsg = pushError instanceof Error ? pushError.message : String(pushError);
        lastErrorMsg = errMsg;
        hadRetryableError = true;

        await _updateOutboxEventStatuses(
          itemsWithRows.map(({ row }) => ({
            event_id: row.event_id,
            target_status: 'RETRYABLE_ERROR',
            error_msg: errMsg,
          })),
        ).catch(() => undefined);

        // Stop the push loop on transient error — next scheduled run will retry
        keepGoing = false;
      }
    }

    // ── Catalogue push (repair pass) ──────────────────────────────────────
    // The push loop above is outbox-driven, so a device whose queue is empty
    // would never upload its product catalogue.  Products created through the
    // app are queued as PRODUCT_UPDATE events, but rows imported/created
    // before that (or while pushes kept failing) still have to reach the
    // server.  On a forced sync (app start, reconnect, manual sync) with an
    // empty queue we therefore upload the local catalogue on its own; the
    // server applies it as an idempotent upsert.
    if (!pushedAnything && !hadRetryableError && config.force) {
      const localProducts = await _loadLocalProducts();
      if (localProducts.length > 0) {
        try {
          await _httpPush(config.apiBaseUrl, resolvedToken, [], localProducts, config.signal);
        } catch (catalogueError) {
          // Non-fatal — the next forced sync retries the catalogue upload.
          // eslint-disable-next-line no-console
          console.error('[SyncService] Catalogue push failed:', catalogueError);
        }
      }
    }

    // ── Pull loop (only if push didn't error out) ─────────────────────────
    if (!hadRetryableError) {
      try {
        pullResponse = await _httpPullAll(config.apiBaseUrl, resolvedToken, config.signal);

        // Apply the server snapshot into local SQLite in a single batched
        // transaction (replaces N×3 per-row invoke roundtrips).
        if (isTauriEnvironment()) {
          try {
            await invoke('apply_sync_pull', {
              products: pullResponse.products,
              stores: pullResponse.stores,
              stock_balances: pullResponse.stock_balances ?? [],
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[SyncService] Failed to apply sync pull snapshot:', err);
          }
        }
      } catch {
        // Pull failure is non-fatal — we still record a successful push sync time
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

    // Notify UI components that a sync cycle has completed so they can
    // immediately refresh their pending-count and last-sync displays.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('inventory-sync-complete'));
    }
  } finally {
    _syncInProgress = false;
  }

  return getSyncStatus();
}

// ---------------------------------------------------------------------------
// Background sync scheduler
// ---------------------------------------------------------------------------

/**
 * Start a background sync loop that fires triggerSync on the given interval.
 * Never blocks the foreground thread.
 *
 * @param config     Sync configuration (apiBaseUrl, accessToken).
 * @param intervalMs How often to attempt a sync (default: 30 000 ms).
 */
export function startBackgroundSync(config: SyncConfig, intervalMs: number = 30_000): void {
  if (_backgroundIntervalId !== null) {
    return; // Already running
  }

  // Fire immediately on first call, then repeat
  void triggerSync(config).catch(() => undefined);

  _backgroundIntervalId = setInterval(() => {
    void triggerSync(config).catch(() => undefined);
  }, intervalMs);
}

/**
 * Stop the background sync loop.
 */
export function stopBackgroundSync(): void {
  if (_backgroundIntervalId !== null) {
    clearInterval(_backgroundIntervalId);
    _backgroundIntervalId = null;
  }
}
