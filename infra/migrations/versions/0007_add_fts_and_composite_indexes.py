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
    op.add_column(
        "products",
        sa.Column("ts_vector", sa.TSVECTOR(), nullable=True),
    )

    op.create_index(
        "ix_products_ts_vector",
        "products",
        ["ts_vector"],
        postgresql_using="gin",
    )

    op.create_index(
        "ix_products_category_active",
        "products",
        ["category", "is_active"],
    )

    op.create_index(
        "ix_products_store_quantity",
        "products",
        ["category", "low_stock_threshold"],
    )

    op.create_index(
        "ix_stock_balances_store_product_bucket",
        "stock_balances",
        ["store_id", "product_id", "stock_bucket"],
    )

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
        "ix_stock_balances_store_product_bucket",
        table_name="stock_balances",
    )

    op.drop_index(
        "ix_products_store_quantity",
        table_name="products",
    )

    op.drop_index(
        "ix_products_category_active",
        table_name="products",
    )

    op.drop_index(
        "ix_products_ts_vector",
        table_name="products",
    )

    op.drop_column("products", "ts_vector")