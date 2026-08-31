/**
 * Sync-related TypeScript types for Issue 15 (SYNC-007/008/009/010/011).
 *
 * These types mirror the server-side Pydantic schemas in
 * services/api/app/api/v1/sync.py.
 */

// ---------------------------------------------------------------------------
// Push types
// ---------------------------------------------------------------------------

/** Wire format for a single outbox event pushed to /api/v1/sync/push. */
export interface TransactionPushItem {
  transaction_id: string;
  store_id: string;
  product_id: string;
  movement_type: string;
  quantity_delta: number;
  occurred_at: string;
  user_id: string;
  device_id: string;
  stock_bucket: string;
  reference_number?: string | null;
  reason_code?: string | null;
  transfer_id?: string | null;
  purchase_order_id?: string | null;
  batch_id?: string | null;
  client_sequence?: number | null;
  original_transaction_id?: string | null;
}

/** Per-item receipt returned from the server after a push. */
export interface TransactionReceiptItem {
  transaction_id: string;
  accepted: boolean;
  rejection_reason: string | null;
  received_at: string;
  processed_at: string;
}

/** Full push response from /api/v1/sync/push. */
export interface PushResponse {
  receipts: TransactionReceiptItem[];
  accepted_count: number;
  rejected_count: number;
  server_time: string;
}

// ---------------------------------------------------------------------------
// Pull types
// ---------------------------------------------------------------------------

export interface ProductSnapshot {
  id: string;
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
}

export interface StoreSnapshot {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface PullResponse {
  products: ProductSnapshot[];
  stores: StoreSnapshot[];
  server_time: string;
}

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

/** Response from GET /api/v1/sync/status. */
export interface SyncStatusResponse {
  status: 'ok';
  server_time: string;
  receipts_last_24h: number;
  accepted_last_24h: number;
  rejected_last_24h: number;
}

// ---------------------------------------------------------------------------
// Client-side sync state
// ---------------------------------------------------------------------------

/** Outcome of a single push attempt. */
export type SyncOutcome = 'success' | 'partial' | 'error' | 'offline';

/** State returned from triggerSync / getSyncStatus. */
export interface ClientSyncState {
  lastSyncAt: string | null;
  pendingCount: number;
  isOnline: boolean;
  lastOutcome: SyncOutcome | null;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Outbox event as stored in SQLite (returned by get_pending_outbox_events)
// ---------------------------------------------------------------------------

export interface OutboxEventRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: string;
  status: string;
  retry_count: number;
  next_attempt_at: string | null;
  created_at: string;
  last_error: string | null;
}
