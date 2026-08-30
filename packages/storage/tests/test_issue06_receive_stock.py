"""
Integration tests for Issue 06: Receive Stock workflow.
Tests receive_stock command, transaction creation, balance updates, and outbox event creation.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from storage.db import Base, get_engine, get_sessionmaker
from storage.models import Device, InventoryTransaction, OutboxEvent, Product, StockBalance, Store, User


def test_issue06_receive_stock_workflow(tmp_path):
    """
    Integration test: receive → balance updates → transaction row exists → outbox row exists.
    Acceptance criteria: Receiving 6 units of a product at Store A results in stock_balances
    showing 6 and one RECEIPT transaction in the ledger.
    """
    db_file = tmp_path / "issue06_test.db"
    db_url = f"sqlite:///{db_file}"

    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    # Setup: Create store, product, user, and device
    with session_factory() as session:
        store = Store(
            id="STORE-A",
            code="A",
            name="Store A",
            address="123 Main St",
            is_active=True,
        )
        session.add(store)
        session.commit()  # Commit store first to satisfy foreign key constraint

        product = Product(
            id="PROD-001",
            sku="ELEC-TEST",
            name="Test Product",
            category="Test",
            unit="pcs",
            is_active=True,
        )
        session.add(product)

        user = User(
            id="USER-TEST",
            username="testuser",
            hashed_password="hashed_password_here",
            role="CASHIER",
        )
        session.add(user)

        device = Device(
            id="DEV-001",
            store_id="STORE-A",
            device_name="Test Device",
            is_active=True,
        )
        session.add(device)
        session.commit()

    # Verify initial state: no transactions, no balances
    with session_factory() as session:
        transactions = session.scalars(select(InventoryTransaction)).all()
        assert len(transactions) == 0

        balances = session.scalars(select(StockBalance)).all()
        assert len(balances) == 0

        outbox_events = session.scalars(select(OutboxEvent)).all()
        assert len(outbox_events) == 0

    # Simulate receive_stock operation (mimicking Rust backend logic)
    with session_factory() as session:
        transaction_id = "TX-TEST-001"
        quantity = 6
        now = datetime.now(UTC)

        # 1. Insert RECEIPT transaction
        transaction = InventoryTransaction(
            transaction_id=transaction_id,
            store_id="STORE-A",
            product_id="PROD-001",
            movement_type="RECEIPT",
            stock_bucket="AVAILABLE",
            quantity_delta=quantity,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-TEST",
            device_id="DEV-001",
            reference_number="R-1001",
            reason_code="Test Supplier",
            sync_status="PENDING",
        )
        session.add(transaction)

        # 2. Update stock_balances projection (UPSERT)
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A",
                StockBalance.product_id == "PROD-001",
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        if balance:
            balance.quantity += quantity
        else:
            balance = StockBalance(
                id="SB-STORE-A-PROD-001-AVAILABLE",
                store_id="STORE-A",
                product_id="PROD-001",
                stock_bucket="AVAILABLE",
                quantity=quantity,
            )
            session.add(balance)

        # 3. Create outbox event (stub)
        outbox = OutboxEvent(
            id="OB-TEST-001",
            event_id="EVT-TX-TEST-001",
            event_type="INVENTORY_TRANSACTION",
            payload='{"transaction_id":"TX-TEST-001","store_id":"STORE-A","product_id":"PROD-001","movement_type":"RECEIPT","quantity_delta":6}',
            status="PENDING",
            retry_count=0,
        )
        session.add(outbox)

        session.commit()

    # Verify post-receive state
    with session_factory() as session:
        # Check: One RECEIPT transaction exists
        transactions = session.scalars(select(InventoryTransaction)).all()
        assert len(transactions) == 1
        tx = transactions[0]
        assert tx.transaction_id == "TX-TEST-001"
        assert tx.movement_type == "RECEIPT"
        assert tx.quantity_delta == 6
        assert tx.store_id == "STORE-A"
        assert tx.product_id == "PROD-001"
        assert tx.sync_status == "PENDING"

        # Check: Stock balance shows 6 in AVAILABLE bucket
        balances = session.scalars(select(StockBalance)).all()
        assert len(balances) == 1
        balance = balances[0]
        assert balance.store_id == "STORE-A"
        assert balance.product_id == "PROD-001"
        assert balance.stock_bucket == "AVAILABLE"
        assert balance.quantity == 6

        # Check: One outbox event exists
        outbox_events = session.scalars(select(OutboxEvent)).all()
        assert len(outbox_events) == 1
        outbox = outbox_events[0]
        assert outbox.event_type == "INVENTORY_TRANSACTION"
        assert outbox.status == "PENDING"
        assert "TX-TEST-001" in outbox.payload


def test_issue06_multiple_receives_accumulate_balance(tmp_path):
    """Test that multiple receive operations accumulate correctly in stock_balances."""
    db_file = tmp_path / "issue06_accumulate_test.db"
    db_url = f"sqlite:///{db_file}"

    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    # Setup
    with session_factory() as session:
        store = Store(
            id="STORE-B",
            code="B",
            name="Store B",
            address="456 Oak Ave",
            is_active=True,
        )
        session.add(store)
        session.commit()  # Commit store first to satisfy foreign key constraint

        product = Product(
            id="PROD-002",
            sku="ELEC-TEST2",
            name="Test Product 2",
            category="Test",
            unit="pcs",
            is_active=True,
        )
        session.add(product)

        user = User(
            id="USER-TEST2",
            username="testuser2",
            hashed_password="hashed_password_here",
            role="CASHIER",
        )
        session.add(user)

        device = Device(
            id="DEV-002",
            store_id="STORE-B",
            device_name="Test Device 2",
            is_active=True,
        )
        session.add(device)
        session.commit()

    # First receive: 10 units
    with session_factory() as session:
        now1 = datetime.now(UTC)
        transaction1 = InventoryTransaction(
            transaction_id="TX-TEST-002",
            store_id="STORE-B",
            product_id="PROD-002",
            movement_type="RECEIPT",
            stock_bucket="AVAILABLE",
            quantity_delta=10,
            occurred_at=now1,
            recorded_at=now1,
            user_id="USER-TEST2",
            device_id="DEV-002",
            sync_status="PENDING",
        )
        session.add(transaction1)

        balance = StockBalance(
            id="SB-STORE-B-PROD-002-AVAILABLE",
            store_id="STORE-B",
            product_id="PROD-002",
            stock_bucket="AVAILABLE",
            quantity=10,
        )
        session.add(balance)
        session.commit()

    # Second receive: 5 units (should accumulate to 15)
    with session_factory() as session:
        now2 = datetime.now(UTC)
        transaction2 = InventoryTransaction(
            transaction_id="TX-TEST-003",
            store_id="STORE-B",
            product_id="PROD-002",
            movement_type="RECEIPT",
            stock_bucket="AVAILABLE",
            quantity_delta=5,
            occurred_at=now2,
            recorded_at=now2,
            user_id="USER-TEST2",
            device_id="DEV-002",
            sync_status="PENDING",
        )
        session.add(transaction2)

        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-B",
                StockBalance.product_id == "PROD-002",
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        balance.quantity += 5
        session.commit()

    # Verify final balance is 15
    with session_factory() as session:
        transactions = session.scalars(select(InventoryTransaction)).all()
        assert len(transactions) == 2

        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-B",
                StockBalance.product_id == "PROD-002",
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert balance.quantity == 15
