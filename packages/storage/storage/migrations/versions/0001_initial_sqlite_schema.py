"""Initial SQLite schema creation

Revision ID: 0001_initial_sqlite_schema
Revises:
Create Date: 2026-08-29 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial_sqlite_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. stores
    op.create_table(
        "stores",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_stores_code", "stores", ["code"], unique=True)

    # 2. devices
    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("device_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_devices_store_id", "devices", ["store_id"], unique=False)

    # 3. users
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="CASHIER"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # 4. products
    op.create_table(
        "products",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False, server_default="pcs"),
        sa.Column("barcode", sa.String(length=100), nullable=True),
        sa.Column("alternate_names", sa.Text(), nullable=True),
        sa.Column(
            "serial_tracking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("low_stock_threshold", sa.Integer(), nullable=True),
        sa.Column("warranty_days", sa.Integer(), nullable=True),
        sa.Column(
            "batch_tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    # 16.2 indexes
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index("ix_products_barcode", "products", ["barcode"], unique=False)
    op.create_index(
        "ix_products_low_stock_threshold", "products", ["low_stock_threshold"], unique=False
    )

    # 5. stock_balances
    op.create_table(
        "stock_balances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("stock_bucket", sa.String(length=50), nullable=False, server_default="AVAILABLE"),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "store_id", "product_id", "stock_bucket", name="uq_stock_balances_store_product_bucket"
        ),
    )
    op.create_index("ix_stock_balances_store_id", "stock_balances", ["store_id"], unique=False)
    op.create_index("ix_stock_balances_product_id", "stock_balances", ["product_id"], unique=False)

    # 6. transfers
    op.create_table(
        "transfers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_store_id", sa.String(length=36), nullable=False),
        sa.Column("destination_store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="DRAFT"),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["destination_store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["source_store_id"], ["stores.id"]),
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

    # 7. inventory_transactions
    op.create_table(
        "inventory_transactions",
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("movement_type", sa.String(length=50), nullable=False),
        sa.Column("stock_bucket", sa.String(length=50), nullable=False, server_default="AVAILABLE"),
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
        sa.Column("sync_status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("server_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_transaction_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["transfer_id"], ["transfers.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("transaction_id"),
    )
    # 16.2 indexes
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

    # 8. outbox_events
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    # 16.2 indexes
    op.create_index("ix_outbox_events_event_id", "outbox_events", ["event_id"], unique=True)
    op.create_index(
        "ix_outbox_status_next_attempt",
        "outbox_events",
        ["status", "next_attempt_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_status_next_attempt", table_name="outbox_events")
    op.drop_index("ix_outbox_events_event_id", table_name="outbox_events")
    op.drop_table("outbox_events")

    op.drop_index("ix_inv_tx_store_prod_date", table_name="inventory_transactions")
    op.drop_index("ix_inv_tx_prod_store_date", table_name="inventory_transactions")
    op.drop_table("inventory_transactions")

    op.drop_index("ix_transfers_created_by_user_id", table_name="transfers")
    op.drop_index("ix_transfers_destination_store_id", table_name="transfers")
    op.drop_index("ix_transfers_source_store_id", table_name="transfers")
    op.drop_table("transfers")

    op.drop_index("ix_stock_balances_product_id", table_name="stock_balances")
    op.drop_index("ix_stock_balances_store_id", table_name="stock_balances")
    op.drop_table("stock_balances")

    op.drop_index("ix_products_low_stock_threshold", table_name="products")
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_index("ix_products_sku", table_name="products")
    op.drop_table("products")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_devices_store_id", table_name="devices")
    op.drop_table("devices")

    op.drop_index("ix_stores_code", table_name="stores")
    op.drop_table("stores")
