import { invoke } from '@tauri-apps/api/core';
import {
  InventoryTransaction,
  CreateTransactionInput,
  StockBalance,
  ReturnStockInput,
  MoveStockBucketInput,
  AdjustStockInput,
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

/**
 * Helper function for mock balance retrieval (web/test).
 */
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

/**
 * Helper function for mock balance update (web/test).
 */
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

let mockPendingOutboxCount = 0;

export function getMockPendingOutboxCount(): number {
  return mockPendingOutboxCount;
}

export function setMockPendingOutboxCount(count: number): void {
  mockPendingOutboxCount = count;
}

export function incrementMockPendingOutboxCount(by: number = 1): void {
  mockPendingOutboxCount += by;
}

/**
 * Get current count of pending/sending outbox events (Issue 12).
 */
export async function getPendingOutboxCount(): Promise<number> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<number>('get_pending_outbox_count');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransactionService] Error invoking get_pending_outbox_count:', err);
      return mockPendingOutboxCount;
    }
  }
  return mockPendingOutboxCount;
}

/**
 * Receive stock into a store (FR-MOV-001, Section 13.1).
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
      return await invoke<InventoryTransaction>('receive_stock', { input: receiveInput });
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
 * Sell stock from a store (FR-MOV-002, Section 13.2).
 * Creates a SALE transaction, decreases AVAILABLE stock, and creates an outbox event.
 * Enforces strict-mode negative-stock rejection (FR-MOV-008, Section 21, AT-012).
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
      return await invoke<InventoryTransaction>('sell_stock', { input: sellInput });
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
 * Process customer or supplier returns (FR-MOV-003, Section 13.3).
 * Customer returns increase the specified bucket (AVAILABLE, DAMAGED, or QUARANTINE).
 * Supplier returns decrease the specified bucket, enforcing strict mode balance bounds.
 */
export async function returnStock(input: ReturnStockInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<InventoryTransaction>('return_stock', { input });
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
 * Move stock between buckets (AVAILABLE, DAMAGED, QUARANTINE) (FR-MOV-005, Section 9.5).
 * Requires a non-empty reason.
 * Enforces strict-mode negative-stock prevention on the source bucket.
 */
export async function moveStockBucket(
  input: MoveStockBucketInput,
): Promise<InventoryTransaction[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<InventoryTransaction[]>('move_stock_bucket', { input });
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
 * Get the current AVAILABLE stock balance for a product in a store (Section 9.4).
 * Used by the Sale screen to display and validate real local stock (AT-012).
 */
export async function getStockBalance(storeId: string, productId: string): Promise<StockBalance> {
  if (isTauriEnvironment()) {
    try {
      const quantity = await invoke<number>('get_stock_balance', {
        store_id: storeId,
        product_id: productId,
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
 * Get stock balance for a specific bucket (Section 9.4).
 */
export async function getStockBalanceForBucket(
  storeId: string,
  productId: string,
  stockBucket: StockBucket,
): Promise<StockBalance> {
  if (isTauriEnvironment()) {
    try {
      const quantity = await invoke<number>('get_stock_balance_for_bucket', {
        store_id: storeId,
        product_id: productId,
        stock_bucket: stockBucket,
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
 * In-memory stock balance map for the mock environment (web/test).
 * Keyed by "store_id::product_id" or "store_id::product_id::bucket".
 */
export const MOCK_STOCK_BALANCES = new Map<string, number>();

/**
 * Physical count reconciliation — create an ADJUSTMENT transaction (FR-MOV-006, Section 13.4, AT-008).
 *
 * quantity_delta = counted_quantity − system_quantity.
 * Negative delta reduces AVAILABLE stock; positive increases it.
 * Requires a non-empty reason and provisional elevated-permission flag (server enforcement: Issue 13/14).
 */
export async function adjustStock(input: AdjustStockInput): Promise<InventoryTransaction> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<InventoryTransaction>('adjust_stock', { input });
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
