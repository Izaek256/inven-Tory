-- Migration: add day_books and day_book_entries tables
-- Run against the central PostgreSQL database when upgrading to a version
-- that includes the Day Book feature (Issue 8+).
--
-- Usage:
--   psql "$DATABASE_URL" -f services/api/migrations/001_add_day_books.sql

BEGIN;

CREATE TABLE IF NOT EXISTS day_books (
    id              VARCHAR(36)      PRIMARY KEY,
    store_id        VARCHAR(36)      NOT NULL REFERENCES stores(id),
    book_date       TIMESTAMPTZ      NOT NULL,
    opening_balance INTEGER          NOT NULL DEFAULT 0,
    closing_balance INTEGER,
    balance_sheet_generated BOOLEAN  NOT NULL DEFAULT FALSE,
    balance_sheet_generated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_books_store_date
    ON day_books (store_id, book_date);

CREATE TABLE IF NOT EXISTS day_book_entries (
    id                VARCHAR(36)      PRIMARY KEY,
    day_book_id       VARCHAR(36)      NOT NULL REFERENCES day_books(id) ON DELETE CASCADE,
    transaction_id    VARCHAR(36)      NOT NULL REFERENCES inventory_transactions(transaction_id),
    movement_type     VARCHAR(50)      NOT NULL,
    product_id        VARCHAR(36)      NOT NULL REFERENCES products(id),
    quantity_delta    INTEGER          NOT NULL,
    stock_bucket      VARCHAR(50)      NOT NULL DEFAULT 'AVAILABLE',
    reference_number  VARCHAR(100),
    reason_code       VARCHAR(50),
    notes             TEXT,
    occurred_at       TIMESTAMPTZ      NOT NULL,
    recorded_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_book_entries_day_book
    ON day_book_entries (day_book_id);

CREATE INDEX IF NOT EXISTS idx_day_book_entries_transaction
    ON day_book_entries (transaction_id);

CREATE INDEX IF NOT EXISTS idx_day_book_entries_product
    ON day_book_entries (product_id);

COMMIT;
