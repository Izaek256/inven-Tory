"""Update device.registered_by_user_id from UUID string to integer.

Issue 25 — Auth consolidation:
The central PostgreSQL users table now uses FastAPI Users' integer auto-increment
IDs instead of UUID strings. The devices table's registered_by_user_id foreign key
must be updated to match.

This migration:
1. Changes registered_by_user_id from String(36) to Integer
2. Updates the foreign key constraint to reference users.id (now integer)
3. Data will be lost on upgrade (UUIDs cannot be converted to integers)
   - This is acceptable because the field is nullable and represents audit trail info

Revision ID: 0005_update_device_user_id_to_integer
Revises: 0004_fastapi_users_schema
Create Date: 2026-09-01 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_update_device_user_id_to_integer"
down_revision: str | None = "0004_fastapi_users_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop the existing foreign key constraint
    # The constraint was unnamed in 0001_initial_postgres_schema, so Postgres
    # assigned the default name: devices_registered_by_user_id_fkey
    op.drop_constraint("devices_registered_by_user_id_fkey", "devices", type_="foreignkey")

    # Change the column type from String(36) to Integer
    op.alter_column(
        "devices",
        "registered_by_user_id",
        existing_type=sa.String(length=36),
        type_=sa.Integer(),
        existing_nullable=True,
    )

    # Recreate the foreign key constraint with the new type
    op.create_foreign_key(
        "fk_devices_registered_by_user_id",
        "devices",
        "users",
        ["registered_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    # Revert the change back to String(36)
    op.drop_constraint("fk_devices_registered_by_user_id", "devices", type_="foreignkey")

    op.alter_column(
        "devices",
        "registered_by_user_id",
        existing_type=sa.Integer(),
        type_=sa.String(length=36),
        existing_nullable=True,
    )

    # Recreate with the default Postgres constraint name
    op.create_foreign_key(
        "devices_registered_by_user_id_fkey",
        "devices",
        "users",
        ["registered_by_user_id"],
        ["id"],
    )
