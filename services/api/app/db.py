"""
Async SQLAlchemy engine, session factory and Base for the central PostgreSQL database.

The local SQLite engine lives in packages/storage/storage/db.py and is used only
by the Tauri desktop app.  This module is the FastAPI service's async engine.

Migration note (Issue 14): full ledger tables (products, transactions, etc.) are
added in the next issue.  This module already wires up the async engine so that
Issue 13 tables (users, devices, sessions) are managed from day one.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all central PostgreSQL models in services/api."""


def build_engine(database_url: str | None = None) -> AsyncEngine:
    """Create and return an async SQLAlchemy engine.

    Accepts an explicit URL so tests can inject an in-memory SQLite URL
    (sqlite+aiosqlite:///...) without touching the environment.

    pool_pre_ping validates connections on checkout so stale/broken ones
    are discarded rather than causing cryptic errors.

    pool_reset_on_return="rollback" ensures any aborted transaction is
    explicitly rolled back when a connection is returned to the pool.
    This is the root-cause fix for asyncpg InFailedSQLTransactionError:
    a connection left in a failed-transaction state by one request was
    being handed to the next request via the pool, which then received
    the error on its very first query.
    """
    url = database_url or settings.database_url
    echo = settings.environment == "development"

    # pool_reset_on_return is not supported for aiosqlite (tests); only
    # pass it for real PostgreSQL URLs.
    extra: dict = {}
    if url and "sqlite" not in str(url):
        extra["pool_reset_on_return"] = "rollback"
        # NOTE: deliberately NOT using NullPool any more.
        # pool_reset_on_return="rollback" is the PRIMARY defence against
        # InFailedSQLTransactionError: every connection returned to the pool
        # is guaranteed to have an explicit ROLLBACK issued so the next
        # checkout gets a clean connection with no aborted-txn flag.
        # NullPool would defeat this because connections are never "returned".
        # Singleton engine is now enforced via function-attribute cache in
        # get_engine(), so every session factory shares this one pool.
        extra["pool_size"] = 10
        extra["max_overflow"] = 20

    return create_async_engine(
        url,
        echo=echo,
        future=True,
        pool_pre_ping=True,
        **extra,
    )


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Return an async session factory bound to the given engine."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# ---------------------------------------------------------------------------
# Singletons via function-attribute cache (cannot be accidentally reset by
# external reimports, monkey-patching, conftest overrides, or reloads).
#
# Function attributes survive across reimports of the same name, and unlike
# module-level globals they are NOT reachable via the public module namespace
# so external code cannot scribble `app.db._engine = None` to break them.
# ---------------------------------------------------------------------------
def get_engine() -> AsyncEngine:
    """Return (or lazily create) the single process-wide async engine."""
    try:
        return get_engine._cached  # type: ignore[attr-defined]
    except AttributeError:
        get_engine._cached = build_engine()  # type: ignore[attr-defined]
        return get_engine._cached  # type: ignore[attr-defined]


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return (or lazily create) the single process-wide session factory."""
    try:
        return get_session_factory._cached  # type: ignore[attr-defined]
    except AttributeError:
        get_session_factory._cached = build_sessionmaker(get_engine())  # type: ignore[attr-defined]
        return get_session_factory._cached  # type: ignore[attr-defined]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session per request."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
