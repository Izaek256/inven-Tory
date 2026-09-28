"""Add the query indexes the desktop app has always relied on.

The Tauri bootstrap created these indexes with ad-hoc ``CREATE INDEX IF NOT
EXISTS`` statements in three separate places (ensure_schema_tables, run_genesis
and run()).  A database created by ``alembic upgrade head`` therefore had none
of them, so sync pulls, day-book scans, outbox draining and the dashboard all
fell back to full table scans.  They are defined canonically here.

Each index is created only when missing, so this revision is a no-op on a
database the desktop app already bootstrapped.

``idx_products_sku`` is deliberately NOT created: it duplicated the unique
``ix_products_sku`` from 0001 on the same column. The redundant copy has been
removed from the Rust bootstrap.

Revision ID: 0008_add_query_indexes
Revises: 0007_reconcile_desktop_schema
Create Date: 2026-09-28 00:01:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_add_query_indexes"
down_revision: str | None = "0007_reconcile_desktop_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (index name, table, columns)
_INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    # Catalogue filtering and the low-stock / dashboard listings.
    ("ix_products_name", "products", ("name",)),
    ("ix_products_category", "products", ("category",)),
    ("ix_products_brand", "products", ("brand",)),
    ("ix_products_model", "products", ("model",)),
    ("ix_products_is_active", "products", ("is_active",)),
    # Delta sync: /sync/pull filters both tables on updated_at > since.
    ("idx_products_updated_at", "products", ("updated_at",)),
    ("idx_stores_updated_at", "stores", ("updated_at",)),
    # Balance lookups by store + product + bucket.
    (
        "idx_stock_balances_store_product",
        "stock_balances",
        ("store_id", "product_id", "stock_bucket"),
    ),
    # "Most sold" and day-book balance scans group by movement/date.
    ("idx_inventory_tx_movement_date", "inventory_transactions", ("movement_type", "occurred_at")),
    ("idx_inv_tx_bucket_date", "inventory_transactions", ("stock_bucket", "occurred_at")),
    # Outbox draining, by creation time and by retry schedule.
    ("idx_outbox_status_created", "outbox_events", ("status", "created_at")),
)


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        if name not in sa.inspect(op.get_bind()).get_indexes(table):
            op.create_index(name, table, list(columns), unique=False)


def downgrade() -> None:
    for name, table, _columns in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
