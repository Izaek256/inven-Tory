"""Add full-text search, delta-sync and dashboard query indexes.

This is the single canonical place where the schema changes that used to be
hand-applied as ``services/api/migrations/*.sql`` are defined.  Those raw SQL
files were a second, unversioned migration system for the same database and
have been removed; every object they created is created here instead.

Contents
--------
* ``products.ts_vector``  — weighted ``tsvector`` column plus a ``BEFORE
  INSERT OR UPDATE`` trigger function and a GIN index.
* Delta-sync indexes      — ``/sync/pull`` and ``/sync/status`` filter on
  ``updated_at`` / ``received_at`` columns.
* Dashboard composite indexes for the ledger and stock projections.

Every statement is written with ``IF [NOT] EXISTS`` so a database that already
received part of this work out-of-band (a half-applied run, or a database that
was patched with the old raw SQL scripts before this revision existed) upgrades
without a manual ``alembic stamp``.

Fixes applied to the previous version of this file
-------------------------------------------------
* ``sa.TSVECTOR()`` does not exist; the correct type is
  ``sqlalchemy.dialects.postgresql.TSVECTOR``.
* The composite indexes were created on a table named ``transactions``, which
  does not exist.  The ledger table is ``inventory_transactions``.
* ``ix_transactions_store_product_occurred`` duplicated
  ``ix_inv_tx_store_prod_date``, already created by 0002, so it is not created
  here at all.
* The trigger/function used plain ``CREATE``, so re-running it failed; they now
  use ``CREATE OR REPLACE`` and the legacy objects from the removed
  ``003_add_products_tsvector.sql`` are dropped so exactly one trigger remains.

Revision ID: 0007_fts_and_composite_indexes
Revises: bdecea2c1d35
Create Date: 2026-09-25 00:00:00.000000

Note: ``alembic_version.version_num`` is ``VARCHAR(32)``, so a revision id may
not exceed 32 characters.  The file name is longer than the id; only the id is
constrained.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007_fts_and_composite_indexes"
down_revision: str | None = "bdecea2c1d35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Indexes created by this revision, as (name, table, columns, access method).
# ``upgrade`` and ``downgrade`` are generated from this single list so the two
# directions can never drift apart.
# ---------------------------------------------------------------------------
_INDEXES: tuple[tuple[str, str, str, str], ...] = (
    # products — full-text search
    ("ix_products_ts_vector", "products", "ts_vector", "gin"),
    # products — delta sync / catalogue listing / low-stock dashboard
    ("ix_products_updated_at", "products", "updated_at", "btree"),
    ("ix_products_category_active", "products", "category, is_active", "btree"),
    ("ix_products_store_quantity", "products", "category, low_stock_threshold", "btree"),
    # inventory_transactions — "most sold" and day-book balance scans
    ("ix_inv_tx_movement_date", "inventory_transactions", "movement_type, occurred_at", "btree"),
    # stock_balances — delta sync
    ("ix_stock_balances_updated_at", "stock_balances", "updated_at", "btree"),
    (
        "ix_stock_balances_store_product_bucket",
        "stock_balances",
        "store_id, product_id, stock_bucket",
        "btree",
    ),
    ("ix_stock_balances_product_bucket", "stock_balances", "product_id, stock_bucket", "btree"),
    # sync_receipts — /sync/status 24 h receipt counter
    ("ix_sync_receipts_received_at", "sync_receipts", "received_at", "btree"),
    ("ix_sync_receipts_received_accepted", "sync_receipts", "received_at, accepted", "btree"),
)

# Partial index: the column is NOT NULL in the model, but the predicate keeps
# the index small on any database where it is not, and matches StockBalance's
# declared metadata so autogenerate does not report drift.
_PARTIAL_INDEX = (
    "ix_stock_balances_updated_at_not_null",
    "stock_balances",
    "updated_at",
    "btree",
    "updated_at IS NOT NULL",
)

# Objects created by the now-removed services/api/migrations/003_*.sql script.
# They must be dropped so a single trigger maintains products.ts_vector.
_LEGACY_TSVECTOR_OBJECTS = ("products_tsvector_trigger", "products_tsvector_update")


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. products.ts_vector + keep-in-sync trigger + GIN index
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS ts_vector tsvector")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_product_tsvector() RETURNS trigger AS $$
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
        """
    )

    # Exactly one BEFORE INSERT OR UPDATE trigger must own ts_vector.
    op.execute("DROP TRIGGER IF EXISTS trigger_update_product_tsvector ON products")
    for legacy_object in _LEGACY_TSVECTOR_OBJECTS:
        op.execute(f"DROP TRIGGER IF EXISTS {legacy_object} ON products")
        op.execute(f"DROP FUNCTION IF EXISTS {legacy_object}()")

    op.execute(
        """
        CREATE TRIGGER trigger_update_product_tsvector
        BEFORE INSERT OR UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION update_product_tsvector()
        """
    )

    # Backfill only rows that have never been indexed. The self-assignment of
    # `name` fires the BEFORE UPDATE trigger, which recomputes ts_vector.
    op.execute("UPDATE products SET name = name WHERE ts_vector IS NULL")

    for name, table, columns, method in _INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} USING {method} ({columns})")

    name, table, columns, method, where = _PARTIAL_INDEX
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {name} ON {table} USING {method} ({columns}) WHERE {where}"
    )


def downgrade() -> None:
    name, _table, _columns, _method, _where = _PARTIAL_INDEX
    op.execute(f"DROP INDEX IF EXISTS {name}")

    for name, _table, _columns, _method in reversed(_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")

    op.execute("DROP TRIGGER IF EXISTS trigger_update_product_tsvector ON products")
    op.execute("DROP FUNCTION IF EXISTS update_product_tsvector()")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS ts_vector")
