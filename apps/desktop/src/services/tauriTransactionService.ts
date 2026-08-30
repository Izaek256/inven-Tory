import { invoke } from '@tauri-apps/api/core';
import { InventoryTransaction, CreateTransactionInput, StockBalance } from '../types/transaction';
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

  // Mock implementation for web/test
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const now = new Date().toISOString();
  const transactionId = `TX-${Date.now()}`;

  // Update mock stock balance tracker
  const balanceKey = `${input.store_id}::${input.product_id}`;
  const current = MOCK_STOCK_BALANCES.get(balanceKey) ?? 0;
  MOCK_STOCK_BALANCES.set(balanceKey, current + input.quantity);

  const transaction: InventoryTransaction = {
    transaction_id: transactionId,
    store_id: input.store_id,
    product_id: input.product_id,
    movement_type: 'RECEIPT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: input.quantity,
    occurred_at: now,
    recorded_at: now,
    user_id: input.user_id,
    device_id: input.device_id,
    reference_number: input.reference_number || null,
    reason_code: input.supplier || null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING',
    server_accepted_at: null,
    original_transaction_id: null,
  };

  return transaction;
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

  // Mock implementation for web/test — enforces strict mode (FR-MOV-008)
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  // Read current mock balance and enforce strict mode
  const balanceKey = `${input.store_id}::${input.product_id}`;
  const available = MOCK_STOCK_BALANCES.get(balanceKey) ?? 0;
  if (input.quantity > available) {
    // AT-012: rejection message must include the available quantity
    throw new Error(
      `Insufficient stock. Available quantity: ${available}. Cannot sell ${input.quantity} units.`,
    );
  }

  // Commit: deduct from mock balance
  MOCK_STOCK_BALANCES.set(balanceKey, available - input.quantity);

  const now = new Date().toISOString();
  const transactionId = `TX-${Date.now()}`;

  const transaction: InventoryTransaction = {
    transaction_id: transactionId,
    store_id: input.store_id,
    product_id: input.product_id,
    movement_type: 'SALE',
    stock_bucket: 'AVAILABLE',
    quantity_delta: -input.quantity,
    occurred_at: now,
    recorded_at: now,
    user_id: input.user_id,
    device_id: input.device_id,
    reference_number: input.reference_number || null,
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING',
    server_accepted_at: null,
    original_transaction_id: null,
  };

  return transaction;
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

  // Mock: read from in-memory balance tracker
  const balanceKey = `${storeId}::${productId}`;
  const quantity = MOCK_STOCK_BALANCES.get(balanceKey) ?? 0;
  return {
    id: `SB-${storeId}-${productId}-AVAILABLE`,
    store_id: storeId,
    product_id: productId,
    stock_bucket: 'AVAILABLE',
    quantity,
    updated_at: new Date().toISOString(),
  };
}

/**
 * In-memory stock balance map for the mock environment (web/test).
 * Keyed by "store_id::product_id". Exported so tests can seed it directly.
 */
export const MOCK_STOCK_BALANCES = new Map<string, number>();
