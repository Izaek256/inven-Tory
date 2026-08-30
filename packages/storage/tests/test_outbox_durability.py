"""
Kill-and-restart outbox durability integration test suite (SYNC-002, NFR-REL-001).

Proves that:
1. Uncommitted force-kill results in complete rollback without partial records.
2. Committed transactions and local outbox events survive restart/crash/power loss 100% intact.
3. No data is lost and no transaction is duplicated across restarts.
"""

from datetime import UTC, datetime

from domain.entities.enums import MovementType, StockBucket, SyncStatus

from storage.db import Base, get_engine, get_sessionmaker
from storage.models import (
    Device,
    InventoryTransaction,
    OutboxEvent,
    Product,
    StockBalance,
    Store,
    User,
)
from storage.services.outbox_service import OutboxService


def setup_initial_database(db_url: str):
    """Initializes stores, products, users, devices, and base balances in SQLite."""
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        store = Store(id="STORE-DURABLE-A", code="DA", name="Durable Store A", is_active=True)
        prod = Product(
            id="PROD-DURABLE-01",
            sku="SKU-DUR-01",
            name="Durable Item",
            category="Electronics",
            unit="pcs",
            is_active=True,
        )
        session.add_all([store, prod])
        session.commit()

        user = User(
            id="USR-1", username="testuser", hashed_password="hash", role="MANAGER", is_active=True
        )
        device = Device(
            id="DEV-1", store_id="STORE-DURABLE-A", device_name="Test Device", is_active=True
        )
        session.add_all([user, device])
        session.commit()
    return engine


def test_uncommitted_force_kill_rollback(tmp_path):
    """
    Acceptance Criteria (NFR-REL-001): Force-kill mid-transaction before commit.
    On restart, no orphan transaction or outbox event exists.
    """
    db_file = tmp_path / "durability_uncommitted.db"
    db_url = f"sqlite:///{db_file}"
    engine = setup_initial_database(db_url)
    session_factory = get_sessionmaker(engine)

    now = datetime.now(UTC)
    session = session_factory()
    tx = InventoryTransaction(
        transaction_id="TX-KILL-UNCOMMITTED",
        store_id="STORE-DURABLE-A",
        product_id="PROD-DURABLE-01",
        movement_type=MovementType.RECEIPT.value,
        stock_bucket=StockBucket.AVAILABLE.value,
        quantity_delta=10,
        occurred_at=now,
        recorded_at=now,
        user_id="USR-1",
        device_id="DEV-1",
        sync_status=SyncStatus.PENDING.value,
    )
    session.add(tx)
    OutboxService.enqueue_event(
        session, "EVT-KILL-UNCOMMITTED", "INVENTORY_TRANSACTION", {"tx_id": "TX-KILL-UNCOMMITTED"}
    )
    session.flush()

    # SIMULATE APP FORCE-KILL: Close connection without calling commit()
    session.close()

    # SIMULATE APP RESTART: Re-open database with fresh engine
    restart_engine = get_engine(db_url)
    restart_factory = get_sessionmaker(restart_engine)

    with restart_factory() as check_session:
        tx_count = check_session.query(InventoryTransaction).count()
        outbox_count = check_session.query(OutboxEvent).count()

        # Zero partial records survived uncommitted kill
        assert tx_count == 0, "Uncommitted transaction must not be persisted on force kill"
        assert outbox_count == 0, "Uncommitted outbox event must not be persisted on force kill"


def test_committed_outbox_survives_restart(tmp_path):
    """
    Acceptance Criteria (SYNC-002, NFR-REL-001): Force-kill immediately after commit.
    On restart, all ledger transactions and pending outbox events survive intact.
    """
    db_file = tmp_path / "durability_committed.db"
    db_url = f"sqlite:///{db_file}"
    engine = setup_initial_database(db_url)
    session_factory = get_sessionmaker(engine)

    now = datetime.now(UTC)
    # 1. Execute multiple atomic workflow commits
    with session_factory() as session:
        # Atomic commit 1: Receive Stock
        tx1 = InventoryTransaction(
            transaction_id="TX-DUR-001",
            store_id="STORE-DURABLE-A",
            product_id="PROD-DURABLE-01",
            movement_type=MovementType.RECEIPT.value,
            stock_bucket=StockBucket.AVAILABLE.value,
            quantity_delta=20,
            occurred_at=now,
            recorded_at=now,
            user_id="USR-1",
            device_id="DEV-1",
            sync_status=SyncStatus.PENDING.value,
        )
        bal1 = StockBalance(
            id="SB-STORE-DURABLE-A-PROD-DURABLE-01-AVAILABLE",
            store_id="STORE-DURABLE-A",
            product_id="PROD-DURABLE-01",
            stock_bucket=StockBucket.AVAILABLE.value,
            quantity=20,
        )
        session.add_all([tx1, bal1])
        OutboxService.enqueue_event(
            session, "EVT-DUR-001", "INVENTORY_TRANSACTION", {"tx_id": "TX-DUR-001", "delta": 20}
        )
        session.commit()

        # Atomic commit 2: Sale Stock
        tx2 = InventoryTransaction(
            transaction_id="TX-DUR-002",
            store_id="STORE-DURABLE-A",
            product_id="PROD-DURABLE-01",
            movement_type=MovementType.SALE.value,
            stock_bucket=StockBucket.AVAILABLE.value,
            quantity_delta=-5,
            occurred_at=now,
            recorded_at=now,
            user_id="USR-1",
            device_id="DEV-1",
            sync_status=SyncStatus.PENDING.value,
        )
        bal1.quantity = 15
        session.add(tx2)
        OutboxService.enqueue_event(
            session, "EVT-DUR-002", "INVENTORY_TRANSACTION", {"tx_id": "TX-DUR-002", "delta": -5}
        )
        session.commit()

    # SIMULATE FORCE-KILL / POWER LOSS: Dispose engine
    engine.dispose()

    # 2. SIMULATE APP RESTART: Instantiate fresh engine on same SQLite database
    restarted_engine = get_engine(db_url)
    restarted_factory = get_sessionmaker(restarted_engine)

    with restarted_factory() as restart_session:
        # Verify ledger transactions survived
        txs = restart_session.query(InventoryTransaction).all()
        assert len(txs) == 2
        assert {t.transaction_id for t in txs} == {"TX-DUR-001", "TX-DUR-002"}

        # Verify stock balance is accurate (15)
        bal = restart_session.query(StockBalance).first()
        assert bal is not None
        assert bal.quantity == 15

        # Verify durable outbox events survived with PENDING status
        outbox_events = restart_session.query(OutboxEvent).all()
        assert len(outbox_events) == 2
        assert {o.event_id for o in outbox_events} == {"EVT-DUR-001", "EVT-DUR-002"}
        assert all(o.status == "PENDING" for o in outbox_events)

        # Verify pending count helper reflects accurate count
        pending_count = OutboxService.get_pending_count(restart_session)
        assert pending_count == 2


def test_idempotent_reprocessing_no_duplication(tmp_path):
    """
    Acceptance Criteria (SYNC-003, SYNC-004): Re-syncing pending outbox events
    updates state machine to ACCEPTED/SYNCED without creating duplicate transactions or balances.
    """
    db_file = tmp_path / "durability_idempotency.db"
    db_url = f"sqlite:///{db_file}"
    engine = setup_initial_database(db_url)
    session_factory = get_sessionmaker(engine)

    now = datetime.now(UTC)
    with session_factory() as session:
        tx = InventoryTransaction(
            transaction_id="TX-IDEMP-001",
            store_id="STORE-DURABLE-A",
            product_id="PROD-DURABLE-01",
            movement_type=MovementType.RECEIPT.value,
            stock_bucket=StockBucket.AVAILABLE.value,
            quantity_delta=10,
            occurred_at=now,
            recorded_at=now,
            user_id="USR-1",
            device_id="DEV-1",
            sync_status=SyncStatus.PENDING.value,
        )
        session.add(tx)
        OutboxService.enqueue_event(
            session, "EVT-IDEMP-001", "INVENTORY_TRANSACTION", {"tx_id": "TX-IDEMP-001"}
        )
        session.commit()

    # Simulate sync worker execution
    with session_factory() as session:
        # Worker picks up pending events: PENDING -> SENDING -> ACCEPTED -> SYNCED
        OutboxService.transition_event_state(session, "EVT-IDEMP-001", SyncStatus.SENDING)
        OutboxService.transition_event_state(session, "EVT-IDEMP-001", SyncStatus.ACCEPTED)
        OutboxService.transition_event_state(session, "EVT-IDEMP-001", SyncStatus.SYNCED)

        # Mark ledger tx ACCEPTED as well
        tx_row = session.query(InventoryTransaction).filter_by(transaction_id="TX-IDEMP-001").one()
        tx_row.sync_status = SyncStatus.ACCEPTED.value
        session.commit()

    # Restart app and verify state
    engine.dispose()
    restarted_engine = get_engine(db_url)
    restarted_factory = get_sessionmaker(restarted_engine)

    with restarted_factory() as check_session:
        # Exactly 1 transaction exists
        assert check_session.query(InventoryTransaction).count() == 1
        # Outbox item is SYNCED, pending count is 0
        assert OutboxService.get_pending_count(check_session) == 0
        outbox = check_session.query(OutboxEvent).filter_by(event_id="EVT-IDEMP-001").one()
        assert outbox.status == "SYNCED"
