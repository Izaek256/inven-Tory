export type MovementType =
  'RECEIPT' | 'SALE' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT' | 'DAMAGE' | 'COUNT' | 'OTHER';
export type StockBucket = 'AVAILABLE' | 'DAMAGED' | 'QUARANTINE' | 'IN_TRANSIT';
export type SyncStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'REJECTED';

export interface InventoryTransaction {
  transaction_id: string;
  store_id: string;
  product_id: string;
  movement_type: MovementType;
  stock_bucket: StockBucket;
  quantity_delta: number;
  occurred_at: string;
  recorded_at: string;
  user_id: string;
  device_id: string;
  reference_number: string | null;
  reason_code: string | null;
  transfer_id: string | null;
  purchase_order_id: string | null;
  batch_id: string | null;
  client_sequence: number | null;
  sync_status: SyncStatus;
  server_accepted_at: string | null;
  original_transaction_id: string | null;
}

export interface CreateTransactionInput {
  store_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_number?: string;
  supplier?: string;
  user_id: string;
  device_id: string;
}

export interface StockBalance {
  id: string;
  store_id: string;
  product_id: string;
  stock_bucket: StockBucket;
  quantity: number;
  updated_at: string;
}

export interface ReturnStockInput {
  store_id: string;
  product_id: string;
  return_type: 'CUSTOMER' | 'SUPPLIER';
  stock_bucket: StockBucket;
  quantity: number;
  reference_number?: string;
  reason?: string;
  user_id: string;
  device_id: string;
}

export interface MoveStockBucketInput {
  store_id: string;
  product_id: string;
  from_bucket: StockBucket;
  to_bucket: StockBucket;
  quantity: number;
  reason: string;
  user_id: string;
  device_id: string;
}

/**
 * Input for physical count reconciliation ADJUSTMENT transaction (FR-MOV-006, Section 13.4).
 * quantity_delta = counted_quantity - system_quantity (negative = downward adjustment).
 */
export interface AdjustStockInput {
  store_id: string;
  product_id: string;
  /** counted_quantity − system_quantity; negative means physical count is lower */
  quantity_delta: number;
  reason: string;
  user_id: string;
  device_id: string;
  count_reference?: string;
}
