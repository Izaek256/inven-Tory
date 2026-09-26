-- Migration: add performance indexes for hot query paths
-- Run against the central PostgreSQL database when upgrading to a version
-- that includes the performance optimization work.
--
-- Usage:
--   psql "$DATABASE_URL" -f services/api/migrations/002_add_performance_indexes.sql

-- 1. Dashboard "most sold" / day-book balance scans aggregate SALE rows by
--    movement_type + occurred_at. A seq scan on a large ledger is avoided by
--    this composite index.
CREATE INDEX IF NOT EXISTS ix_inv_tx_movement_date
    ON inventory_transactions (movement_type, occurred_at);

-- 2. /sync/pull delta sync filters products by updated_at > since. A large
--    catalogue benefits from an updated_at index (plan is Index Scan, not seq).
CREATE INDEX IF NOT EXISTS ix_products_updated_at
    ON products (updated_at);

-- 3. /sync/pull delta sync filters stock balances by updated_at > since.
CREATE INDEX IF NOT EXISTS ix_stock_balances_updated_at
    ON stock_balances (updated_at);

-- 4. /sync/status counts receipts received in the last 24 h; this covering
--    index lets the count skip the receipt rows entirely.
CREATE INDEX IF NOT EXISTS ix_sync_receipts_received_accepted
    ON sync_receipts (received_at, accepted);
-- 5. Ledger queries by store and product
CREATE INDEX IF NOT EXISTS ix_inv_tx_store_prod_date
    ON inventory_transactions (store_id, product_id, occurred_at);

-- 6. Stock balance lookup by product
CREATE INDEX IF NOT EXISTS ix_stock_balances_product_bucket
    ON stock_balances (product_id, stock_bucket);
