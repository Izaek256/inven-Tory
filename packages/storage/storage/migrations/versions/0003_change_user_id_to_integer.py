"""Retain String(36) user ID — no schema change needed.

Issue 25 — Auth consolidation (revised):
The local SQLite users table (read-only identity cache) keeps its String(36)
primary key so it remains consistent with all other local entities (stores,
devices, products) and with the string-keyed seeds used in development and
tests.

The central PostgreSQL service uses integer auto-increment IDs for the FastAPI
Users table; when the sync pull copies user rows it maps them to
human-readable string identifiers for the local cache.

This migration intentionally performs no DDL changes — it exists solely as a
chain link to keep the alembic revision history intact.

Revision ID: 0003_change_user_id_to_integer
Revises: 0002_drop_sqlite_password_column
Create Date: 2026-09-01 00:00:00.000000
"""

from collections.abc import Sequence

revision: str = "0003_change_user_id_to_integer"
down_revision: str | None = "0002_drop_sqlite_password_column"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # No schema change — local users.id remains String(36).
    pass


def downgrade() -> None:
    # No schema change to revert.
    pass
