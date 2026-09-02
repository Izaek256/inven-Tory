"""
Development seed script for local SQLite database.

Populates initial sample stores, users, devices, products, stock balances,
and inventory transactions for local development and testing.
"""

import logging
import sys
from datetime import UTC, datetime

from sqlalchemy import select
from ulid import ULID

from storage.db import get_engine, get_sessionmaker
from storage.migrations.runner import run_migrations
from storage.models import (
    Device,
    InventoryTransaction,
    Product,
    StockBalance,
    Store,
    User,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("seed")


def current_utc_now() -> datetime:
    return datetime.now(UTC)


def seed_database(db_url: str = "sqlite:///inven_tory_local.db") -> None:
    """Migrate database and seed sample development data idempotently."""
    logger.info("Ensuring database migrations are up to date...")
    run_migrations(db_url)

    engine = get_engine(db_url)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        # 1. Seed Stores
        stores_data = [
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

        for s in stores_data:
            existing = session.scalar(select(Store).where(Store.id == s["id"]))
            if not existing:
                session.add(
                    Store(
                        id=s["id"],
                        code=s["code"],
                        name=s["name"],
                        address=s["address"],
                        is_active=True,
                    )
                )

        # 2. Seed Users
        users_data = [
            {
                "id": "USER-ADMIN-01",
                "username": "admin",
                "email": "admin@inventory.local",
                "full_name": "System Administrator",
                "role": "ADMIN",
            },
            {
                "id": "USER-MGR-01",
                "username": "manager_alpha",
                "email": "manager.alpha@inventory.local",
                "full_name": "Alpha Store Manager",
                "role": "MANAGER",
            },
            {
                "id": "USER-CASHIER-01",
                "username": "cashier_alpha",
                "email": "cashier.alpha@inventory.local",
                "full_name": "Alpha Cashier",
                "role": "CASHIER",
            },
        ]

        for u in users_data:
            existing = session.scalar(select(User).where(User.id == u["id"]))
            if not existing:
                session.add(
                    User(
                        id=u["id"],
                        username=u["username"],
                        email=u["email"],
                        full_name=u["full_name"],
                        role=u["role"],
                        # hashed_password removed in migration 0002 — auth is central-only
                        is_active=True,
                    )
                )

        # Flush parents (Stores & Users)
        session.flush()

        # 3. Seed Devices
        devices_data = [
            {
                "id": "DEV-ALPHA-01",
                "store_id": "STORE-ALPHA",
                "device_name": "Store Alpha POS Main",
            },
            {
                "id": "DEV-BETA-01",
                "store_id": "STORE-BETA",
                "device_name": "Store Beta POS Main",
            },
        ]

        for d in devices_data:
            existing = session.scalar(select(Device).where(Device.id == d["id"]))
            if not existing:
                session.add(
                    Device(
                        id=d["id"],
                        store_id=d["store_id"],
                        device_name=d["device_name"],
                        is_active=True,
                    )
                )

        # 4. Seed Products
        products_data = [
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
                "name": "Apple MacBook Air 15' M3",
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

        for p in products_data:
            existing = session.scalar(select(Product).where(Product.id == p["id"]))
            if not existing:
                session.add(
                    Product(
                        id=p["id"],
                        sku=p["sku"],
                        name=p["name"],
                        brand=p["brand"],
                        model=p["model"],
                        category=p["category"],
                        unit=p["unit"],
                        barcode=p["barcode"],
                        low_stock_threshold=p["low_stock_threshold"],
                        warranty_days=p["warranty_days"],
                        serial_tracking_enabled=p["serial_tracking_enabled"],
                        is_active=True,
                    )
                )

        # Flush products and devices
        session.flush()

        # 5. Initial stock receipts and balances
        initial_receipts = [
            ("STORE-ALPHA", "PROD-IPHONE15PRO", 20),
            ("STORE-ALPHA", "PROD-SAMSUNGS24", 15),
            ("STORE-ALPHA", "PROD-MACBOOKM3", 10),
            ("STORE-ALPHA", "PROD-SONYXM5", 25),
            ("STORE-ALPHA", "PROD-DELLXPS15", 8),
            ("STORE-BETA", "PROD-IPHONE15PRO", 12),
            ("STORE-BETA", "PROD-SONYXM5", 15),
        ]

        now = current_utc_now()
        for store_id, product_id, qty in initial_receipts:
            # Check if stock balance exists
            sb = session.scalar(
                select(StockBalance).where(
                    StockBalance.store_id == store_id,
                    StockBalance.product_id == product_id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )

            if not sb:
                # Add initial transaction
                tx_id = str(ULID())
                tx = InventoryTransaction(
                    transaction_id=tx_id,
                    store_id=store_id,
                    product_id=product_id,
                    movement_type="RECEIPT",
                    stock_bucket="AVAILABLE",
                    quantity_delta=qty,
                    occurred_at=now,
                    recorded_at=now,
                    user_id="USER-ADMIN-01",
                    device_id="DEV-ALPHA-01" if store_id == "STORE-ALPHA" else "DEV-BETA-01",
                    reference_number="INITIAL-SEED-REC",
                    reason_code="INITIAL_STOCK",
                    sync_status="ACCEPTED",
                )
                session.add(tx)

                # Add stock balance projection
                sb_id = f"SB-{store_id}-{product_id}-AVAIL"
                session.add(
                    StockBalance(
                        id=sb_id,
                        store_id=store_id,
                        product_id=product_id,
                        stock_bucket="AVAILABLE",
                        quantity=qty,
                    )
                )

        session.commit()
        logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    db_target = sys.argv[1] if len(sys.argv) > 1 else "sqlite:///inven_tory_local.db"
    seed_database(db_target)
