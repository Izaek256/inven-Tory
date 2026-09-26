-- Migration: add ts_vector column and GIN index for PostgreSQL full-text search
-- Run against the central PostgreSQL database when upgrading to a version
-- that includes the P0 full-text search optimization work.

-- Usage:
--   psql "$DATABASE_URL" -f services/api/migrations/003_add_products_tsvector.sql

-- Add ts_vector column to products table if it doesn't exist
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS ts_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS ix_products_ts_vector
    ON products USING GIN (ts_vector);

-- Populate ts_vector from existing data (name, sku, brand, model, barcode, alternate_names)
UPDATE products
SET ts_vector =
    to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(sku, '') || ' ' ||
        COALESCE(brand, '') || ' ' ||
        COALESCE(model, '') || ' ' ||
        COALESCE(barcode, '') || ' ' ||
        COALESCE(alternate_names, '')
    )
WHERE ts_vector IS NULL;

-- Create trigger function to keep ts_vector updated
CREATE OR REPLACE FUNCTION products_tsvector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ts_vector :=
        to_tsvector('english',
            COALESCE(NEW.name, '') || ' ' ||
            COALESCE(NEW.sku, '') || ' ' ||
            COALESCE(NEW.brand, '') || ' ' ||
            COALESCE(NEW.model, '') || ' ' ||
            COALESCE(NEW.barcode, '') || ' ' ||
            COALESCE(NEW.alternate_names, '')
        );
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update ts_vector on INSERT/UPDATE
DROP TRIGGER IF EXISTS products_tsvector_trigger ON products;
CREATE TRIGGER products_tsvector_trigger
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION products_tsvector_update();