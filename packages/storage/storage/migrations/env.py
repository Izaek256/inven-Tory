"""
Alembic environment script for local SQLite migrations.

Canonical migration chain for the local (desktop) SQLite database.  Run every
command from the repository root:

    alembic -c packages/storage/storage/migrations/alembic.ini upgrade head

The target database is taken from, in order: ``ALEMBIC_SQLITE_URL``,
``LOCAL_DATABASE_URL``, then the ``sqlalchemy.url`` value in ``alembic.ini``.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, event, pool

# ---------------------------------------------------------------------------
# Make `alembic -c packages/storage/storage/migrations/alembic.ini ...` work
# from the repository root without requiring an editable install.
# ---------------------------------------------------------------------------
_STORAGE_ROOT = Path(__file__).resolve().parents[2]
if _STORAGE_ROOT.is_dir() and str(_STORAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_STORAGE_ROOT))

from storage.db import set_sqlite_pragmas
from storage.models import Base

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """Prefer ALEMBIC_SQLITE_URL, then LOCAL_DATABASE_URL, then alembic.ini."""
    return (
        os.environ.get("ALEMBIC_SQLITE_URL")
        or os.environ.get("LOCAL_DATABASE_URL")
        or config.get_main_option("sqlalchemy.url")
    )


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    if connectable.dialect.name == "sqlite":
        event.listen(connectable, "connect", set_sqlite_pragmas)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
