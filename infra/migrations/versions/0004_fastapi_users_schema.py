"""Issue 25 — FastAPI Users schema migration.

Migrates the users table to be compatible with FastAPI Users library:
- Change id from UUID string to integer auto-increment
- Add is_superuser column (boolean, default False)
- Add is_verified column (boolean, default False)
- Make email required (not nullable) for FastAPI Users compatibility
- Keep custom fields: username, role, assigned_store_id, full_name, created_at, updated_at

Also updates every FK that references users.id to Integer, because all three
dependent tables (devices, transfers, inventory_transactions) used String(36) UUIDs
and must change to Integer to match the new users.id type.

This is a breaking change for existing data; UUID IDs are replaced with sequential
integers and existing FK values are nulled/zeroed (dev environment only).

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
    # ------------------------------------------------------------------
    # 1. Drop ALL inbound foreign keys that reference users.id so that
    #    we can drop and recreate the users table.
    # ------------------------------------------------------------------
    # devices.registered_by_user_id → users.id  (auto-named by Postgres)
    op.drop_constraint("devices_registered_by_user_id_fkey", "devices", type_="foreignkey")

    # transfers.created_by_user_id → users.id  (auto-named by Postgres)
    op.drop_constraint("transfers_created_by_user_id_fkey", "transfers", type_="foreignkey")

    # inventory_transactions.user_id → users.id  (auto-named by Postgres)
    op.drop_constraint(
        "inventory_transactions_user_id_fkey", "inventory_transactions", type_="foreignkey"
    )

    # ------------------------------------------------------------------
    # 2. Null out the String(36) UUID values in the FK columns so that
    #    the ALTER TYPE to Integer doesn't fail on non-numeric data.
    # ------------------------------------------------------------------
    op.execute("UPDATE devices SET registered_by_user_id = NULL")
    op.execute("UPDATE transfers SET created_by_user_id = NULL")
    op.execute("UPDATE inventory_transactions SET user_id = NULL")

    # ------------------------------------------------------------------
    # 3. Change FK column types from String(36) → Integer (nullable)
    # ------------------------------------------------------------------
    op.alter_column(
        "devices",
        "registered_by_user_id",
        existing_type=sa.String(length=36),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="NULL",
    )

    op.alter_column(
        "transfers",
        "created_by_user_id",
        existing_type=sa.String(length=36),
        type_=sa.Integer(),
        existing_nullable=False,
        nullable=True,                      # make nullable so NULL is valid
        postgresql_using="NULL::integer",
    )

    op.alter_column(
        "inventory_transactions",
        "user_id",
        existing_type=sa.String(length=36),
        type_=sa.Integer(),
        existing_nullable=False,
        nullable=True,
        postgresql_using="NULL::integer",
    )

    # ------------------------------------------------------------------
    # 4. Drop outbound FK on users itself + indexes, then drop old table
    # ------------------------------------------------------------------
    op.drop_constraint("fk_users_assigned_store_id", "users", type_="foreignkey")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_assigned_store_id", table_name="users")

    op.drop_table("users")

    # ------------------------------------------------------------------
    # 5. Create new users table with FastAPI Users integer PK schema
    # ------------------------------------------------------------------
    # The temporary name is used only so the original table can be dropped
    # without a long ALTER; the constraints are named explicitly because
    # PostgreSQL derives their default names from the table name at creation
    # time, which would leave them called "_users_new_*" after the rename.
    op.create_table(
        "_users_new",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column(
            "role",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'STORE_CLERK'"),
        ),
        sa.Column("assigned_store_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="users_pkey"),
        sa.UniqueConstraint("email", name="users_email_key"),
        sa.UniqueConstraint("username", name="users_username_key"),
    )

    # ------------------------------------------------------------------
    # 6. Rename into place and recreate indexes + outbound FK
    # ------------------------------------------------------------------
    op.rename_table("_users_new", "users")

    # PostgreSQL 17+ registers every NOT NULL column as a named constraint, and
    # those names are also derived from the table name at creation time. Rename
    # anything still carrying the temporary prefix. The block is a no-op on
    # PostgreSQL < 17, where no such constraints exist.
    op.execute(
        """
        DO $$
        DECLARE
            c record;
        BEGIN
            FOR c IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'users'::regclass
                  AND conname LIKE '\\_users\\_new\\_%'
            LOOP
                EXECUTE format(
                    'ALTER TABLE users RENAME CONSTRAINT %I TO %I',
                    c.conname,
                    replace(c.conname, '_users_new_', 'users_')
                );
            END LOOP;
        END
        $$;
        """
    )

    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_assigned_store_id", "users", ["assigned_store_id"], unique=False)

    op.create_foreign_key(
        "fk_users_assigned_store_id",
        "users",
        "stores",
        ["assigned_store_id"],
        ["id"],
    )

    # ------------------------------------------------------------------
    # 7. Recreate inbound FKs now that users.id is Integer
    #    (devices FK is left to migration 0005 which was written for it)
    # ------------------------------------------------------------------
    op.create_foreign_key(
        "fk_transfers_created_by_user_id",
        "transfers",
        "users",
        ["created_by_user_id"],
        ["id"],
    )

    op.create_foreign_key(
        "fk_inventory_transactions_user_id",
        "inventory_transactions",
        "users",
        ["user_id"],
        ["id"],
    )


def downgrade() -> None:
    # Drop newly-named inbound FKs
    op.drop_constraint(
        "fk_inventory_transactions_user_id", "inventory_transactions", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_transfers_created_by_user_id", "transfers", type_="foreignkey"
    )
    op.drop_constraint("fk_users_assigned_store_id", "users", type_="foreignkey")
    op.drop_index("ix_users_assigned_store_id", table_name="users")
    op.drop_index("ix_users_username", table_name="users")

    # Rebuild old UUID-based users table.
    # The replacement is created while `users` still exists, so its constraints
    # must carry temporary names (a constraint's backing index shares its name
    # and index names are schema-global in PostgreSQL). They are renamed to the
    # 0001-era names after the old table is dropped.
    op.create_table(
        "_users_old",
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
        sa.Column("assigned_store_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="_users_old_pkey"),
        sa.UniqueConstraint("username", name="_users_old_username_key"),
        sa.UniqueConstraint("email", name="_users_old_email_key"),
    )

    op.execute(
        """
        INSERT INTO _users_old
          (id, username, email, hashed_password, full_name, role,
           assigned_store_id, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid()::text,
            username, email, hashed_password, full_name, role,
            assigned_store_id, is_active, created_at, updated_at
        FROM users
        """
    )

    op.drop_table("users")
    op.rename_table("_users_old", "users")

    # Mirror of the upgrade-side rename; see the comment there. Restores the
    # constraint names that 0001 created.
    op.execute(
        """
        DO $$
        DECLARE
            c record;
        BEGIN
            FOR c IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'users'::regclass
                  AND conname LIKE '\\_users\\_old\\_%'
            LOOP
                EXECUTE format(
                    'ALTER TABLE users RENAME CONSTRAINT %I TO %I',
                    c.conname,
                    replace(c.conname, '_users_old_', 'users_')
                );
            END LOOP;
        END
        $$;
        """
    )

    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_assigned_store_id", "users", ["assigned_store_id"], unique=False)

    op.create_foreign_key(
        "fk_users_assigned_store_id", "users", "stores", ["assigned_store_id"], ["id"]
    )

    # Revert FK columns back to String(36)
    op.alter_column(
        "inventory_transactions",
        "user_id",
        existing_type=sa.Integer(),
        type_=sa.String(length=36),
        existing_nullable=True,
        nullable=False,
        postgresql_using="''",
    )
    op.alter_column(
        "transfers",
        "created_by_user_id",
        existing_type=sa.Integer(),
        type_=sa.String(length=36),
        existing_nullable=True,
        nullable=False,
        postgresql_using="''",
    )
    op.alter_column(
        "devices",
        "registered_by_user_id",
        existing_type=sa.Integer(),
        type_=sa.String(length=36),
        existing_nullable=True,
    )

    # Restore original auto-named FKs
    op.create_foreign_key(
        "inventory_transactions_user_id_fkey",
        "inventory_transactions",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "transfers_created_by_user_id_fkey", "transfers", "users", ["created_by_user_id"], ["id"]
    )
    op.create_foreign_key(
        "devices_registered_by_user_id_fkey",
        "devices",
        "users",
        ["registered_by_user_id"],
        ["id"],
    )
