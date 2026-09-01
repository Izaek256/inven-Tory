"""Drop hashed_password from local SQLite users table.

Issue 25 — Auth consolidation.
The local SQLite users table is now a read-only identity cache populated by
the sync pull from the central API.  Passwords are authenticated centrally by
FastAPI (services/api); the desktop never hashes or stores a password locally.

This migration:
1. Recreates the users table without the hashed_password column.
2. Preserves all other columns and indexes.

SQLite does not support DROP COLUMN directly in older versions; we use the
standard SQLite table-rebuild pattern (rename → recreate → copy → drop old).

Revision ID: 0002_drop_sqlite_password_column
Revises: 0001_initial_sqlite_schema
Create Date: 2026-09-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_drop_sqlite_password_column"
down_revision: str | None = "0001_initial_sqlite_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite table-rebuild to remove the hashed_password column.
    # 1. Create the replacement table
    op.create_table(
        "_users_new",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        # hashed_password intentionally omitted — identity cache only
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column(
            "role", sa.String(length=50), nullable=False, server_default=sa.text("'STORE_CLERK'")
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

    # 2. Copy existing data (excluding hashed_password)
    op.execute(
        "INSERT INTO _users_new (id, username, email, full_name, role, is_active, created_at) "
        "SELECT id, username, email, full_name, role, is_active, created_at FROM users"
    )

    # 3. Drop the old table
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")

    # 4. Rename new table to users
    op.rename_table("_users_new", "users")

    # 5. Recreate indexes
    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    # Restore hashed_password column (filled with sentinel value — data is lost)
    op.create_table(
        "_users_old",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column(
            "hashed_password",
            sa.String(length=255),
            nullable=False,
            server_default=sa.text("'DOWNGRADE_SENTINEL'"),
        ),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column(
            "role", sa.String(length=50), nullable=False, server_default=sa.text("'STORE_CLERK'")
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

    op.execute(
        "INSERT INTO _users_old "
        "(id, username, email, hashed_password, full_name, role, is_active, created_at) "
        "SELECT id, username, email, 'DOWNGRADE_SENTINEL', full_name, role, is_active, created_at "
        "FROM users"
    )

    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
    op.rename_table("_users_old", "users")
    op.create_index("ix_users_username", "users", ["username"], unique=True)
