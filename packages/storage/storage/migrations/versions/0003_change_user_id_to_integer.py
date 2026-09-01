"""Change user ID from UUID string to integer to match FastAPI Users.

Issue 25 — Auth consolidation:
The central PostgreSQL users table now uses FastAPI Users' integer auto-increment
IDs instead of UUID strings. The local SQLite users table (read-only cache) must
match this schema to sync correctly.

This migration:
1. Changes id from String(36) to Integer with autoincrement
2. Preserves all other columns
3. Data will be lost on upgrade (UUIDs cannot be converted to integers)
   - This is acceptable because the local cache is repopulated from central on sync

Revision ID: 0003_change_user_id_to_integer
Revises: 0002_drop_sqlite_password_column
Create Date: 2026-09-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_change_user_id_to_integer"
down_revision: str | None = "0002_drop_sqlite_password_column"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite table-rebuild to change id from String(36) to Integer autoincrement
    # Disable foreign key constraints temporarily to allow dropping the users table
    op.execute("PRAGMA foreign_keys = OFF")

    # 1. Create the replacement table
    op.create_table(
        "_users_new",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
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

    # 2. Copy existing data (IDs will be reassigned as sequential integers)
    # Note: Original UUID IDs are lost - this is acceptable for a cache table
    op.execute(
        "INSERT INTO _users_new (username, email, full_name, role, is_active, created_at) "
        "SELECT username, email, full_name, role, is_active, created_at FROM users "
        "ORDER BY created_at"
    )

    # 3. Drop the old table
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")

    # 4. Rename new table to users
    op.rename_table("_users_new", "users")

    # 5. Recreate indexes
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Re-enable foreign key constraints
    op.execute("PRAGMA foreign_keys = ON")


def downgrade() -> None:
    # Revert to UUID-based schema (data loss: integer IDs cannot be converted back to UUIDs)
    # Disable foreign key constraints temporarily to allow dropping the users table
    op.execute("PRAGMA foreign_keys = OFF")

    op.drop_index("ix_users_username", table_name="users")

    op.create_table(
        "_users_old",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
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

    # Copy data back (UUID IDs will be regenerated, losing original IDs)
    op.execute(
        "INSERT INTO _users_old (id, username, email, full_name, role, is_active, created_at) "
        "SELECT lower(hex(randomblob(16))), username, email, full_name, role, is_active, created_at "
        "FROM users"
    )

    op.drop_table("users")
    op.rename_table("_users_old", "users")

    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Re-enable foreign key constraints
    op.execute("PRAGMA foreign_keys = ON")
