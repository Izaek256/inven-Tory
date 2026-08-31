"""Initial PostgreSQL schema — stores, users, devices, sessions

Issue 13 creates only the auth/device tables needed for this issue.
Full ledger tables (products, inventory_transactions, stock_balances,
transfers, outbox_events) are added in Issue 14.

Revision ID: 0001_initial_postgres_schema
Revises:
Create Date: 2026-08-31 00:00:00.000000

Migration note: Issue 14 will add the remaining ledger tables on top of
this baseline.  Do not squash this migration — keep the history intact.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_postgres_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. stores  (referenced by devices FK — must come first)
    # ------------------------------------------------------------------
    op.create_table(
        "stores",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_stores_code", "stores", ["code"], unique=True)

    # ------------------------------------------------------------------
    # 2. users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column(
            "role",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'STORE_CLERK'"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # ------------------------------------------------------------------
    # 3. devices
    # ------------------------------------------------------------------
    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("device_name", sa.String(length=255), nullable=False),
        sa.Column("hardware_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("registered_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("revocation_reason", sa.String(length=500), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.ForeignKeyConstraint(["registered_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hardware_id"),
    )
    op.create_index("ix_devices_store_id", "devices", ["store_id"], unique=False)
    op.create_index("ix_devices_hardware_id", "devices", ["hardware_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_devices_hardware_id", table_name="devices")
    op.drop_index("ix_devices_store_id", table_name="devices")
    op.drop_table("devices")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_stores_code", table_name="stores")
    op.drop_table("stores")
