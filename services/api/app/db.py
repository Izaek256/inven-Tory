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
    """
    url = database_url or settings.database_url
    echo = settings.environment == "development"
    return create_async_engine(url, echo=echo, future=True)


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Return an async session factory bound to the given engine."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# ---------------------------------------------------------------------------
# Module-level singletons — swapped out in tests via dependency injection.
# ---------------------------------------------------------------------------
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return (or lazily create) the module-level async engine."""
    global _engine
    if _engine is None:
        _engine = build_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return (or lazily create) the module-level session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = build_sessionmaker(get_engine())
    return _session_factory


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
