"""Add pin_hash column to local SQLite users for offline login.

Issue 25 / offline-first:
The desktop app must be able to authenticate locally without a network
connection.  This migration adds a nullable pin_hash column to the users
table.  It is populated:
  - By the sync pull when the central API returns user data that includes
    a bcrypt-hashed offline PIN set by the user.
  - By the dev seed scripts for local development.

The column is nullable so existing cached user rows remain valid after
the migration (they simply cannot log in offline until the hash is set).

Revision ID: 0004_add_pin_hash_to_users
Revises: 0003_change_user_id_to_integer
Create Date: 2026-09-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_pin_hash_to_users"
down_revision: str | None = "0003_change_user_id_to_integer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite supports ADD COLUMN directly as long as the column is nullable
    # or has a server_default — no table-rebuild needed.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("pin_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("pin_hash")
