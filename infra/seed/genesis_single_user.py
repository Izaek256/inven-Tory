"""
GENESIS — Single-user bootstrap. Run ONCE before launching the app for the first time.

Seeds YOUR credentials into:
  1. Central PostgreSQL database (services/api)  — used by the web dashboard and sync API
  2. Local SQLite database (packages/storage)    — used by the Tauri desktop app for
                                                    OFFLINE bcrypt-based login (pin_hash)

Also creates:
  - A default store (STORE-MAIN) if none exists (assigns user to it)
  - WEB-DASHBOARD-DEVICE (required constant for web login)
  - A wildcard "any-device" registration strategy is enabled separately in the
    API login endpoint (see auth.py changes); the genesis script simply makes
    sure at least one device row exists so the DB foreign keys are happy.

This script is IDEMPOTENT for the USER row: if the username already exists in
Postgres, it UPDATEs it rather than duplicating.  For SQLite it does the same.

Use (from repo root d:\inven-Tory, venv activated):

    python infra/seed/genesis_single_user.py --run-migrations

Or with explicit values (skip prompts — handy for scripts/CI):

    python infra/seed/genesis_single_user.py \
        --username john --email john@example.com --full-name "John Doe" \
        --password "MyRealPassw0rd!" --role GLOBAL_ADMIN \
        --store-id STORE-MAIN --store-code MAIN --store-name "My Store" \
        --run-migrations

Requirements:
  - .env at repo root with DATABASE_URL + SECRET_KEY set
  - PostgreSQL running
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# ── Path bootstrap ────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "api"))
sys.path.insert(0, str(REPO_ROOT / "packages" / "storage"))
os.chdir(REPO_ROOT)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("genesis")

VALID_ROLES = (
    "GLOBAL_ADMIN",
    "INVENTORY_MANAGER",
    "STORE_MANAGER",
    "STORE_CLERK",
    "AUDITOR",
    "SYNC",
)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------


def _prompt(label: str, default: str | None = None, secret: bool = False) -> str:
    hint = f" [{default}]" if default else ""
    while True:
        if secret:
            val = getpass.getpass(f"{label}{hint}: ")
        else:
            val = input(f"{label}{hint}: ").strip()
        if val:
            return val
        if default:
            return default
        print(f"  [ERROR] {label} cannot be empty.")


def _prompt_password(min_length: int = 8) -> str:
    while True:
        pw1 = getpass.getpass(f"Password (min {min_length} chars): ")
        if len(pw1) < min_length:
            print(f"  [ERROR] must be >= {min_length} characters.")
            continue
        pw2 = getpass.getpass("Password (confirm): ")
        if pw1 != pw2:
            print("  [ERROR] passwords do not match.")
            continue
        return pw1


def _prompt_role(default: str = "GLOBAL_ADMIN") -> str:
    print()
    print("  Available roles:")
    for i, role in enumerate(VALID_ROLES, 1):
        mark = " (recommended)" if role == default else ""
        print(f"    {i}. {role}{mark}")
    while True:
        choice = input(f"\n  Choose role [1-{len(VALID_ROLES)}] [1]: ").strip() or "1"
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(VALID_ROLES):
                return VALID_ROLES[idx]
        except ValueError:
            pass
        print("  Invalid choice.")


# ---------------------------------------------------------------------------
# Migration runners
# ---------------------------------------------------------------------------


def _run_postgres_migrations(db_url: str) -> None:
    import subprocess

    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    alembic_ini = REPO_ROOT / "infra" / "migrations" / "alembic.ini"
    logger.info("Running PostgreSQL Alembic migrations...")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(alembic_ini), "upgrade", "head"],
        env=env,
        cwd=str(REPO_ROOT / "services" / "api"),
    )
    if result.returncode != 0:
        raise RuntimeError("PostgreSQL migrations FAILED — see output above.")
    logger.info("PostgreSQL migrations OK.")


def _run_sqlite_migrations(db_url: str) -> None:
    from storage.migrations.runner import run_migrations

    logger.info("Running SQLite Alembic migrations...")
    run_migrations(db_url)
    logger.info("SQLite migrations OK.")


# ---------------------------------------------------------------------------
# PostgreSQL seed
# ---------------------------------------------------------------------------


async def _seed_postgres(
    db_url: str,
    *,
    username: str,
    email: str,
    full_name: str,
    password: str,
    role: str,
    store_id: str,
    store_code: str,
    store_name: str,
    store_address: str | None,
) -> int:
    """Create/update the user + store + web device in the central PostgreSQL DB.

    Returns the integer user.id (needed to match with SQLite local cache row).
    """
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.security import hash_password
    from app.db import Base  # noqa: F401 — model registration
    from app.models.device import Device  # noqa: F401
    from app.models.store import Store
    from app.models.user import User

    engine = create_async_engine(db_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    now = datetime.now(UTC)
    user_id_int: int

    async with factory() as session:
        # ── Store ────────────────────────────────────────────────────────────
        existing_store = await session.scalar(select(Store).where(Store.id == store_id))
        if not existing_store:
            session.add(
                Store(
                    id=store_id,
                    code=store_code,
                    name=store_name,
                    address=store_address,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            logger.info("[PG] Created store  id=%s name=%s", store_id, store_name)
        else:
            existing_store.code = store_code
            existing_store.name = store_name
            existing_store.address = store_address or existing_store.address
            existing_store.is_active = True
            existing_store.updated_at = now
            logger.info("[PG] Updated store  id=%s", store_id)
        await session.flush()

        # ── User ─────────────────────────────────────────────────────────────
        existing_user = await session.scalar(select(User).where(User.username == username))
        if not existing_user:
            user = User(
                username=username,
                email=email,
                full_name=full_name,
                hashed_password=hash_password(password),
                role=role,
                assigned_store_id=store_id,
                is_active=True,
                is_superuser=(role == "GLOBAL_ADMIN"),
                is_verified=True,
                created_at=now,
                updated_at=now,
            )
            session.add(user)
            await session.flush()
            user_id_int = user.id
            logger.info("[PG] Created user   username=%s role=%s id=%s", username, role, user_id_int)
        else:
            existing_user.email = email
            existing_user.full_name = full_name
            existing_user.hashed_password = hash_password(password)
            existing_user.role = role
            existing_user.assigned_store_id = store_id
            existing_user.is_active = True
            existing_user.is_superuser = (role == "GLOBAL_ADMIN")
            existing_user.is_verified = True
            existing_user.updated_at = now
            user_id_int = existing_user.id
            logger.info("[PG] Updated user   username=%s id=%s", username, user_id_int)
        await session.flush()

        # ── WEB-DASHBOARD-DEVICE ─────────────────────────────────────────────
        # Always ensure this sentinel device exists.  With our auth.py changes,
        # login no longer requires device registration — but the DB FK still
        # references it and the web LoginView sends it for backward compat.
        d_id = "WEB-DASHBOARD-DEVICE"
        existing_dev = await session.scalar(select(Device).where(Device.id == d_id))
        if not existing_dev:
            session.add(
                Device(
                    id=d_id,
                    store_id=store_id,
                    device_name="Web Management Dashboard",
                    is_active=True,
                    registered_at=now,
                )
            )
            logger.info("[PG] Created device id=%s", d_id)
        else:
            existing_dev.store_id = store_id
            existing_dev.is_active = True
            existing_dev.revocation_reason = None
            existing_dev.revoked_at = None
            logger.info("[PG] Ensured device id=%s active", d_id)

        await session.commit()

    await engine.dispose()
    return user_id_int


# ---------------------------------------------------------------------------
# SQLite seed (desktop local DB)
# ---------------------------------------------------------------------------


def _seed_sqlite(
    db_url: str,
    *,
    username: str,
    email: str,
    full_name: str,
    password: str,
    role: str,
    store_id: str,
    store_code: str,
    store_name: str,
    store_address: str | None,
    pg_user_id: int,
) -> None:
    """Create a matching user row in the desktop's local SQLite DB.

    The local user.id is kept as a STRING for consistency with the rest of
    packages/storage (which uses String(36) PKs). We preserve the central
    integer user id via: id = f"USER-CENTRAL-{pg_user_id}" so sync pull can
    reconcile. The pin_hash column stores the bcrypt hash, enabling the
    desktop's offline login command without a network round-trip.
    """
    from passlib.context import CryptContext
    from sqlalchemy import select

    from storage.db import get_engine, get_sessionmaker
    from storage.models import Device, Store, User

    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    engine = get_engine(db_url)
    factory = get_sessionmaker(engine)
    now = datetime.now(UTC)

    local_user_id = f"USER-CENTRAL-{pg_user_id}"

    with factory() as session:
        # ── Store ────────────────────────────────────────────────────────────
        s = session.scalar(select(Store).where(Store.id == store_id))
        if not s:
            session.add(
                Store(
                    id=store_id,
                    code=store_code,
                    name=store_name,
                    address=store_address,
                    is_active=True,
                )
            )
            logger.info("[SQLite] Created store  id=%s", store_id)
        else:
            s.code = store_code
            s.name = store_name
            s.address = store_address or s.address
            s.is_active = True
            logger.info("[SQLite] Updated store  id=%s", store_id)
        session.flush()

        # ── User with pin_hash ──────────────────────────────────────────────
        u = session.scalar(select(User).where(User.username == username))
        if not u:
            session.add(
                User(
                    id=local_user_id,
                    username=username,
                    email=email,
                    pin_hash=pwd_ctx.hash(password),
                    full_name=full_name,
                    role=role,
                    is_active=True,
                    created_at=now,
                )
            )
            logger.info(
                "[SQLite] Created user   username=%s role=%s pin_hash=SET",
                username,
                role,
            )
        else:
            u.id = local_user_id
            u.email = email
            u.pin_hash = pwd_ctx.hash(password)
            u.full_name = full_name
            u.role = role
            u.is_active = True
            logger.info("[SQLite] Updated user   username=%s pin_hash=REFRESHED", username)
        session.flush()

        # ── Ensure a local device row exists (prevents FK issues on tx writes)
        dev_id = "LOCAL-DEVICE-ANY"
        d = session.scalar(select(Device).where(Device.id == dev_id))
        if not d:
            session.add(
                Device(
                    id=dev_id,
                    store_id=store_id,
                    device_name="Local Desktop (auto)",
                    is_active=True,
                    registered_at=now,
                )
            )
            logger.info("[SQLite] Created device id=%s", dev_id)

        session.commit()
        logger.info("[SQLite] Commit OK.  Desktop offline login now works.")

    engine.dispose()


# ---------------------------------------------------------------------------
# Banner + interactive collection
# ---------------------------------------------------------------------------


def _collect_interactive(args: argparse.Namespace) -> dict[str, Any]:
    print()
    print("=" * 64)
    print("  INVENTORY Tory — SINGLE-USER GENESIS")
    print("=" * 64)
    print("  Seeds YOUR credentials into:")
    print("    • PostgreSQL (central / web / API)")
    print("    • Local SQLite (desktop offline login)")
    print()
    print("  Prompts collect a value only if it was NOT passed via CLI flag.")
    print()

    username = args.username or _prompt("Username", default="admin")
    email = args.email or _prompt("Email (used for web login)")
    while not EMAIL_RE.match(email):
        print("  [ERROR] invalid email format.")
        email = _prompt("Email (used for web login)")

    full_name = args.full_name or _prompt("Full name (display)", default=username.title())
    role = args.role or _prompt_role(default="GLOBAL_ADMIN")
    password = args.password or _prompt_password()

    store_id = args.store_id or _prompt("Store ID", default="STORE-MAIN")
    store_code = args.store_code or _prompt("Store code (short)", default=store_id.split("-")[-1][:8] or "MAIN")
    store_name = args.store_name or _prompt("Store name", default="My Store")
    store_address = (
        args.store_address
        if args.store_address is not None
        else _prompt("Store address (optional)", default="") or None
    )
    return {
        "username": username.strip(),
        "email": email.strip(),
        "full_name": full_name.strip(),
        "role": role,
        "password": password,
        "store_id": store_id.strip(),
        "store_code": store_code.strip(),
        "store_name": store_name.strip(),
        "store_address": store_address,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Genesis single-user bootstrap")
    p.add_argument("--username", help="Login username")
    p.add_argument("--email", help="Login email (web dashboard)")
    p.add_argument("--full-name", help="Display name")
    p.add_argument("--password", help="Plaintext password (NOT recommended; prefer prompt)")
    p.add_argument("--role", choices=list(VALID_ROLES), help="Role (default GLOBAL_ADMIN)")
    p.add_argument("--store-id", help="Store primary key, e.g. STORE-MAIN")
    p.add_argument("--store-code", help="Short store code, e.g. MAIN")
    p.add_argument("--store-name", help="Store display name")
    p.add_argument("--store-address", default=None, help="Store address (optional)")
    p.add_argument(
        "--sqlite-url",
        default=None,
        help="Explicit local SQLite URL (default = packages/storage/inven_tory_local.db)",
    )
    p.add_argument(
        "--run-migrations",
        action="store_true",
        help="Run Alembic migrations (PG + SQLite) before seeding",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    vals: dict[str, Any]

    # If all required values are on the CLI → skip interactivity
    required = (args.username, args.email, args.password, args.role, args.store_id, args.store_code, args.store_name)
    if all(v for v in required):
        vals = {
            "username": args.username.strip(),
            "email": args.email.strip(),
            "full_name": (args.full_name or args.username.title()).strip(),
            "role": args.role,
            "password": args.password,
            "store_id": args.store_id.strip(),
            "store_code": args.store_code.strip(),
            "store_name": args.store_name.strip(),
            "store_address": args.store_address,
        }
        print()
        print("=" * 64)
        print("  INVENTORY Tory — SINGLE-USER GENESIS (non-interactive)")
        print("=" * 64)
    else:
        vals = _collect_interactive(args)

    # Load settings + DB URLs
    from app.core.config import settings

    pg_url = os.environ.get("INVEN_TORY_DB_URL") or settings.database_url
    sqlite_default = f"sqlite:///{REPO_ROOT / 'packages' / 'storage' / 'inven_tory_local.db'}"
    sqlite_url = args.sqlite_url or sqlite_default

    # ── Run migrations if requested ────────────────────────────────────────
    if args.run_migrations:
        _run_postgres_migrations(pg_url)
        _run_sqlite_migrations(sqlite_url)
        print()

    # ── Summary ────────────────────────────────────────────────────────────
    print()
    print("── Summary ─────────────────────────────────────────────────────")
    print(f"  Username       : {vals['username']}")
    print(f"  Email          : {vals['email']}")
    print(f"  Full name      : {vals['full_name']}")
    print(f"  Role           : {vals['role']}")
    print(f"  Store          : {vals['store_id']}  ({vals['store_code']}) {vals['store_name']}")
    print(f"  PG URL         : {_redact(pg_url)}")
    print(f"  SQLite URL     : {sqlite_url}")
    print()
    if sys.stdin.isatty() and not args.password:
        input("  Press ENTER to write the above to both databases...")

    # ── Write ──────────────────────────────────────────────────────────────
    pg_user_id: int = asyncio.run(
        _seed_postgres(
            pg_url,
            username=vals["username"],
            email=vals["email"],
            full_name=vals["full_name"],
            password=vals["password"],
            role=vals["role"],
            store_id=vals["store_id"],
            store_code=vals["store_code"],
            store_name=vals["store_name"],
            store_address=vals["store_address"],
        )
    )

    _seed_sqlite(
        sqlite_url,
        username=vals["username"],
        email=vals["email"],
        full_name=vals["full_name"],
        password=vals["password"],
        role=vals["role"],
        store_id=vals["store_id"],
        store_code=vals["store_code"],
        store_name=vals["store_name"],
        store_address=vals["store_address"],
        pg_user_id=pg_user_id,
    )

    print()
    print("=" * 64)
    print("  ✅ GENESIS COMPLETE")
    print("=" * 64)
    print()
    print("  WEB DASHBOARD login  → email + password")
    print(f"    Email    : {vals['email']}")
    print()
    print("  DESKTOP login        → username + password (any device, no reg)")
    print(f"    Username : {vals['username']}")
    print(f"    (Offline login works because SQLite pin_hash was set.)")
    print()
    return 0


def _redact(url: str) -> str:
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
    raise SystemExit(main())
