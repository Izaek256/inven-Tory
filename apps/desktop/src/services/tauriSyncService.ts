/**
 * tauriSyncService — Issue 15 (SYNC-007/008/009/010/011).
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
 *     so the Header can display it (SYNC-009).
 *
 *   getLastSyncTimestamp()
 *     Returns the ISO string of the last successful sync, or null.
 *
 *   getSyncStatus()
 *     Returns a snapshot of the current sync state.
 *
 *   Background scheduling (startBackgroundSync / stopBackgroundSync):
 *     Runs triggerSync on a configurable interval (default: 30 s).
 *     Never blocks foreground entry — runs in the background (SYNC-007).
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
   * skipped but pending transactions are NOT discarded (Section 21 offline rule).
   */
  accessToken?: string;
  /** Maximum number of outbox events per push request (default: 100). */
  batchSize?: number;
  /** Force sync even if last attempt was recent or if events are in retry backoff. */
  force?: boolean;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
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

async function _updateOutboxEventStatus(
  eventId: string,
  targetStatus: string,
  errorMsg?: string | null,
): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('update_outbox_event_status', {
        eventId,
        event_id: eventId,
        targetStatus,
        target_status: targetStatus,
        errorMsg: errorMsg ?? null,
        error_msg: errorMsg ?? null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncService] Failed to invoke update_outbox_event_status:', err);
      throw err;
    }
  }
}

async function _updateTransactionSyncStatus(
  transactionId: string,
  syncStatus: string,
  serverAcceptedAt?: string | null,
): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('update_transaction_sync_status', {
        transactionId,
        transaction_id: transactionId,
        syncStatus,
        sync_status: syncStatus,
        serverAcceptedAt: serverAcceptedAt ?? null,
        server_accepted_at: serverAcceptedAt ?? null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncService] Failed to invoke update_transaction_sync_status:', err);
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
 * Feeds the Header's last-sync display (SYNC-009).
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
  products?: Product[],
  signal?: AbortSignal,
): Promise<PushResponse> {
  const payload: { events: TransactionPushItem[]; products?: Product[] } = { events: items };
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
 */
async function _httpPull(
  apiBaseUrl: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<PullResponse> {
  const response = await fetch(`${apiBaseUrl}/sync/pull`, {
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

// ---------------------------------------------------------------------------
// Main sync runner (SYNC-007)
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
 *   - Never blocks foreground entry — caller can fire-and-forget (SYNC-007).
 *   - Re-entrant guard prevents concurrent runs.
 *   - Batched upload (SYNC-010): up to batchSize events per HTTP call.
 *   - Exponential backoff on retryable errors (SYNC-011) stored in SQLite.
 */
export async function triggerSync(config: SyncConfig): Promise<ClientSyncState> {
  if (_syncInProgress) {
    return getSyncStatus();
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

  // Offline-token-expiry guard (Section 21): if we have no token because the
  // token expired while offline, skip the sync entirely — but do NOT discard
  // pending transactions.  The outbox continues to queue; sync resumes after
  // re-authentication.
  if (!resolvedToken) {
    _mockLastOutcome = 'offline';
    return getSyncStatus();
  }

  _syncInProgress = true;

  const batchSize = config.batchSize ?? 100;
  let totalRejected = 0;
  let hadRetryableError = false;
  let lastErrorMsg: string | null = null;
  let pullResponse: PullResponse | null = null;

  try {
    // ── Push loop ────────────────────────────────────────────────────────────
    let keepGoing = true;

    while (keepGoing) {
      const rows = await _getPendingOutboxEvents(batchSize, config.force);

      if (!rows || rows.length === 0) {
        keepGoing = false;
        break;
      }

      // Mark all as SENDING
      for (const row of rows) {
        await _updateOutboxEventStatus(row.event_id, 'SENDING').catch(() => undefined);
      }

      // Build push items; skip rows with unparseable payloads
      const itemsWithRows: Array<{ item: TransactionPushItem; row: OutboxEventRow }> = [];
      for (const row of rows) {
        const item = _buildPushItem(row);
        if (item) {
          itemsWithRows.push({ item, row });
        } else {
          // Unparseable → permanent rejection
          await _updateOutboxEventStatus(
            row.event_id,
            'PERMANENT_REJECTION',
            'Outbox payload could not be parsed',
          ).catch(() => undefined);
        }
      }

      if (itemsWithRows.length === 0) {
        continue;
      }

      // Reorder the batch so baseline (ADJUSTMENT) and stock-increase events
      // are pushed before stock-decrease events.  This mirrors the server-side
      // ingest_batch ordering and keeps the two sides consistent.
      const sortedItemsWithRows = _sortPushItems(itemsWithRows);

      let localProducts: Product[] = [];
      if (isTauriEnvironment()) {
        try {
          const prods = await invoke<Product[]>('get_products');
          if (Array.isArray(prods)) {
            localProducts = prods;
          }
        } catch {
          // Non-fatal
        }
      }

      try {
        const pushResp = await _httpPush(
          config.apiBaseUrl,
          resolvedToken,
          sortedItemsWithRows.map((x) => x.item),
          localProducts,
          config.signal,
        );

        // Build a lookup map by transaction_id
        const receiptMap = new Map(pushResp.receipts.map((r) => [r.transaction_id, r]));

        // Update each event based on its receipt
        for (const { item, row } of sortedItemsWithRows) {
          const receipt = receiptMap.get(item.transaction_id);
          if (!receipt) {
            // No receipt returned — treat as retryable error
            await _updateOutboxEventStatus(
              row.event_id,
              'RETRYABLE_ERROR',
              'No receipt returned from server',
            ).catch(() => undefined);
            hadRetryableError = true;
            continue;
          }

          if (receipt.accepted) {
            await Promise.all([
              _updateOutboxEventStatus(row.event_id, 'SYNCED').catch((e) => {
                // eslint-disable-next-line no-console
                console.error('[SyncService] Failed to mark outbox event SYNCED:', e);
              }),
              _updateTransactionSyncStatus(
                item.transaction_id,
                'SYNCED',
                receipt.received_at,
              ).catch((e) => {
                // eslint-disable-next-line no-console
                console.error('[SyncService] Failed to mark transaction SYNCED:', e);
              }),
            ]);
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

            if (!isPermanent) {
              totalRejected++;
            }

            await Promise.all([
              _updateOutboxEventStatus(row.event_id, targetStatus, rejectionReason).catch(
                () => undefined,
              ),
              _updateTransactionSyncStatus(item.transaction_id, targetStatus).catch(
                () => undefined,
              ),
            ]);
          }
        }

        // If fewer rows than batch size returned, we've drained the queue
        if (rows.length < batchSize) {
          keepGoing = false;
        }
      } catch (pushError) {
        // Network / 5xx error — retryable (SYNC-011)
        const errMsg = pushError instanceof Error ? pushError.message : String(pushError);
        lastErrorMsg = errMsg;
        hadRetryableError = true;

        for (const { row } of itemsWithRows) {
          await _updateOutboxEventStatus(row.event_id, 'RETRYABLE_ERROR', errMsg).catch(
            () => undefined,
          );
        }

        // Stop the push loop on transient error — next scheduled run will retry
        keepGoing = false;
      }
    }

    // ── Pull loop (only if push didn't error out) ─────────────────────────
    if (!hadRetryableError) {
      try {
        pullResponse = await _httpPull(config.apiBaseUrl, resolvedToken, config.signal);

        // Upsert products and stores from server into local SQLite
        if (isTauriEnvironment()) {
          for (const product of pullResponse.products) {
            try {
              await invoke('upsert_product_from_server', { product });
            } catch {
              // non-fatal upsert failure
            }
          }
          for (const store of pullResponse.stores) {
            try {
              await invoke('upsert_store_from_server', { store });
            } catch {
              // non-fatal upsert failure
            }
          }
          if (pullResponse.stock_balances && pullResponse.stock_balances.length > 0) {
            for (const balance of pullResponse.stock_balances) {
              try {
                await invoke('upsert_stock_balance_from_server', { balance });
              } catch {
                // non-fatal upsert failure
              }
            }
          }
        }
      } catch {
        // Pull failure is non-fatal — we still record a successful push sync time
      }
      const syncTime = new Date().toISOString();
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
 * Never blocks the foreground thread (SYNC-007).
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
