"""
Tests for local SQLite Alembic schema migrations and idempotency.
"""

from sqlalchemy import inspect

from storage.db import get_engine
from storage.migrations.runner import run_migrations


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

    expected_tables = {
        "stores",
        "devices",
        "users",
        "products",
        "stock_balances",
        "transfers",
        "inventory_transactions",
        "outbox_events",
    }
    assert expected_tables.issubset(set(tables))

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
    assert expected_tables.issubset(set(tables_after))

    engine_after.dispose()
