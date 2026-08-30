import { invoke } from '@tauri-apps/api/core';
import { InventoryTransaction, CreateTransactionInput } from '../types/transaction';
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
