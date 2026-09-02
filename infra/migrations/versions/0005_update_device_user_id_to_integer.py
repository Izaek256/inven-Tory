"""Update device.registered_by_user_id FK name after 0004 schema migration.

Issue 25 — Auth consolidation:
Migration 0004 already changed registered_by_user_id from String(36) to Integer
and dropped the auto-named FK constraint. This migration ensures the FK is
present with the canonical name used throughout the codebase.

Revision ID: 0005_update_device_user_id_to_integer
Revises: 0004_fastapi_users_schema
Create Date: 2026-09-01 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_device_user_fk"
down_revision: str | None = "0004_fastapi_users_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 0004 already changed the column type and dropped the old auto-named FK.
    # Just recreate it with the canonical explicit name.
    op.create_foreign_key(
        "fk_devices_registered_by_user_id",
        "devices",
        "users",
        ["registered_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_devices_registered_by_user_id", "devices", type_="foreignkey")
