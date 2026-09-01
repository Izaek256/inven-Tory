"""Issue 25 — FastAPI Users schema migration.

Migrates the users table to be compatible with FastAPI Users library:
- Change id from UUID string to integer auto-increment
- Add is_superuser column (boolean, default False)
- Add is_verified column (boolean, default False)
- Make email required (not nullable) for FastAPI Users compatibility
- Keep custom fields: username, role, assigned_store_id, full_name, created_at, updated_at

This is a breaking change for existing data; we preserve as much as possible
but UUID IDs will be replaced with sequential integers.

Revision ID: 0004_fastapi_users_schema
Revises: 0003_auth_consolidation
Create Date: 2026-09-01 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_fastapi_users_schema"
down_revision: str | None = "0003_auth_consolidation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL table rebuild to change id from UUID to integer and add FastAPI Users columns

    # 1. Create the new users table with FastAPI Users schema
    op.create_table(
        "_users_new",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),  # Required by FastAPI Users
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        # Custom fields
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=50), nullable=False, server_default=sa.text("'STORE_CLERK'")),
        sa.Column("assigned_store_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )

    # 2. Copy existing data, generating sequential IDs
    # Note: UUID IDs are lost and replaced with sequential integers
    op.execute(
        """
        INSERT INTO _users_new 
        (email, hashed_password, is_active, is_superuser, is_verified, username, full_name, role, assigned_store_id, created_at, updated_at)
        SELECT 
            COALESCE(email, username || '@local'),  -- Generate email if missing
            hashed_password,
            is_active,
            false,  -- is_superuser default
            false,  -- is_verified default
            username,
            full_name,
            role,
            assigned_store_id,
            created_at,
            updated_at
        FROM users
        ORDER BY created_at
        """
    )

    # 3. Drop foreign key constraints on old table
    op.drop_constraint("fk_users_assigned_store_id", "users", type_="foreignkey")

    # 4. Drop indexes on old table
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_assigned_store_id", table_name="users")

    # 5. Drop old table
    op.drop_table("users")

    # 6. Rename new table to users
    op.rename_table("_users_new", "users")

    # 7. Recreate indexes
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_assigned_store_id", "users", ["assigned_store_id"], unique=False)

    # 8. Recreate foreign key constraint
    op.create_foreign_key(
        "fk_users_assigned_store_id",
        "users",
        "stores",
        ["assigned_store_id"],
        ["id"],
    )


def downgrade() -> None:
    # Revert to UUID-based schema (data loss: integer IDs cannot be converted back to UUIDs)

    op.drop_constraint("fk_users_assigned_store_id", "users", type_="foreignkey")
    op.drop_index("ix_users_assigned_store_id", table_name="users")
    op.drop_index("ix_users_username", table_name="users")

    op.create_table(
        "_users_old",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=50), nullable=False, server_default=sa.text("'STORE_CLERK'")),
        sa.Column("assigned_store_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

    # Copy data back (UUID IDs will be regenerated, losing original IDs)
    op.execute(
        """
        INSERT INTO _users_old 
        (id, username, email, hashed_password, full_name, role, assigned_store_id, is_active, created_at, updated_at)
        SELECT 
            gen_random_uuid()::text,  -- Generate new UUID
            username,
            email,
            hashed_password,
            full_name,
            role,
            assigned_store_id,
            is_active,
            created_at,
            updated_at
        FROM users
        """
    )

    op.drop_table("users")
    op.rename_table("_users_old", "users")

    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_assigned_store_id", "users", ["assigned_store_id"], unique=False)

    op.create_foreign_key(
        "fk_users_assigned_store_id",
        "users",
        "stores",
        ["assigned_store_id"],
        ["id"],
    )
