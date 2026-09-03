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
  barcode: string | null;
  is_active: boolean;
  low_stock_threshold: number | null;
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

// ---------------------------------------------------------------------------
// Store list
// ---------------------------------------------------------------------------

export interface StoreListItem {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}
