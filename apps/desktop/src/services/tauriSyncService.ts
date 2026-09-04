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
  /** Number of outbox events per push batch (default: 100, SYNC-010) */
  batchSize?: number;
  /** Abort signal for cancelling in-flight fetch calls */
  signal?: AbortSignal;
  /** Force sync attempt: reset retry backoffs and clear trapped SENDING events */
  force?: boolean;
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
    await invoke<void>('update_outbox_event_status', {
      event_id: eventId,
      target_status: targetStatus,
      error_msg: errorMsg ?? null,
    });
  }
}

async function _updateTransactionSyncStatus(
  transactionId: string,
  syncStatus: string,
  serverAcceptedAt?: string | null,
): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke<void>('update_transaction_sync_status', {
      transaction_id: transactionId,
      sync_status: syncStatus,
      server_accepted_at: serverAcceptedAt ?? null,
    });
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
    return {
      transaction_id: String(p.transaction_id ?? ''),
      store_id: String(p.store_id ?? ''),
      product_id: String(p.product_id ?? ''),
      movement_type: String(p.movement_type ?? ''),
      quantity_delta: Number(p.quantity_delta ?? 0),
      occurred_at: String(p.occurred_at || new Date().toISOString()),
      user_id: userIdStr || 'LOCAL-USER',
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

/**
 * POST a batch of events to /api/v1/sync/push.
 * Returns the PushResponse, or throws on network/HTTP error.
 */
async function _httpPush(
  apiBaseUrl: string,
  accessToken: string,
  items: TransactionPushItem[],
  signal?: AbortSignal,
): Promise<PushResponse> {
  const response = await fetch(`${apiBaseUrl}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ events: items }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
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
    throw new Error(`Pull HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<PullResponse>;
}

// ---------------------------------------------------------------------------
// Public API — triggerSync
// ---------------------------------------------------------------------------

/**
 * Run one full push/pull sync cycle.
 *
 * Push loop:
 *   1. Fetch up to batchSize pending outbox events.
 *   2. Mark each as SENDING.
 *   3. POST the batch to /api/v1/sync/push.
 *   4. For each receipt:
 *      - accepted=true  → set outbox SYNCED, update transaction sync_status
 *      - accepted=false → set outbox PERMANENT_REJECTION (server validation error)
 *   5. On network/5xx error → set all batch items to RETRYABLE_ERROR with backoff.
 *   6. Repeat until no pending events remain.
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
  let resolvedToken = config.accessToken;
  if (!resolvedToken) {
    try {
      const { getAccessToken } = await import('./tauriAuthService');
      resolvedToken = (await getAccessToken()) ?? undefined;
    } catch {
      resolvedToken = undefined;
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
  let totalAccepted = 0;
  let totalRejected = 0;
  let hadRetryableError = false;
  let lastErrorMsg: string | null = null;
  let pullResponse: PullResponse | null = null;

  try {
    // ── Push loop ────────────────────────────────────────────────────────────
    let keepGoing = true;

    while (keepGoing) {
      const rows = await _getPendingOutboxEvents(batchSize, config.force);

      if (rows.length === 0) {
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

      try {
        const pushResp = await _httpPush(
          config.apiBaseUrl,
          resolvedToken,
          itemsWithRows.map((x) => x.item),
          config.signal,
        );

        // Build a lookup map by transaction_id
        const receiptMap = new Map(pushResp.receipts.map((r) => [r.transaction_id, r]));

        // Update each event based on its receipt
        for (const { item, row } of itemsWithRows) {
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
              _updateOutboxEventStatus(row.event_id, 'SYNCED').catch(() => undefined),
              _updateTransactionSyncStatus(
                item.transaction_id,
                'SYNCED',
                receipt.received_at,
              ).catch(() => undefined),
            ]);
            totalAccepted++;
          } else {
            // Server permanently rejected the event (validation failure)
            await Promise.all([
              _updateOutboxEventStatus(
                row.event_id,
                'PERMANENT_REJECTION',
                receipt.rejection_reason ?? 'Server rejected transaction',
              ).catch(() => undefined),
              _updateTransactionSyncStatus(item.transaction_id, 'PERMANENT_REJECTION').catch(
                () => undefined,
              ),
            ]);
            totalRejected++;
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
        // eslint-disable-next-line no-console
        console.info(
          `[SyncService] Pull complete: ${pullResponse.products.length} products, ` +
            `${pullResponse.stores.length} stores`,
        );

        // Upsert products and stores from server into local SQLite
        if (isTauriEnvironment()) {
          for (const product of pullResponse.products) {
            try {
              await invoke('upsert_product_from_server', { product });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[SyncService] Failed to upsert product:', product.id, err);
            }
          }
          for (const store of pullResponse.stores) {
            try {
              await invoke('upsert_store_from_server', { store });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[SyncService] Failed to upsert store:', store.id, err);
            }
          }
          if (pullResponse.stock_balances && pullResponse.stock_balances.length > 0) {
            for (const balance of pullResponse.stock_balances) {
              try {
                await invoke('upsert_stock_balance_from_server', { balance });
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[SyncService] Failed to upsert stock balance:', balance.id, err);
              }
            }
          }
        }
      } catch (pullError) {
        // Pull failure is non-fatal — we still record a successful push sync time
        const errMsg = pullError instanceof Error ? pullError.message : String(pullError);
        // eslint-disable-next-line no-console
        console.warn('[SyncService] Pull failed (non-fatal):', errMsg);
      }

      // Store the last successful sync timestamp (SYNC-009)
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

    // eslint-disable-next-line no-console
    console.info(
      `[SyncService] Sync complete — accepted: ${totalAccepted}, rejected: ${totalRejected}, ` +
        `retryable_error: ${hadRetryableError}`,
    );
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
  void triggerSync(config).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[SyncService] Background sync error (initial):', err);
  });

  _backgroundIntervalId = setInterval(() => {
    void triggerSync(config).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[SyncService] Background sync error:', err);
    });
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
