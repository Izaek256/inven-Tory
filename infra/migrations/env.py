"""
Alembic migration environment — async SQLAlchemy + PostgreSQL.

Supports both online (live DB) and offline (SQL script generation) modes.
All models must be imported here so that Base.metadata is fully populated
before Alembic autogenerates or applies migrations.
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path
from typing import TYPE_CHECKING

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

if TYPE_CHECKING:
    from sqlalchemy.engine import Connection

# ---------------------------------------------------------------------------
# Make `alembic -c infra/migrations/alembic.ini ...` work from the repository
# root, with or without the packages installed in editable mode.  The API
# package lives at services/api, so it is put on sys.path explicitly instead of
# relying on the caller's working directory.
# ---------------------------------------------------------------------------
_API_ROOT = Path(__file__).resolve().parents[2] / "services" / "api"
if _API_ROOT.is_dir() and str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

# ---------------------------------------------------------------------------
# Import every model so metadata is populated for autogenerate.
#
# Every model MUST be imported. A model missing from this list is invisible to
# autogenerate, which then proposes dropping the table its migration created.
# ---------------------------------------------------------------------------
# ruff: noqa: E402  — the sys.path bootstrap above must run before these imports
from app.db import Base
from app.models.audit_event import AuditEvent  # noqa: F401
from app.models.day_book import DayBook, DayBookEntry  # noqa: F401
from app.models.device import Device  # noqa: F401
from app.models.inventory_transaction import InventoryTransaction  # noqa: F401
from app.models.product import Product  # noqa: F401
from app.models.stock_balance import StockBalance  # noqa: F401
from app.models.store import Store  # noqa: F401
from app.models.sync_receipt import SyncReceipt  # noqa: F401
from app.models.transfer import Transfer  # noqa: F401
from app.models.user import User  # noqa: F401

# ---------------------------------------------------------------------------
# Alembic Config object
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """Prefer ALEMBIC_DB_URL env var, fall back to alembic.ini value."""
    return os.environ.get("ALEMBIC_DB_URL") or os.environ.get(
        "DATABASE_URL", config.get_main_option("sqlalchemy.url", "")
    )


# ---------------------------------------------------------------------------
# Offline mode — emit SQL without connecting to the DB
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode — connect to the DB and run migrations
# ---------------------------------------------------------------------------
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()

    connectable = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
