"""
DEV-ONLY: Local SQLite seed fixture.

Populates the local SQLite database with sample stores, devices, products,
stock balances, and inventory transactions for local development and testing.

The local SQLite `users` table is a read-only identity cache — it does NOT
store passwords.  User identities for dev are seeded with id/username/role
only (no hashed_password column exists in the SQLite schema from migration
0002_drop_sqlite_password_column onward).

Usage:
    python infra/seed/dev_only/seed_local_sqlite.py [db_path]

WARNING: NEVER import this file from any shipped app code path.
         This file is in infra/seed/dev_only/ — excluded from production builds.
"""

import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

# Add packages to path so storage package is importable
repo_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo_root / "packages" / "storage"))

from sqlalchemy import select  # noqa: E402
from ulid import ULID  # noqa: E402

from storage.db import get_engine, get_sessionmaker  # noqa: E402
from storage.migrations.runner import run_migrations  # noqa: E402
from storage.models import (  # noqa: E402
    Device,
    InventoryTransaction,
    Product,
    StockBalance,
    Store,
    User,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("dev_seed_sqlite")


def current_utc_now() -> datetime:
    return datetime.now(UTC)


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
    {
        "id": "STORE-DELTA",
        "code": "DELTA",
        "name": "Store Delta (Airport Hub)",
        "address": "Terminal 2, Metro Airport",
    },
]

# Dev-only identity cache entries (no passwords — see schema note above).
# User IDs are now auto-increment integers (FastAPI Users), so we don't specify them
DEV_USERS = [
    {
        "username": "admin",
        "email": "admin@inventory.local",
        "full_name": "System Administrator",
        "role": "GLOBAL_ADMIN",
        "password": "DevAdmin2026!",   # DEV-ONLY — hashed into pin_hash
    },
    {
        "username": "manager_alpha",
        "email": "manager.alpha@inventory.local",
        "full_name": "Alpha Store Manager",
        "role": "STORE_MANAGER",
        "password": "DevManager2026!",  # DEV-ONLY
    },
    {
        "username": "clerk_alpha",
        "email": "clerk.alpha@inventory.local",
        "full_name": "Alpha Clerk",
        "role": "STORE_CLERK",
        "password": "DevClerk2026!",    # DEV-ONLY
    },
]

DEV_DEVICES = [
    {"id": "DEV-ALPHA-01", "store_id": "STORE-ALPHA", "device_name": "Store Alpha POS Main"},
    {"id": "DEV-BETA-01", "store_id": "STORE-BETA", "device_name": "Store Beta POS Main"},
]

DEV_PRODUCTS = [
    {
        "id": "PROD-IPHONE15PRO",
        "sku": "ELEC-IPHONE15PRO",
        "name": "Apple iPhone 15 Pro 256GB",
        "brand": "Apple",
        "model": "A3102",
        "category": "Smartphones",
        "unit": "pcs",
        "barcode": "195949012345",
        "low_stock_threshold": 5,
        "warranty_days": 365,
        "serial_tracking_enabled": True,
    },
    {
        "id": "PROD-SAMSUNGS24",
        "sku": "ELEC-SAMSUNG-S24",
        "name": "Samsung Galaxy S24 Ultra",
        "brand": "Samsung",
        "model": "SM-S928B",
        "category": "Smartphones",
        "unit": "pcs",
        "barcode": "880609501234",
        "low_stock_threshold": 4,
        "warranty_days": 365,
        "serial_tracking_enabled": True,
    },
    {
        "id": "PROD-MACBOOKM3",
        "sku": "ELEC-MACBOOK-M3",
        "name": "Apple MacBook Air 15in M3",
        "brand": "Apple",
        "model": "MRYM3LL/A",
        "category": "Laptops",
        "unit": "pcs",
        "barcode": "195949567890",
        "low_stock_threshold": 2,
        "warranty_days": 365,
        "serial_tracking_enabled": True,
    },
    {
        "id": "PROD-SONYXM5",
        "sku": "ELEC-SONY-XM5",
        "name": "Sony WH-1000XM5 Wireless Headphones",
        "brand": "Sony",
        "model": "WH1000XM5/B",
        "category": "Audio",
        "unit": "pcs",
        "barcode": "027242922434",
        "low_stock_threshold": 8,
        "warranty_days": 180,
        "serial_tracking_enabled": False,
    },
    {
        "id": "PROD-DELLXPS15",
        "sku": "ELEC-DELL-XPS15",
        "name": "Dell XPS 15 OLED Laptop",
        "brand": "Dell",
        "model": "XPS9530",
        "category": "Laptops",
        "unit": "pcs",
        "barcode": "884116432109",
        "low_stock_threshold": 3,
        "warranty_days": 365,
        "serial_tracking_enabled": True,
    },
]

INITIAL_STOCK = [
    ("STORE-ALPHA", "PROD-IPHONE15PRO", 20),
    ("STORE-ALPHA", "PROD-SAMSUNGS24", 15),
    ("STORE-ALPHA", "PROD-MACBOOKM3", 10),
    ("STORE-ALPHA", "PROD-SONYXM5", 25),
    ("STORE-ALPHA", "PROD-DELLXPS15", 8),
    ("STORE-BETA", "PROD-IPHONE15PRO", 12),
    ("STORE-BETA", "PROD-SONYXM5", 15),
]


def seed_database(db_url: str = "sqlite:///inven_tory_local.db") -> None:
    """Migrate and seed the local SQLite database idempotently."""
    logger.info("Running migrations on %s ...", db_url)
    run_migrations(db_url)

    engine = get_engine(db_url)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        # Stores
        for s in DEV_STORES:
            if not session.scalar(select(Store).where(Store.id == s["id"])):
                session.add(Store(id=s["id"], code=s["code"], name=s["name"],
                                  address=s["address"], is_active=True))

        # Users (identity cache + offline pin_hash)
        for u in DEV_USERS:
            existing = session.scalar(select(User).where(User.username == u["username"]))
            if not existing:
                from passlib.context import CryptContext
                _pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
                session.add(User(
                    username=u["username"],
                    email=u["email"],
                    full_name=u["full_name"],
                    role=u["role"],
                    pin_hash=_pwd.hash(u["password"]),
                    is_active=True,
                ))
            elif existing.pin_hash is None:
                # Back-fill pin_hash if the row already existed without it
                from passlib.context import CryptContext
                _pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
                existing.pin_hash = _pwd.hash(u["password"])

        session.flush()

        # Devices
        for d in DEV_DEVICES:
            if not session.scalar(select(Device).where(Device.id == d["id"])):
                session.add(Device(id=d["id"], store_id=d["store_id"],
                                   device_name=d["device_name"], is_active=True))

        # Products
        for p in DEV_PRODUCTS:
            if not session.scalar(select(Product).where(Product.id == p["id"])):
                session.add(Product(**p, is_active=True))

        session.flush()

        # Initial stock
        now = current_utc_now()
        # Get the admin user ID (should be ID 1 since it's created first)
        admin_user = session.scalar(select(User).where(User.username == "admin"))
        admin_user_id = admin_user.id if admin_user else 1
        
        for store_id, product_id, qty in INITIAL_STOCK:
            if not session.scalar(
                select(StockBalance).where(
                    StockBalance.store_id == store_id,
                    StockBalance.product_id == product_id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            ):
                tx_id = str(ULID())
                device_id = "DEV-ALPHA-01" if store_id == "STORE-ALPHA" else "DEV-BETA-01"
                session.add(InventoryTransaction(
                    transaction_id=tx_id,
                    store_id=store_id,
                    product_id=product_id,
                    movement_type="RECEIPT",
                    stock_bucket="AVAILABLE",
                    quantity_delta=qty,
                    occurred_at=now,
                    recorded_at=now,
                    user_id=admin_user_id,
                    device_id=device_id,
                    reference_number="DEV-SEED-INITIAL",
                    reason_code="INITIAL_STOCK",
                    sync_status="ACCEPTED",
                ))
                session.add(StockBalance(
                    id=f"SB-{store_id}-{product_id}-AVAIL",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket="AVAILABLE",
                    quantity=qty,
                ))

        session.commit()
        logger.info("SQLite seed complete.")


if __name__ == "__main__":
    db_target = sys.argv[1] if len(sys.argv) > 1 else "sqlite:///inven_tory_local.db"
    seed_database(db_target)
