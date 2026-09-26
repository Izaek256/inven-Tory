import { invoke } from '@tauri-apps/api/core';
import {
  InventoryTransaction,
  CreateTransactionInput,
  StockBalance,
  ReturnStockInput,
  MoveStockBucketInput,
  AdjustStockInput,
  UpdateTransactionInput as UpdateTransactionInputType,
  StockBucket,
} from '../types/transaction';
import { isTauriEnvironment } from './tauriStoreService';

interface ReceiveStockInput {
  store_id: string;
  product_id: string;
  quantity: number;
  reference_number?: string;
  supplier?: string;
  user_id: string;
  device_id: string;
}

interface SellStockInput {
  store_id: string;
  product_id: string;
  quantity: number;
  reference_number?: string;
  user_id: string;
  device_id: string;
}

function _triggerAutoSync(): void {
  const envBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;
  const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

  import('./tauriSyncService')
    .then(({ triggerSync }) => {
      void triggerSync({ apiBaseUrl }).catch(() => undefined);
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// P2 (optimization plan): in-memory stock balance cache
// ---------------------------------------------------------------------------
// Read-through cache keyed by (store, product, bucket) so list-heavy views
// (physical count, day books) don't re-fetch the same balance from SQLite on
// every render pass. Invalidated wholesale on every local stock mutation,
// on business-cache wipes, and after a sync pull; the TTL is a safety net
// for any write path that slips through instrumentation.

const _stockBalanceCache = new Map<string, { quantity: number; at: number }>();
const STOCK_BALANCE_TTL_MS = 30_000;

/** Drop all cached stock balances. Call after any stock mutation or wipe. */
export function invalidateStockBalanceCache(): void {
  _stockBalanceCache.clear();
}

// @visibleForTesting
export function getStockBalanceCacheSize(): number {
  return _stockBalanceCache.size;
}

function _balanceCacheKey(storeId: string, productId: string, bucket: StockBucket): string {
  return `${storeId}:${productId}:${bucket}`;
}

/** Return the cached quantity if present and fresh, else undefined. */
function _readBalanceCache(key: string): number | undefined {
  const hit = _stockBalanceCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > STOCK_BALANCE_TTL_MS) {
    _stockBalanceCache.delete(key);
    return undefined;
  }
  return hit.quantity;
}

function _writeBalanceCache(key: string, quantity: number): void {
  _stockBalanceCache.set(key, { quantity, at: Date.now() });
}

// @visibleForTesting
export function getMockBalance(
  storeId: string,
  productId: string,
  bucket: StockBucket = 'AVAILABLE',
): number {
  const bucketKey = `${storeId}::${productId}::${bucket}`;
  if (MOCK_STOCK_BALANCES.has(bucketKey)) {
    return MOCK_STOCK_BALANCES.get(bucketKey)!;
  }
  if (bucket === 'AVAILABLE') {
    const legacyKey = `${storeId}::${productId}`;
    return MOCK_STOCK_BALANCES.get(legacyKey) ?? 0;
  }
  return 0;
}

// @visibleForTesting
export function setMockBalance(
  storeId: string,
  productId: string,
  bucket: StockBucket,
  newQty: number,
): void {
  const bucketKey = `${storeId}::${productId}::${bucket}`;
  MOCK_STOCK_BALANCES.set(bucketKey, newQty);
  if (bucket === 'AVAILABLE') {
    const legacyKey = `${storeId}::${productId}`;
    MOCK_STOCK_BALANCES.set(legacyKey, newQty);
  }
}

// @visibleForTesting
export const MOCK_STOCK_BALANCES = new Map<string, number>();

/**
 * Get current count of pending/sending outbox events.
 */
export async function getPendingOutboxCount(): Promise<number> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<number>('get_pending_outbox_count');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking get_pending_outbox_count:', err);
      throw new Error(`Failed to get pending outbox count: ${String(err)}`);
    }
  }

  throw new Error('[TransactionService] getPendingOutboxCount() requires the desktop app runtime.');
}

/**
 * Receive stock into a store.
 * Creates a RECEIPT transaction, updates stock_balances, and creates an outbox event.
 */
export async function receiveStock(input: CreateTransactionInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      const receiveInput: ReceiveStockInput = {
        store_id: input.store_id,
        product_id: input.product_id,
        quantity: input.quantity,
        reference_number: input.reference_number,
        supplier: input.supplier,
        user_id: input.user_id,
        device_id: input.device_id,
      };
      const res = await invoke<InventoryTransaction>('receive_stock', { input: receiveInput });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking receive_stock:', err);
      throw new Error(`Failed to receive stock: ${String(err)}`);
    }
  }

  throw new Error('[TransactionService] receiveStock() requires the desktop app runtime.');
}

/**
 * Sell stock from a store.
 * Creates a SALE transaction, decreases AVAILABLE stock, and creates an outbox event.
 * Enforces strict-mode negative-stock rejection.
 */
export async function sellStock(input: CreateTransactionInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      const sellInput: SellStockInput = {
        store_id: input.store_id,
        product_id: input.product_id,
        quantity: input.quantity,
        reference_number: input.reference_number,
        user_id: input.user_id,
        device_id: input.device_id,
      };
      const res = await invoke<InventoryTransaction>('sell_stock', { input: sellInput });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking sell_stock:', err);
      // Re-throw raw message so the view can parse the "Insufficient stock" rejection
      throw new Error(String(err));
    }
  }

  throw new Error('[TransactionService] sellStock() requires the desktop app runtime.');
}

/**
 * Process customer or supplier returns.
 * Customer returns increase the specified bucket (AVAILABLE, DAMAGED, or QUARANTINE).
 * Supplier returns decrease the specified bucket, enforcing strict mode balance bounds.
 */
export async function returnStock(input: ReturnStockInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<InventoryTransaction>('return_stock', { input });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking return_stock:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransactionService] returnStock() requires the desktop app runtime.');
}

/**
 * Move stock between buckets (AVAILABLE, DAMAGED, QUARANTINE).
 * Requires a non-empty reason.
 * Enforces strict-mode negative-stock prevention on the source bucket.
 */
export async function moveStockBucket(
  input: MoveStockBucketInput,
): Promise<InventoryTransaction[]> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<InventoryTransaction[]>('move_stock_bucket', { input });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking move_stock_bucket:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransactionService] moveStockBucket() requires the desktop app runtime.');
}

/**
 * Get all AVAILABLE stock balances for a store in a single query.
 * Returns a map of productId → quantity.
 * Used by DayBooksView to anchor running-balance calculations to the actual
 * stock_balances table (ground truth) rather than replaying from zero.
 */
export async function getStockBalancesForStore(storeId: string): Promise<Map<string, number>> {
  if (isTauriEnvironment()) {
    try {
      const rows = await invoke<Array<{ product_id: string; quantity: number }>>(
        'get_stock_balances_for_store',
        { storeId },
      );
      const balances = new Map(rows.map((r) => [r.product_id, r.quantity]));
      // Prime the per-product cache so subsequent getStockBalance() calls
      // for this store hit memory instead of SQLite.
      for (const [productId, quantity] of balances) {
        _writeBalanceCache(_balanceCacheKey(storeId, productId, 'AVAILABLE'), quantity);
      }
      return balances;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking get_stock_balances_for_store:', err);
      return new Map();
    }
  }
  return new Map();
}

/**
 * Get the current AVAILABLE stock balance for a product in a store.
 * Used by the Sale screen to display and validate real local stock.
 */
export async function getStockBalance(storeId: string, productId: string): Promise<StockBalance> {
  if (!isTauriEnvironment()) {
    throw new Error('[TransactionService] getStockBalance() requires the desktop app runtime.');
  }
  const cacheKey = _balanceCacheKey(storeId, productId, 'AVAILABLE');
  const cachedQuantity = _readBalanceCache(cacheKey);
  if (cachedQuantity !== undefined) {
    return {
      id: `SB-${storeId}-${productId}-AVAILABLE`,
      store_id: storeId,
      product_id: productId,
      stock_bucket: 'AVAILABLE',
      quantity: cachedQuantity,
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const quantity = await invoke<number>('get_stock_balance', {
      storeId,
      productId,
    });
    _writeBalanceCache(cacheKey, quantity);
    return {
      id: `SB-${storeId}-${productId}-AVAILABLE`,
      store_id: storeId,
      product_id: productId,
      stock_bucket: 'AVAILABLE',
      quantity,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[TransactionService] Error invoking get_stock_balance:', err);
    throw new Error(`Failed to get stock balance: ${String(err)}`);
  }
}

/**
 * Get stock balance for a specific bucket.
 */
export async function getStockBalanceForBucket(
  storeId: string,
  productId: string,
  stockBucket: StockBucket,
): Promise<StockBalance> {
  if (!isTauriEnvironment()) {
    throw new Error(
      '[TransactionService] getStockBalanceForBucket() requires the desktop app runtime.',
    );
  }
  const cacheKey = _balanceCacheKey(storeId, productId, stockBucket);
  const cachedQuantity = _readBalanceCache(cacheKey);
  if (cachedQuantity !== undefined) {
    return {
      id: `SB-${storeId}-${productId}-${stockBucket}`,
      store_id: storeId,
      product_id: productId,
      stock_bucket: stockBucket,
      quantity: cachedQuantity,
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const quantity = await invoke<number>('get_stock_balance_for_bucket', {
      storeId,
      productId,
      stockBucket,
    });
    _writeBalanceCache(cacheKey, quantity);
    return {
      id: `SB-${storeId}-${productId}-${stockBucket}`,
      store_id: storeId,
      product_id: productId,
      stock_bucket: stockBucket,
      quantity,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[TransactionService] Error invoking get_stock_balance_for_bucket:', err);
    throw new Error(`Failed to get stock balance: ${String(err)}`);
  }
}

/**
 * Physical count reconciliation — create an ADJUSTMENT transaction.
 *
 * quantity_delta = counted_quantity − system_quantity.
 * Negative delta reduces AVAILABLE stock; positive increases it.
 * Requires a non-empty reason and provisional elevated-permission flag.
 */
export async function adjustStock(input: AdjustStockInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<InventoryTransaction>('adjust_stock', { input });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking adjust_stock:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransactionService] adjustStock() requires the desktop app runtime.');
}

/**
 * Get all local transactions from SQLite for offline-first display.
 * Falls back to server API when not in Tauri.
 */
export async function getLocalTransactions(): Promise<InventoryTransaction[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<InventoryTransaction[]>('get_local_transactions');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking get_local_transactions:', err);
      throw new Error(`Failed to get local transactions: ${String(err)}`);
    }
  }

  throw new Error('[TransactionService] getLocalTransactions() requires the desktop app runtime.');
}

/**
 * Update an existing inventory transaction (row-level edit from LinearGridEntry).
 *
 * Updates quantity_delta and reference fields in local SQLite, patches the
 * stock_balances projection with the delta difference, and resets the existing
 * outbox event to PENDING so the next sync push re-pushes the updated payload.
 * The server-side ingestion handles the same transaction_id with a different
 * quantity_delta via an in-place UPDATE.
 */
export async function updateTransaction(
  input: UpdateTransactionInputType,
): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<InventoryTransaction>('update_transaction', { input });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking update_transaction:', err);
      throw new Error(`Failed to update transaction: ${String(err)}`);
    }
  }

  throw new Error('[TransactionService] updateTransaction() requires the desktop app runtime.');
}

/**
 * Delete an existing inventory transaction (row-level delete from LinearGridEntry).
 *
 * Reverses the stock_balances delta, deletes the inventory_transactions row,
 * and handles the outbox event: PERMANENT_REJECTION if not yet synced, or a
 * compensating reversal tombstone event if already synced.
 */
export async function deleteTransaction(transactionId: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('delete_transaction', { transactionId });
      invalidateStockBalanceCache();
      _triggerAutoSync();
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransactionService] Error invoking delete_transaction:', err);
      throw new Error(`Failed to delete transaction: ${String(err)}`);
    }
  }

  throw new Error('[TransactionService] deleteTransaction() requires the desktop app runtime.');
}
