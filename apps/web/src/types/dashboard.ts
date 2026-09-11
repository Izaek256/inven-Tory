/**
 * API response types for Issue 16 dashboard endpoints.
 * Mirrors the Pydantic schemas in services/api/app/api/v1/products.py
 * and services/api/app/api/v1/stores.py.
 */

export type FreshnessStatus = 'FRESH' | 'RECENT' | 'STALE' | 'VERY_STALE';

// ---------------------------------------------------------------------------
// Product search
// ---------------------------------------------------------------------------

export interface ProductSearchResult {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  unit: string;
  is_active: boolean;
  low_stock_threshold: number | null;
  /** Total AVAILABLE quantity summed across all stores. */
  total_quantity: number | null;
  /** ISO-8601 timestamp of the most recent stock balance update for this product. */
  last_balance_update: string | null;
  /**
   * Per-store quantity breakdown (AVAILABLE bucket) — populated when the
   * backend is queried with ?scope=all-stores (Phase 3, Task D).
   */
  store_quantities: StoreQuantity[];
}

export interface StoreQuantity {
  store_id: string;
  store_name: string;
  quantity: number;
}

export interface ProductSearchResponse {
  results: ProductSearchResult[];
  total: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Product inventory (per-store breakdown)
// ---------------------------------------------------------------------------

export interface StoreInventoryRow {
  store_id: string;
  store_code: string;
  store_name: string;
  stock_bucket: string;
  quantity: number;
  updated_at: string; // ISO-8601
}

export interface ProductInventoryResponse {
  product_id: string;
  product_name: string;
  product_sku: string;
  stores: StoreInventoryRow[];
  total_quantity: number;
}

// ---------------------------------------------------------------------------
// Product movement history
// ---------------------------------------------------------------------------

export interface MovementHistoryRow {
  transaction_id: string;
  store_id: string;
  store_code: string;
  store_name: string;
  movement_type: string;
  stock_bucket: string;
  quantity_delta: number;
  occurred_at: string; // ISO-8601
  reference_number: string | null;
  reason_code: string | null;
}

export interface ProductHistoryResponse {
  product_id: string;
  product_name: string;
  product_sku: string;
  rows: MovementHistoryRow[];
  total_rows: number;
}

// ---------------------------------------------------------------------------
// Store inventory snapshot
// ---------------------------------------------------------------------------

export interface StoreProductRow {
  product_id: string;
  product_sku: string;
  product_name: string;
  category: string;
  unit: string;
  stock_bucket: string;
  quantity: number;
  balance_updated_at: string; // ISO-8601
}

export interface StoreInventoryResponse {
  store_id: string;
  store_code: string;
  store_name: string;
  is_active: boolean;
  last_sync_at: string | null; // ISO-8601 or null
  freshness: FreshnessStatus;
  products: StoreProductRow[];
  total_products: number;
  total_quantity: number;
}

export interface MostSoldProductMetric {
  product_id: string;
  product_name: string;
  sku: string;
  units_sold: number;
}

export interface LowStockProductMetric {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  quantity: number;
  threshold: number;
}

export interface CrossStoreSummaryMetric {
  products_in_multiple_stores: number;
  stores_with_stock: number;
  combined_quantity: number;
}

export interface ReceiptSalesDayMetric {
  /** YYYY-MM-DD */
  date: string;
  receipt_count: number;
  items_sold: number;
  avg_items_per_receipt: number;
}

export interface DashboardMetrics {
  total_products: number;
  total_stock_units: number;
  last_sync_at: string | null;
  most_sold: MostSoldProductMetric[];
  low_stock: LowStockProductMetric[];
  cross_store: CrossStoreSummaryMetric;
  receipt_linked_sales: ReceiptSalesDayMetric[];
}
