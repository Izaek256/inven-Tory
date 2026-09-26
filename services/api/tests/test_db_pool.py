"""
Connection-pool / SQLite PRAGMA configuration tests.

P1 (optimization plan): asyncpg pool sized min_size=5 / max_size=20,
mapped to SQLAlchemy pool_size=5 + max_overflow=15, with a statement
timeout guard.
P2 (optimization plan): local SQLite PRAGMAs — cache_size=-64000,
temp_store=MEMORY, synchronous=NORMAL applied at connect time.
"""

import asyncio
from collections.abc import Mapping

from app.db import build_engine


def _pg_engine():
    return build_engine("postgresql+asyncpg://user:pass@localhost:5432/testdb")


def test_postgres_pool_matches_plan_sizing():
    """pool_size=5 (maintained) + max_overflow=15 = 20 max total (P1)."""
    engine = _pg_engine()
    try:
        pool = engine.pool
        assert pool.__class__.__name__ != "NullPool"
        assert pool.size() == 5, f"expected pool_size=5, got {pool.size()}"
        assert pool._max_overflow == 15, f"expected max_overflow=15, got {pool._max_overflow}"
        # Must not pass an invalid raw "min_size" kwarg (would crash
        # create_engine for every real PostgreSQL URL).
        assert "min_size" not in engine.url.query
    finally:
        _dispose(engine)


def test_postgres_pool_reset_on_return_rollback():
    """Aborted transactions must not leak across pooled requests (P1)."""
    engine = _pg_engine()
    try:
        reset = engine.pool._reset_on_return
        assert reset.name == "reset_rollback", f"expected rollback reset, got {reset}"
    finally:
        _dispose(engine)


def test_postgres_connect_params_carry_statement_timeout():
    """Connect params carry server_settings statement_timeout + command_timeout."""
    engine = _pg_engine()
    try:
        cparams = _creator_cparams(engine.pool)
        assert cparams.get("command_timeout") == 30
        assert cparams.get("server_settings", {}).get("statement_timeout") == "30s"
    finally:
        _dispose(engine)


async def test_api_sqlite_engine_applies_pragmas_at_connect():
    """SQLite fallback engine applies the P2 PRAGMAs via connect event (P2)."""
    engine = build_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.connect() as conn:
            cache = await conn.exec_driver_sql("PRAGMA cache_size")
            assert int(cache.scalar_one()) == -64000
            temp_store = await conn.exec_driver_sql("PRAGMA temp_store")
            assert int(temp_store.scalar_one()) == 2  # 2 == MEMORY
            sync = await conn.exec_driver_sql("PRAGMA synchronous")
            assert int(sync.scalar_one()) == 1  # 1 == NORMAL
    finally:
        await engine.dispose()


def _creator_cparams(pool) -> Mapping:
    """Extract the connect params bound into the engine's pool creator."""
    for cell in pool._creator.__closure__ or ():
        value = cell.cell_contents
        if isinstance(value, Mapping) and "host" in value:
            return value
    raise AssertionError("connect params not found in pool creator closure")


def _dispose(engine) -> None:
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(engine.dispose())
    finally:
        loop.close()
