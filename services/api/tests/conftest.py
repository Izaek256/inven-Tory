"""
Pytest fixtures for services/api tests.

Uses an in-memory SQLite database (aiosqlite) so tests require no external
services and run identically in CI.  The engine is swapped into the module-
level singletons in app.db before the FastAPI TestClient is constructed.

Fixture hierarchy:
  engine (session-scoped)        — one SQLite DB per test session
    ├── tables (session-scoped)  — create_all once per session
    └── db_session (function)    — fresh transaction per test, rolled back after
          └── client (function)  — TestClient with db_session injected
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, Generator
from datetime import UTC, datetime
from typing import Any

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.security import hash_password
from app.db import Base, get_db
from app.main import app
from app.models.audit_event import AuditEvent  # noqa: F401 — registers with Base.metadata
from app.models.device import Device
from app.models.inventory_transaction import InventoryTransaction  # noqa: F401
from app.models.product import Product  # noqa: F401
from app.models.stock_balance import StockBalance  # noqa: F401
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt  # noqa: F401
from app.models.transfer import Transfer  # noqa: F401
from app.models.user import User

# ---------------------------------------------------------------------------
# Engine — in-memory SQLite (aiosqlite)
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def engine() -> AsyncEngine:
    return create_async_engine(TEST_DB_URL, echo=False, future=True)


@pytest_asyncio.fixture(scope="session")
async def tables(engine: AsyncEngine) -> AsyncGenerator[None, None]:
    """Create all tables once for the test session."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session(
    engine: AsyncEngine,
    tables: None,
) -> AsyncGenerator[AsyncSession, None]:
    """Yield a fresh async session; roll back after each test."""
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# Override app.db singletons so the TestClient uses the in-memory DB
# ---------------------------------------------------------------------------
@pytest.fixture
def client(engine: AsyncEngine, db_session: AsyncSession) -> Generator[TestClient, None, None]:
    """Sync TestClient with the in-memory DB injected via dependency override."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _make_store(db: AsyncSession, **kwargs: Any) -> Store:
    store = Store(
        id=str(uuid.uuid4()),
        code=kwargs.get("code", f"ST-{uuid.uuid4().hex[:6].upper()}"),
        name=kwargs.get("name", "Test Store"),
        is_active=kwargs.get("is_active", True),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(store)
    await db.flush()
    return store


async def _make_user(db: AsyncSession, **kwargs: Any) -> User:
    user = User(
        id=str(uuid.uuid4()),
        username=kwargs.get("username", f"user_{uuid.uuid4().hex[:8]}"),
        hashed_password=hash_password(kwargs.get("password", "secret123")),
        role=kwargs.get("role", "STORE_MANAGER"),
        is_active=kwargs.get("is_active", True),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    return user


async def _make_device(db: AsyncSession, store_id: str, user_id: str, **kwargs: Any) -> Device:
    device = Device(
        id=str(uuid.uuid4()),
        store_id=store_id,
        device_name=kwargs.get("device_name", "POS Register 1"),
        hardware_id=kwargs.get("hardware_id", None),
        is_active=kwargs.get("is_active", True),
        registered_at=datetime.now(UTC),
        registered_by_user_id=user_id,
    )
    db.add(device)
    await db.flush()
    return device


@pytest.fixture
def seed_helpers() -> dict[str, Any]:
    """Expose seed helpers to tests that need them."""
    return {
        "make_store": _make_store,
        "make_user": _make_user,
        "make_device": _make_device,
    }
