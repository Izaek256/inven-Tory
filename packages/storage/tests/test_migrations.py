"""
Tests for local SQLite Alembic schema migrations and idempotency.

`packages/storage/storage/migrations/` is the canonical migration chain for the
local (desktop) SQLite database. These tests assert both that the chain applies
cleanly and that it produces every schema object the desktop app actually uses
at runtime — the check that was previously impossible because those objects
lived only in the Tauri Rust bootstrap.
"""

import sqlite3

from sqlalchemy import inspect

from storage.db import get_engine
from storage.migrations.runner import run_migrations

# Tables the desktop app writes to. Every one must exist after `upgrade head`.
_DESKTOP_TABLES = {
    "stores",
    "devices",
    "users",
    "products",
    "stock_balances",
    "transfers",
    "inventory_transactions",
    "outbox_events",
    # Added by 0007 — previously only created by the Rust bootstrap.
    "kv_store",
    "day_books",
    "day_book_entries",
    "daily_stock_snapshot",
}

# Columns each table must expose, beyond the primary key.
_DESKTOP_COLUMNS = {
    "users": {
        "username",
        "email",
        "pin_hash",
        "full_name",
        "role",
        "is_active",
        "created_at",
        # Written by apply_restore_critical; no schema declared it before 0007,
        # so cloud restore silently dropped every user.
        "assigned_store_id",
    },
    "products": {
        "sku",
        "name",
        "brand",
        "model",
        "category",
        "unit",
        "barcode",
        "alternate_names",
        "serial_tracking_enabled",
        "is_active",
        "low_stock_threshold",
        "warranty_days",
        "batch_tracking_enabled",
        "created_at",
        "updated_at",
    },
    "inventory_transactions": {
        "store_id",
        "product_id",
        "movement_type",
        "stock_bucket",
        "quantity_delta",
        "occurred_at",
        "recorded_at",
        "user_id",
        "device_id",
        "reference_number",
        "reason_code",
        "transfer_id",
        "purchase_order_id",
        "batch_id",
        "client_sequence",
        "sync_status",
        "server_accepted_at",
        "original_transaction_id",
    },
    "outbox_events": {
        "event_id",
        "event_type",
        "payload",
        "status",
        "retry_count",
        "next_attempt_at",
        "created_at",
        "last_error",
    },
    "kv_store": {"key", "value", "updated_at"},
    "day_books": {
        "store_id",
        "book_date",
        "opening_balance",
        "closing_balance",
        "balance_sheet_generated",
        "balance_sheet_generated_at",
        "created_at",
        "updated_at",
    },
    "day_book_entries": {
        "day_book_id",
        "transaction_id",
        "movement_type",
        "product_id",
        "quantity_delta",
        "stock_bucket",
        "reference_number",
        "reason_code",
        "notes",
        "occurred_at",
        "recorded_at",
    },
    "daily_stock_snapshot": {
        "store_id",
        "product_id",
        "stock_bucket",
        "snapshot_date",
        "quantity",
        "updated_at",
    },
}

# Triggers the desktop app depends on. products_ai/ad/au keep the FTS5 index in
# sync; the snapshot triggers maintain daily_stock_snapshot on every write.
_DESKTOP_TRIGGERS = {
    "products_ai",
    "products_ad",
    "products_au",
    "trg_daily_stock_snapshot_ins",
    "trg_daily_stock_snapshot_upd",
}

# Indexes the app's hot paths rely on, keyed by table.
_DESKTOP_INDEXES = {
    "products": {
        "ix_products_sku",
        "ix_products_barcode",
        "ix_products_low_stock_threshold",
        "ix_products_name",
        "ix_products_category",
        "ix_products_brand",
        "ix_products_model",
        "ix_products_is_active",
        "idx_products_updated_at",
    },
    "stores": {"ix_stores_code", "idx_stores_updated_at"},
    "inventory_transactions": {
        "ix_inv_tx_prod_store_date",
        "ix_inv_tx_store_prod_date",
        "idx_inventory_tx_movement_date",
        "idx_inv_tx_bucket_date",
    },
    "stock_balances": {
        "ix_stock_balances_store_id",
        "ix_stock_balances_product_id",
        "idx_stock_balances_store_product",
    },
    "outbox_events": {
        "ix_outbox_events_event_id",
        "ix_outbox_status_next_attempt",
        "idx_outbox_status_created",
    },
    "day_books": {"idx_day_books_store_date"},
    "day_book_entries": {
        "idx_day_book_entries_day_book",
        "idx_day_book_entries_transaction",
        "idx_day_book_entries_product",
    },
}


def _schema_snapshot(db_url):
    """Every (type, name, sql) triple in the database, for exact comparison."""
    engine = get_engine(db_url)
    try:
        with engine.connect() as connection:
            rows = connection.exec_driver_sql(
                "SELECT type, name, COALESCE(sql, '') FROM sqlite_master ORDER BY type, name"
            ).fetchall()
        return sorted(rows)
    finally:
        engine.dispose()


def test_migrations_fresh_and_idempotence(tmp_path):
    """
    Test applying migrations to a fresh database and re-running migrations twice
    to ensure idempotency and schema correctness per Section 16.1 & 16.2.
    """
    db_file = tmp_path / "test_migrations.db"
    db_url = f"sqlite:///{db_file}"

    # 1. First migration run against fresh SQLite file
    run_migrations(db_url)

    engine = get_engine(db_url)
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    assert _DESKTOP_TABLES.issubset(set(tables))

    # Verify Section 16.1 product additions exist in database schema
    prod_columns = {col["name"] for col in inspector.get_columns("products")}
    assert "low_stock_threshold" in prod_columns
    assert "warranty_days" in prod_columns
    assert "batch_tracking_enabled" in prod_columns

    # Verify Section 16.1 inventory transaction additions exist
    tx_columns = {col["name"] for col in inspector.get_columns("inventory_transactions")}
    assert "purchase_order_id" in tx_columns
    assert "batch_id" in tx_columns

    # Verify Section 16.2 indexes
    prod_indexes = {idx["name"] for idx in inspector.get_indexes("products")}
    assert "ix_products_sku" in prod_indexes
    assert "ix_products_low_stock_threshold" in prod_indexes

    tx_indexes = {idx["name"] for idx in inspector.get_indexes("inventory_transactions")}
    assert "ix_inv_tx_prod_store_date" in tx_indexes or "ix_inv_tx_store_prod_date" in tx_indexes

    outbox_indexes = {idx["name"] for idx in inspector.get_indexes("outbox_events")}
    assert "ix_outbox_status_next_attempt" in outbox_indexes

    # Dispose initial engine connection pool before re-running migrations
    engine.dispose()

    # 2. Re-run migration twice to verify idempotency (Acceptance Criteria)
    run_migrations(db_url)
    run_migrations(db_url)

    # Verify schema is unchanged using a fresh engine and inspector
    engine_after = get_engine(db_url)
    inspector_after = inspect(engine_after)
    tables_after = inspector_after.get_table_names()
    assert _DESKTOP_TABLES.issubset(set(tables_after))

    engine_after.dispose()


def test_migrations_are_byte_identical_when_rerun(tmp_path):
    """Re-running the chain must not add, drop or redefine anything."""
    db_file = tmp_path / "test_migrations_stable.db"
    db_url = f"sqlite:///{db_file}"

    run_migrations(db_url)
    first = _schema_snapshot(db_url)

    run_migrations(db_url)
    run_migrations(db_url)
    second = _schema_snapshot(db_url)

    assert first == second


def test_local_schema_covers_desktop_runtime_objects(tmp_path):
    """
    The canonical chain must produce every schema object the Tauri desktop app
    uses. This is the counterpart to the Rust test
    `bootstrap_creates_every_object_the_desktop_requires`: if one side gains an
    object the other does not, one of the two tests fails.
    """
    db_file = tmp_path / "test_desktop_objects.db"
    db_url = f"sqlite:///{db_file}"
    run_migrations(db_url)

    engine = get_engine(db_url)
    inspector = inspect(engine)
    try:
        tables = set(inspector.get_table_names())
        assert _DESKTOP_TABLES.issubset(
            tables
        ), f"missing tables: {sorted(_DESKTOP_TABLES - tables)}"

        for table, required in _DESKTOP_COLUMNS.items():
            present = {col["name"] for col in inspector.get_columns(table)}
            assert required.issubset(
                present
            ), f"{table} missing columns: {sorted(required - present)}"

        for table, required in _DESKTOP_INDEXES.items():
            present = {idx["name"] for idx in inspector.get_indexes(table)}
            assert required.issubset(
                present
            ), f"{table} missing indexes: {sorted(required - present)}"
    finally:
        engine.dispose()

    # Triggers and the FTS5 virtual table are not exposed by the SQLAlchemy
    # inspector, so read them straight from sqlite_master.
    with sqlite3.connect(db_file) as connection:
        triggers = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        }
        assert _DESKTOP_TRIGGERS.issubset(
            triggers
        ), f"missing triggers: {sorted(_DESKTOP_TRIGGERS - triggers)}"
        assert "products_fts" in tables

        # The snapshot triggers must actually fire, not merely exist.
        connection.executescript("""
            INSERT INTO stores (id, code, name, is_active, created_at, updated_at)
            VALUES ('S-T', 'T', 'Test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO products (id, sku, name, category, unit, is_active, created_at, updated_at)
            VALUES ('P-T', 'SKU-T', 'Widget', 'Cat', 'pcs', 1,
                    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO stock_balances
                (id, store_id, product_id, stock_bucket, quantity, updated_at)
            VALUES ('B-T', 'S-T', 'P-T', 'AVAILABLE', 5, '2026-01-01T00:00:00Z');
            """)
        count = connection.execute(
            "SELECT COUNT(*) FROM daily_stock_snapshot WHERE product_id = 'P-T'"
        ).fetchone()[0]
        assert count == 1, "daily_stock_snapshot trigger did not fire"

        # FTS5 index is populated by the products_ai trigger.
        hits = connection.execute(
            "SELECT COUNT(*) FROM products_fts WHERE products_fts MATCH 'widget'"
        ).fetchone()[0]
        assert hits == 1, "products_fts index is not maintained by triggers"

        # The chain is fully applied and recorded.
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert version == "0008_add_query_indexes"


def test_existing_database_upgrades_forward_without_data_loss(tmp_path):
    """
    A database left at an earlier revision must migrate to head with its rows
    intact, and the objects added by the reconciliation must be backfilled from
    the rows that were already there.
    """
    db_file = tmp_path / "test_existing.db"
    db_url = f"sqlite:///{db_file}"

    # Stop at 0006, the head before the desktop reconciliation.
    run_migrations(db_url, revision="0006_fix_fts5_triggers")

    engine = get_engine(db_url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO stores (id, code, name, is_active, created_at, updated_at) "
            "VALUES ('S1', 'S1', 'Store One', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
        )
        connection.exec_driver_sql(
            "INSERT INTO products (id, sku, name, category, unit, is_active, created_at, updated_at) "
            "VALUES ('P1', 'SKU-1', 'Widget Pro', 'Tools', 'pcs', 1, "
            "'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
        )
        connection.exec_driver_sql(
            "INSERT INTO stock_balances "
            "(id, store_id, product_id, stock_bucket, quantity, updated_at) "
            "VALUES ('B1', 'S1', 'P1', 'AVAILABLE', 42, '2026-01-01T00:00:00Z')"
        )
        connection.exec_driver_sql(
            "INSERT INTO users (id, username, email, role, is_active, created_at) "
            "VALUES ('U1', 'clerk', 'clerk@store.test', 'STORE_CLERK', 1, "
            "'2026-01-01T00:00:00Z')"
        )
    engine.dispose()

    run_migrations(db_url)

    engine = get_engine(db_url)
    try:
        assert _DESKTOP_TABLES.issubset(set(inspect(engine).get_table_names()))

        with engine.connect() as connection:
            # Pre-existing rows are untouched.
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM stores").scalar() == 1
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM products").scalar() == 1
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM users").scalar() == 1
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM stock_balances").scalar() == 1
            assert connection.exec_driver_sql("SELECT quantity FROM stock_balances").scalar() == 42

            # 0007 backfilled the snapshot table from the existing balances.
            assert (
                connection.exec_driver_sql("SELECT COUNT(*) FROM daily_stock_snapshot").scalar()
                == 1
            )

            # 0007 added the column the restore path writes to.
            connection.exec_driver_sql(
                "INSERT INTO users (id, username, email, role, assigned_store_id, "
                "is_active, created_at) VALUES "
                "('U2', 'clerk2', 'clerk2@store.test', 'STORE_CLERK', 'S1', 1, "
                "'2026-01-01T00:00:00Z')"
            )

            version = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()
            assert version == "0008_add_query_indexes"
    finally:
        engine.dispose()


def test_legacy_column_repairs_are_applied(tmp_path):
    """
    A database created by an old desktop build is missing columns that 0001
    added later. 0007 must add them without touching the rows that exist.
    """
    db_file = tmp_path / "test_legacy.db"
    db_url = f"sqlite:///{db_file}"

    run_migrations(db_url, revision="0006_fix_fts5_triggers")

    # Simulate a legacy database: drop columns that old desktop builds did not
    # have. Only columns no index depends on can be dropped this way, which is
    # why next_attempt_at (covered by ix_outbox_status_next_attempt) is not
    # part of the simulation.
    engine = get_engine(db_url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, created_at) "
            "VALUES ('OB1', 'EV-1', 'STOCK_MOVED', '{}', '2026-01-01T00:00:00Z')"
        )
        connection.exec_driver_sql("ALTER TABLE outbox_events DROP COLUMN last_error")
        connection.exec_driver_sql("ALTER TABLE outbox_events DROP COLUMN retry_count")
        connection.exec_driver_sql(
            "ALTER TABLE inventory_transactions DROP COLUMN original_transaction_id"
        )
    engine.dispose()

    run_migrations(db_url)

    engine = get_engine(db_url)
    try:
        inspector = inspect(engine)
        outbox_columns = {c["name"] for c in inspector.get_columns("outbox_events")}
        assert {"event_id", "retry_count", "next_attempt_at", "last_error"}.issubset(outbox_columns)
        tx_columns = {c["name"] for c in inspector.get_columns("inventory_transactions")}
        assert "original_transaction_id" in tx_columns

        with engine.connect() as connection:
            # The outbox row survived the repair.
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM outbox_events").scalar() == 1
            assert (
                connection.exec_driver_sql("SELECT event_id FROM outbox_events").scalar() == "EV-1"
            )
            # New columns got usable defaults.
            assert connection.exec_driver_sql("SELECT retry_count FROM outbox_events").scalar() == 0
    finally:
        engine.dispose()
