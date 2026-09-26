"""Add full-text search and composite indexes.

Adds GIN index on products.ts_vector for full-text search, composite
indexes for dashboard queries, and a partial index on stock_balances
for delta sync performance.

Revision ID: 0007_add_fts_and_composite_indexes
Revises: bdecea2c1d35
Create Date: 2026-09-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_add_fts_and_composite_indexes"
down_revision: str | None = "bdecea2c1d35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add ts_vector column
    op.add_column(
        "products",
        sa.Column("ts_vector", sa.TSVECTOR(), nullable=True),
    )

    # 2. Add GIN index for ts_vector
    op.create_index(
        "ix_products_ts_vector",
        "products",
        ["ts_vector"],
        postgresql_using="gin",
    )

    # 3. Create the tsvector trigger to auto-update
    # We use english config, indexing name, sku, brand, model, category, barcode, alternate_names
    op.execute("""
        CREATE FUNCTION update_product_tsvector() RETURNS trigger AS $$
        BEGIN
            NEW.ts_vector :=
                setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.brand, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.model, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.barcode, '')), 'C') ||
                setweight(to_tsvector('english', coalesce(NEW.alternate_names, '')), 'C');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trigger_update_product_tsvector
        BEFORE INSERT OR UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION update_product_tsvector();
    """)

    # 4. Populate existing rows
    op.execute("""
        UPDATE products SET id = id;
    """)

    # 5. Composite indexes requested in P1
    op.create_index(
        "ix_transactions_store_product_occurred",
        "transactions",
        ["store_id", "product_id", "occurred_at"],
    )

    op.create_index(
        "ix_transactions_movement_occurred",
        "transactions",
        ["movement_type", "occurred_at"],
    )

    op.create_index(
        "ix_stock_balances_product_bucket",
        "stock_balances",
        ["product_id", "stock_bucket"],
    )

    # Partial index on stock_balances (already in original 0007, kept for delta sync)
    op.create_index(
        "ix_stock_balances_updated_at_not_null",
        "stock_balances",
        ["updated_at"],
        postgresql_where=sa.text("updated_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_stock_balances_updated_at_not_null",
        table_name="stock_balances",
    )

    op.drop_index(
        "ix_stock_balances_product_bucket",
        table_name="stock_balances",
    )

    op.drop_index(
        "ix_transactions_movement_occurred",
        table_name="transactions",
    )

    op.drop_index(
        "ix_transactions_store_product_occurred",
        table_name="transactions",
    )

    op.execute("DROP TRIGGER IF EXISTS trigger_update_product_tsvector ON products;")
    op.execute("DROP FUNCTION IF EXISTS update_product_tsvector();")

    op.drop_index(
        "ix_products_ts_vector",
        table_name="products",
    )

    op.drop_column("products", "ts_vector")