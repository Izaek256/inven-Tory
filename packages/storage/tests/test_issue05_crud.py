"""
Integration tests for Issue 05: Store & Product CRUD operations and unique constraints against local SQLite DB.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from storage.db import Base, get_engine, get_sessionmaker
from storage.models import Device, Product, Store


def test_issue05_store_and_product_crud(tmp_path):
    """Verify Store & Product CRUD flows and unique constraint enforcement in SQLite DB."""
    db_file = tmp_path / "issue05_test.db"
    db_url = f"sqlite:///{db_file}"

    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    # 1. Test Store Creation & Reading
    with session_factory() as session:
        store1 = Store(
            id="STORE-ALPHA",
            code="ALPHA",
            name="Store Alpha Flagship",
            address="100 Electronics Way",
            is_active=True,
        )
        session.add(store1)
        session.commit()

    with session_factory() as session:
        fetched_store = session.scalar(select(Store).where(Store.id == "STORE-ALPHA"))
        assert fetched_store is not None
        assert fetched_store.code == "ALPHA"
        assert fetched_store.name == "Store Alpha Flagship"

    # 2. Test Store Code Uniqueness Constraint (FR-STORE-002)
    with session_factory() as session:
        duplicate_store = Store(
            id="STORE-ALPHA-DUP",
            code="ALPHA",  # Duplicate code
            name="Duplicate Store Code",
        )
        session.add(duplicate_store)
        with pytest.raises(IntegrityError):
            session.commit()

    # 3. Test Device Registration Stub (FR-STORE-003)
    with session_factory() as session:
        device = Device(
            id="DEV-001",
            store_id="STORE-ALPHA",
            device_name="POS Terminal 1",
            is_active=True,
        )
        session.add(device)
        session.commit()

    with session_factory() as session:
        fetched_device = session.scalar(select(Device).where(Device.id == "DEV-001"))
        assert fetched_device is not None
        assert fetched_device.store_id == "STORE-ALPHA"
        assert fetched_device.device_name == "POS Terminal 1"

    # 4. Test Product Creation & Reading (v1.0.0 fields only)
    with session_factory() as session:
        prod1 = Product(
            id="PROD-001",
            sku="SKU-IPHONE15PRO",
            name="Apple iPhone 15 Pro",
            brand="Apple",
            model="A3102",
            category="Smartphones",
            unit="pcs",
            barcode="195949012345",
            alternate_names="iPhone 15 Pro",
            serial_tracking_enabled=True,
            is_active=True,
        )
        session.add(prod1)
        session.commit()

    with session_factory() as session:
        fetched_prod = session.scalar(select(Product).where(Product.id == "PROD-001"))
        assert fetched_prod is not None
        assert fetched_prod.sku == "SKU-IPHONE15PRO"
        assert fetched_prod.serial_tracking_enabled is True

    # 5. Test Product SKU Uniqueness Constraint (FR-PROD-001)
    with session_factory() as session:
        duplicate_prod = Product(
            id="PROD-002",
            sku="SKU-IPHONE15PRO",  # Duplicate SKU
            name="Duplicate SKU Product",
            category="Smartphones",
            unit="pcs",
        )
        session.add(duplicate_prod)
        with pytest.raises(IntegrityError):
            session.commit()

    # 6. Test Product Update & Deactivation
    with session_factory() as session:
        prod = session.scalar(select(Product).where(Product.id == "PROD-001"))
        assert prod is not None
        prod.name = "Apple iPhone 15 Pro 256GB Updated"
        prod.is_active = False
        session.commit()

    with session_factory() as session:
        updated_prod = session.scalar(select(Product).where(Product.id == "PROD-001"))
        assert updated_prod is not None
        assert updated_prod.name == "Apple iPhone 15 Pro 256GB Updated"
        assert updated_prod.is_active is False
