"""
DEV-ONLY: Central PostgreSQL seed fixture.

Creates dev/test users in the central PostgreSQL database with proper
bcrypt-hashed passwords.  NEVER run against production.

Usage (picks up DATABASE_URL from the repo-root .env automatically):
    python infra/seed/dev_only/seed_central_postgres.py

Or override explicitly:
    INVEN_TORY_DB_URL=postgresql+asyncpg://user:pass@host/db \
        python infra/seed/dev_only/seed_central_postgres.py

WARNING: NEVER import this file from any shipped app code path.
         This file is in infra/seed/dev_only/ — excluded from production builds.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

# ── Path bootstrap ────────────────────────────────────────────────────────────
repo_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo_root / "services" / "api"))

# Change working directory to repo root so pydantic-settings can find .env
os.chdir(repo_root)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("dev_seed_postgres")

# ── Dev fixtures ─────────────────────────────────────────────────────────────
# Dev-only passwords — clearly labeled, NEVER used in production.
DEV_USERS = [
    {
        "username": "admin",
        "email": "admin@inventory.local",
        "full_name": "System Administrator",
        "role": "GLOBAL_ADMIN",
        "password": "DevAdmin2026!",  # DEV-ONLY
        "assigned_store_id": None,
    },
    {
        "username": "manager_alpha",
        "email": "manager.alpha@inventory.local",
        "full_name": "Alpha Store Manager",
        "role": "STORE_MANAGER",
        "password": "DevManager2026!",  # DEV-ONLY
        "assigned_store_id": "STORE-ALPHA",
    },
    {
        "username": "clerk_alpha",
        "email": "clerk.alpha@inventory.local",
        "full_name": "Alpha Clerk",
        "role": "STORE_CLERK",
        "password": "DevClerk2026!",  # DEV-ONLY
        "assigned_store_id": "STORE-ALPHA",
    },
    {
        "username": "auditor",
        "email": "auditor@inventory.local",
        "full_name": "Auditor User",
        "role": "AUDITOR",
        "password": "DevAuditor2026!",  # DEV-ONLY
        "assigned_store_id": None,
    },
]

DEV_STORES = [
    {
        "id": "STORE-ALPHA",
        "code": "ALPHA",
        "name": "Store Alpha (Main Flagship)",
        "address": "100 Electronics Way, Tech District",
    },
    {
        "id": "STORE-BETA",
        "code": "BETA",
        "name": "Store Beta (Downtown)",
        "address": "45 Market Street, Central City",
    },
    {
        "id": "STORE-GAMMA",
        "code": "GAMMA",
        "name": "Store Gamma (Suburban)",
        "address": "880 Mall Boulevard, North Suburbs",
    },
]


def run_migrations(db_url: str) -> None:
    """Run all pending Alembic migrations programmatically."""
    import subprocess

    env = os.environ.copy()
    env["DATABASE_URL"] = db_url

    alembic_ini = repo_root / "infra" / "migrations" / "alembic.ini"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(alembic_ini), "upgrade", "head"],
        env=env,
        cwd=str(repo_root / "services" / "api"),
    )
    if result.returncode != 0:
        raise RuntimeError("Alembic migrations failed — check the output above.")


async def seed() -> None:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import settings  # reads DATABASE_URL from repo-root .env
    from app.core.security import hash_password
    from app.db import Base  # noqa: F401 — ensures all models are registered
    from app.models.device import Device  # noqa: F401
    from app.models.store import Store
    from app.models.user import User

    # Priority: explicit env override → .env DATABASE_URL → pydantic default
    db_url = os.environ.get("INVEN_TORY_DB_URL") or settings.database_url

    logger.info("Connecting to: %s", _redact_url(db_url))

    # Run migrations first so all tables exist
    logger.info("Running Alembic migrations...")
    run_migrations(db_url)
    logger.info("Migrations up to date.")

    engine = create_async_engine(db_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with factory() as session:
        now = datetime.now(UTC)

        # ── Stores ────────────────────────────────────────────────────────────
        for s in DEV_STORES:
            existing = await session.scalar(select(Store).where(Store.id == s["id"]))
            if not existing:
                session.add(
                    Store(
                        id=s["id"],
                        code=s["code"],
                        name=s["name"],
                        address=s["address"],
                        is_active=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
                logger.info("Created store: %s (%s)", s["name"], s["id"])
            else:
                logger.info("Store already exists: %s", s["id"])

        await session.flush()

        # ── Users ─────────────────────────────────────────────────────────────
        for u in DEV_USERS:
            existing = await session.scalar(
                select(User).where(User.username == u["username"])
            )
            if not existing:
                session.add(
                    User(
                        username=u["username"],
                        email=u["email"],
                        full_name=u["full_name"],
                        hashed_password=hash_password(u["password"]),
                        role=u["role"],
                        assigned_store_id=u["assigned_store_id"],
                        is_active=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
                logger.info("Created user: %s (%s)", u["username"], u["role"])
            else:
                logger.info("User already exists: %s", u["username"])

        await session.commit()
        logger.info("PostgreSQL dev seed complete.")

    await engine.dispose()


def _redact_url(url: str) -> str:
    """Return the URL with the password replaced by *** for safe logging."""
    try:
        from urllib.parse import urlsplit, urlunsplit

        parts = urlsplit(url)
        if parts.password:
            netloc = f"{parts.username}:***@{parts.hostname}"
            if parts.port:
                netloc += f":{parts.port}"
            return urlunsplit(parts._replace(netloc=netloc))
    except Exception:
        pass
    return url


if __name__ == "__main__":
    asyncio.run(seed())
