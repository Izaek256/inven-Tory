"""Add central ledger tables: products, transfers, inventory_transactions,
stock_balances, sync_receipts, audit_events.

Issue 14 — PostgreSQL Central Ledger and Idempotent Ingestion.
Depends on 0001_initial_postgres_schema (stores, users, devices).

Revision ID: 0002_ledger_tables
Revises: 0001_initial_postgres_schema
Create Date: 2026-08-31 00:01:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_ledger_tables"
down_revision: str | None = "0001_initial_postgres_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. products
    # ------------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False, server_default=sa.text("'pcs'")),
        sa.Column("barcode", sa.String(length=100), nullable=True),
        sa.Column("alternate_names", sa.Text(), nullable=True),
        sa.Column(
            "serial_tracking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("low_stock_threshold", sa.Integer(), nullable=True),
        sa.Column("warranty_days", sa.Integer(), nullable=True),
        sa.Column(
            "batch_tracking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index("ix_products_barcode", "products", ["barcode"], unique=False)
    op.create_index(
        "ix_products_low_stock_threshold", "products", ["low_stock_threshold"], unique=False
    )

    # ------------------------------------------------------------------
    # 2. transfers  (no FK to inventory_transactions — tx refs transfer)
    # ------------------------------------------------------------------
    op.create_table(
        "transfers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_store_id", sa.String(length=36), nullable=False),
        sa.Column("destination_store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=50), nullable=False, server_default=sa.text("'DRAFT'")
        ),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["destination_store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfers_source_store_id", "transfers", ["source_store_id"], unique=False)
    op.create_index(
        "ix_transfers_destination_store_id", "transfers", ["destination_store_id"], unique=False
    )
    op.create_index("ix_transfers_product_id", "transfers", ["product_id"], unique=False)
    op.create_index(
        "ix_transfers_created_by_user_id", "transfers", ["created_by_user_id"], unique=False
    )

    # ------------------------------------------------------------------
    # 3. inventory_transactions
    #    transaction_id (ULID) is PK and acts as the idempotency key.
    # ------------------------------------------------------------------
    op.create_table(
        "inventory_transactions",
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("movement_type", sa.String(length=50), nullable=False),
        sa.Column(
            "stock_bucket",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'AVAILABLE'"),
        ),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("device_id", sa.String(length=36), nullable=False),
        sa.Column("reference_number", sa.String(length=100), nullable=True),
        sa.Column("reason_code", sa.String(length=100), nullable=True),
        sa.Column("transfer_id", sa.String(length=36), nullable=True),
        sa.Column("purchase_order_id", sa.String(length=36), nullable=True),
        sa.Column("batch_id", sa.String(length=36), nullable=True),
        sa.Column("client_sequence", sa.Integer(), nullable=True),
        sa.Column(
            "sync_status",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'ACCEPTED'"),
        ),
        sa.Column("server_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_transaction_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["transfer_id"], ["transfers.id"]),
        sa.PrimaryKeyConstraint("transaction_id"),
    )
    op.create_index(
        "ix_inv_tx_prod_store_date",
        "inventory_transactions",
        ["product_id", "store_id", "occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_inv_tx_store_prod_date",
        "inventory_transactions",
        ["store_id", "product_id", "occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_inv_tx_store_id", "inventory_transactions", ["store_id"], unique=False
    )
    op.create_index(
        "ix_inv_tx_product_id", "inventory_transactions", ["product_id"], unique=False
    )
    op.create_index(
        "ix_inv_tx_user_id", "inventory_transactions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_inv_tx_device_id", "inventory_transactions", ["device_id"], unique=False
    )
    op.create_index(
        "ix_inv_tx_transfer_id", "inventory_transactions", ["transfer_id"], unique=False
    )

    # ------------------------------------------------------------------
    # 4. stock_balances
    # ------------------------------------------------------------------
    op.create_table(
        "stock_balances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column(
            "stock_bucket",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'AVAILABLE'"),
        ),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "store_id",
            "product_id",
            "stock_bucket",
            name="uq_stock_balances_store_product_bucket",
        ),
    )
    op.create_index("ix_stock_balances_store_id", "stock_balances", ["store_id"], unique=False)
    op.create_index(
        "ix_stock_balances_product_id", "stock_balances", ["product_id"], unique=False
    )

    # ------------------------------------------------------------------
    # 5. sync_receipts  (idempotency log — SYNC-003/004/012)
    # ------------------------------------------------------------------
    op.create_table(
        "sync_receipts",
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id"),
    )

    # ------------------------------------------------------------------
    # 6. audit_events  (Section 22, AT-011)
    # ------------------------------------------------------------------
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("actor_device_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=True),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"])
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_entity_id", "audit_events", ["entity_id"])
    op.create_index("ix_audit_events_occurred_at", "audit_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_occurred_at", table_name="audit_events")
    op.drop_index("ix_audit_events_entity_id", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_user_id", table_name="audit_events")
    op.drop_table("audit_events")

    op.drop_table("sync_receipts")

    op.drop_index("ix_stock_balances_product_id", table_name="stock_balances")
    op.drop_index("ix_stock_balances_store_id", table_name="stock_balances")
    op.drop_table("stock_balances")

    op.drop_index("ix_inv_tx_transfer_id", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_device_id", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_user_id", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_product_id", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_store_id", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_store_prod_date", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_prod_store_date", table_name="inventory_transactions")
    op.drop_table("inventory_transactions")

    op.drop_index("ix_transfers_created_by_user_id", table_name="transfers")
    op.drop_index("ix_transfers_product_id", table_name="transfers")
    op.drop_index("ix_transfers_destination_store_id", table_name="transfers")
    op.drop_index("ix_transfers_source_store_id", table_name="transfers")
    op.drop_table("transfers")

    op.drop_index("ix_products_low_stock_threshold", table_name="products")
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_index("ix_products_sku", table_name="products")
    op.drop_table("products")
