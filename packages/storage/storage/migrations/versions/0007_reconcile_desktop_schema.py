"""Reconcile the local SQLite schema with the desktop app.

The Tauri desktop app bootstraps its own database from Rust
(``ensure_schema_tables`` in apps/desktop/src-tauri/src/lib.rs) because a
compiled Rust binary cannot run Alembic.  Until now that Rust bootstrap owned
several tables, triggers and a column that existed in **no** migration, so a
database created by ``alembic upgrade head`` was missing objects the desktop
app requires at runtime.

This revision is the canonical definition of those objects.  Both systems now
describe the same schema; the Rust bootstrap mirrors this file.

Objects added:
* ``users.assigned_store_id`` — written by the cloud-restore path; the INSERT
  was failing silently because no schema declared the column.
* ``kv_store`` — desktop key/value store (restore flags, sync timestamps,
  daily-backup bookkeeping).  Defined once here, replacing two conflicting
  Rust DDL blocks that disagreed on ``value`` nullability.
* ``day_books`` / ``day_book_entries`` — daily ledger projection written after
  every stock movement.
* ``daily_stock_snapshot`` plus the two triggers that maintain it, so each
  stock write upserts a same-day snapshot row in the same transaction.

Also carries the guarded column repairs that used to live in the Rust
bootstrap's ad-hoc ``ALTER TABLE`` list, so legacy local databases still get
them applied from the canonical chain. A column added this way to a table that
already has rows can only be nullable, so a legacy database ends up with a
nullable ``outbox_events.event_id`` where a fresh database has ``NOT NULL``;
the desktop app always writes that column, so the difference is not observable.
Every other object is created only when missing, so this revision is safe on
both fresh and already-bootstrapped databases.

Revision ID: 0007_reconcile_desktop_schema
Revises: 0006_fix_fts5_triggers
Create Date: 2026-09-28 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_reconcile_desktop_schema"
down_revision: str | None = "0006_fix_fts5_triggers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    if not _table_exists(table):
        return False
    columns = {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}
    return column in columns


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    """Add a column to an existing table, skipping tables this revision creates.

    A table that does not exist yet is left alone rather than raising, because
    every table this revision creates is created with its full column set.
    """
    if _table_exists(table) and not _column_exists(table, column.name):
        op.add_column(table, column)


def _create_table_if_missing(table: str, *constraints: sa.SchemaItem) -> None:
    if not _table_exists(table):
        op.create_table(table, *constraints)


def _create_index_if_missing(name: str, table: str, columns: list[str]) -> None:
    if name not in sa.inspect(op.get_bind()).get_indexes(table):
        op.create_index(name, table, columns, unique=False)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Column repairs for legacy local databases.
    #    These columns are part of 0001, but databases created by older builds
    #    of the desktop app predate them.
    # ------------------------------------------------------------------
    _add_column_if_missing(
        "inventory_transactions",
        sa.Column("original_transaction_id", sa.String(length=36), nullable=True),
    )
    _add_column_if_missing(
        "outbox_events", sa.Column("event_id", sa.String(length=36), nullable=True)
    )
    _add_column_if_missing(
        "outbox_events",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    _add_column_if_missing(
        "outbox_events", sa.Column("next_attempt_at", sa.DateTime(), nullable=True)
    )
    _add_column_if_missing("outbox_events", sa.Column("last_error", sa.Text(), nullable=True))
    # kv_store may already exist in a legacy database as a 2-column table.
    _add_column_if_missing(
        "kv_store",
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # ------------------------------------------------------------------
    # 2. users.assigned_store_id — read/written by the cloud-restore path.
    # ------------------------------------------------------------------
    _add_column_if_missing(
        "users", sa.Column("assigned_store_id", sa.String(length=36), nullable=True)
    )

    # ------------------------------------------------------------------
    # 3. kv_store
    # ------------------------------------------------------------------
    _create_table_if_missing(
        "kv_store",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("key", name="pk_kv_store"),
    )

    # ------------------------------------------------------------------
    # 4. day_books / day_book_entries
    # ------------------------------------------------------------------
    _create_table_if_missing(
        "day_books",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("book_date", sa.DateTime(), nullable=False),
        sa.Column("opening_balance", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("closing_balance", sa.Integer(), nullable=True),
        sa.Column(
            "balance_sheet_generated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("balance_sheet_generated_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_day_books"),
    )
    _create_index_if_missing("idx_day_books_store_date", "day_books", ["store_id", "book_date"])

    _create_table_if_missing(
        "day_book_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("day_book_id", sa.String(length=36), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("movement_type", sa.String(length=50), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column(
            "stock_bucket",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'AVAILABLE'"),
        ),
        sa.Column("reference_number", sa.String(length=100), nullable=True),
        sa.Column("reason_code", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["day_book_id"], ["day_books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["inventory_transactions.transaction_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id", name="pk_day_book_entries"),
    )
    _create_index_if_missing("idx_day_book_entries_day_book", "day_book_entries", ["day_book_id"])
    _create_index_if_missing(
        "idx_day_book_entries_transaction", "day_book_entries", ["transaction_id"]
    )
    _create_index_if_missing("idx_day_book_entries_product", "day_book_entries", ["product_id"])

    # ------------------------------------------------------------------
    # 5. daily_stock_snapshot + triggers.
    #    Maintained by triggers on stock_balances so each write pays a
    #    single-row upsert in the same transaction instead of a per-command
    #    full stock recomputation on the analytics hot path. snapshot_date
    #    uses UTC date('now') to stay consistent with the RFC3339 UTC
    #    timestamps on inventory_transactions.occurred_at.
    # ------------------------------------------------------------------
    _create_table_if_missing(
        "daily_stock_snapshot",
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column(
            "stock_bucket",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'AVAILABLE'"),
        ),
        sa.Column("snapshot_date", sa.String(length=10), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint(
            "store_id",
            "product_id",
            "stock_bucket",
            "snapshot_date",
            name="pk_daily_stock_snapshot",
        ),
    )

    # The triggers are created with plain CREATE so a second run of this
    # revision on a database that already has them (e.g. one bootstrapped by
    # the desktop app) is a no-op rather than an error.
    op.get_bind().execute(sa.text("""
            CREATE TRIGGER IF NOT EXISTS trg_daily_stock_snapshot_ins
            AFTER INSERT ON stock_balances
            BEGIN
                INSERT INTO daily_stock_snapshot (store_id, product_id, stock_bucket, snapshot_date, quantity, updated_at)
                VALUES (NEW.store_id, NEW.product_id, NEW.stock_bucket, date('now'), NEW.quantity, NEW.updated_at)
                ON CONFLICT(store_id, product_id, stock_bucket, snapshot_date)
                DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at;
            END
            """))
    op.get_bind().execute(sa.text("""
            CREATE TRIGGER IF NOT EXISTS trg_daily_stock_snapshot_upd
            AFTER UPDATE OF quantity ON stock_balances
            BEGIN
                INSERT INTO daily_stock_snapshot (store_id, product_id, stock_bucket, snapshot_date, quantity, updated_at)
                VALUES (NEW.store_id, NEW.product_id, NEW.stock_bucket, date('now'), NEW.quantity, NEW.updated_at)
                ON CONFLICT(store_id, product_id, stock_bucket, snapshot_date)
                DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at;
            END
            """))

    # Existing balances get a same-day anchor so analytics is never empty on
    # a database created before the snapshot table existed.
    op.get_bind().execute(sa.text("""
            INSERT OR IGNORE INTO daily_stock_snapshot
                (store_id, product_id, stock_bucket, snapshot_date, quantity, updated_at)
            SELECT store_id, product_id, stock_bucket, date('now'), quantity, updated_at
            FROM stock_balances
            """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TRIGGER IF EXISTS trg_daily_stock_snapshot_upd"))
    op.get_bind().execute(sa.text("DROP TRIGGER IF EXISTS trg_daily_stock_snapshot_ins"))
    op.drop_table("daily_stock_snapshot")

    op.drop_index("idx_day_book_entries_product", table_name="day_book_entries")
    op.drop_index("idx_day_book_entries_transaction", table_name="day_book_entries")
    op.drop_index("idx_day_book_entries_day_book", table_name="day_book_entries")
    op.drop_table("day_book_entries")

    op.drop_index("idx_day_books_store_date", table_name="day_books")
    op.drop_table("day_books")

    # kv_store holds desktop state (restore flag, sync timestamps). It is
    # deliberately left in place on downgrade so rolling the schema back does
    # not silently destroy that state.

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("assigned_store_id")
