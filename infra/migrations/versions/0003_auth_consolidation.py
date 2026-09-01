"""Issue 25 — Auth consolidation: add assigned_store_id to users table.

Adds the store-scoped assignment column that Phase D requires.
The column is nullable because global roles (GLOBAL_ADMIN, INVENTORY_MANAGER,
AUDITOR, SYNC) are not bound to a single store.

Revision ID: 0003_auth_consolidation
Revises: 0002_ledger_tables
Create Date: 2026-09-01 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_auth_consolidation"
down_revision: str | None = "0002_ledger_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add assigned_store_id FK to users — nullable, store-scoped roles only.
    op.add_column(
        "users",
        sa.Column("assigned_store_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_assigned_store_id",
        "users",
        "stores",
        ["assigned_store_id"],
        ["id"],
    )
    op.create_index("ix_users_assigned_store_id", "users", ["assigned_store_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_assigned_store_id", table_name="users")
    op.drop_constraint("fk_users_assigned_store_id", "users", type_="foreignkey")
    op.drop_column("users", "assigned_store_id")
