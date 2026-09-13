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
      console.error('[TauriTransactionService] Error invoking get_pending_outbox_count:', err);
      throw new Error(`Failed to get pending outbox count: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] getPendingOutboxCount() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking receive_stock:', err);
      throw new Error(`Failed to receive stock: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] receiveStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking sell_stock:', err);
      // Re-throw raw message so the view can parse the "Insufficient stock" rejection
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransactionService] sellStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking return_stock:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransactionService] returnStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking move_stock_bucket:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransactionService] moveStockBucket() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      return new Map(rows.map((r) => [r.product_id, r.quantity]));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking get_stock_balances_for_store:', err);
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
  if (isTauriEnvironment()) {
    try {
      const quantity = await invoke<number>('get_stock_balance', {
        storeId,
        productId,
      });
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
      console.error('[TauriTransactionService] Error invoking get_stock_balance:', err);
      throw new Error(`Failed to get stock balance: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] getStockBalance() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Get stock balance for a specific bucket.
 */
export async function getStockBalanceForBucket(
  storeId: string,
  productId: string,
  stockBucket: StockBucket,
): Promise<StockBalance> {
  if (isTauriEnvironment()) {
    try {
      const quantity = await invoke<number>('get_stock_balance_for_bucket', {
        storeId,
        productId,
        stockBucket,
      });
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
      console.error('[TauriTransactionService] Error invoking get_stock_balance_for_bucket:', err);
      throw new Error(`Failed to get stock balance: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] getStockBalanceForBucket() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking adjust_stock:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransactionService] adjustStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      console.error('[TauriTransactionService] Error invoking get_local_transactions:', err);
      throw new Error(`Failed to get local transactions: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] getLocalTransactions() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking update_transaction:', err);
      throw new Error(`Failed to update transaction: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] updateTransaction() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      _triggerAutoSync();
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking delete_transaction:', err);
      throw new Error(`Failed to delete transaction: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransactionService] deleteTransaction() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}
