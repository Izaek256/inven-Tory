"""
Tests for local SQLite SQLAlchemy models.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from ulid import ULID

from storage.db import Base, get_engine, get_sessionmaker
from storage.models import (
    Device,
    InventoryTransaction,
    OutboxEvent,
    Product,
    StockBalance,
    Store,
    Transfer,
    User,
)


def test_models_crud(tmp_path):
    """Test full CRUD operations on all 8 local SQLite models."""
    db_file = tmp_path / "test_models.db"
    db_url = f"sqlite:///{db_file}"

    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        # 1. Stores & Users (Parent entities)
        store1 = Store(
            id="STORE-01",
            code="STORE01",
            name="Test Store 1",
            address="123 Main St",
        )
        store2 = Store(
            id="STORE-02",
            code="STORE02",
            name="Test Store 2",
        )
        session.add_all([store1, store2])

        user = User(
            id="USER-01",
            username="testuser",
            email="testuser@example.com",
            hashed_password="hashedpassword123",
            full_name="Test User",
            role="ADMIN",
        )
        session.add(user)
        session.flush()

        # 2. Devices & Products
        device = Device(
            id="DEV-01",
            store_id="STORE-01",
            device_name="POS 1",
        )
        session.add(device)

        product = Product(
            id="PROD-01",
            sku="SKU-TEST-001",
            name="Test Phone",
            brand="TestBrand",
            model="TestModel",
            category="Smartphones",
            unit="pcs",
            low_stock_threshold=10,
            warranty_days=365,
            batch_tracking_enabled=True,
        )
        session.add(product)
        session.flush()

        # 3. StockBalance, Transfer, InventoryTransaction, OutboxEvent
        balance = StockBalance(
            id="SB-01",
            store_id="STORE-01",
            product_id="PROD-01",
            stock_bucket="AVAILABLE",
            quantity=50,
        )
        session.add(balance)

        transfer = Transfer(
            id="TRF-01",
            source_store_id="STORE-01",
            destination_store_id="STORE-02",
            product_id="PROD-01",
            quantity=5,
            status="DRAFT",
            created_by_user_id="USER-01",
        )
        session.add(transfer)
        session.flush()

        now = datetime.now(UTC)
        tx = InventoryTransaction(
            transaction_id=str(ULID()),
            store_id="STORE-01",
            product_id="PROD-01",
            movement_type="RECEIPT",
            stock_bucket="AVAILABLE",
            quantity_delta=50,
            occurred_at=now,
            user_id="USER-01",
            device_id="DEV-01",
            transfer_id="TRF-01",
            purchase_order_id="PO-999",
            batch_id="BATCH-001",
            sync_status="PENDING",
        )
        session.add(tx)

        outbox = OutboxEvent(
            id="OB-01",
            event_id=str(ULID()),
            event_type="inventory_transaction",
            payload='{"transaction_id": "tx123"}',
            status="PENDING",
        )
        session.add(outbox)

        session.commit()

    # Query back and verify
    with session_factory() as session:
        fetched_store = session.scalar(select(Store).where(Store.id == "STORE-01"))
        assert fetched_store is not None
        assert fetched_store.code == "STORE01"

        fetched_prod = session.scalar(select(Product).where(Product.id == "PROD-01"))
        assert fetched_prod is not None
        assert fetched_prod.sku == "SKU-TEST-001"
        assert fetched_prod.low_stock_threshold == 10
        assert fetched_prod.warranty_days == 365
        assert fetched_prod.batch_tracking_enabled is True

        fetched_tx = session.scalar(
            select(InventoryTransaction).where(InventoryTransaction.product_id == "PROD-01")
        )
        assert fetched_tx is not None
        assert fetched_tx.purchase_order_id == "PO-999"
        assert fetched_tx.batch_id == "BATCH-001"
        assert fetched_tx.quantity_delta == 50

        fetched_outbox = session.scalar(select(OutboxEvent).where(OutboxEvent.id == "OB-01"))
        assert fetched_outbox is not None
        assert fetched_outbox.status == "PENDING"
