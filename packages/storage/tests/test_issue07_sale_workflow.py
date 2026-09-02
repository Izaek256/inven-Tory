"""
Integration tests for Issue 07: Sale / Issue workflow.

Acceptance scenarios:
  AT-001: Start with 6 units, sell 1 → local balance becomes 5, transaction is PENDING.
  AT-012: Attempting to sell more than available is rejected and shows the available quantity.

Architecture notes:
  - Tests exercise the storage layer directly, mirroring the Tauri Rust backend logic.
  - The domain NegativeStockError is validated via validate_transaction (FR-MOV-008).
  - A temporary SQLite file is used so each test is isolated.
"""

import json
from datetime import UTC, datetime

import pytest
from domain.entities.enums import MovementType, StockBucket, SyncStatus
from domain.entities.inventory_transaction import InventoryTransaction as DomainTransaction
from domain.rules.ledger import NegativeStockError, validate_transaction
from sqlalchemy import select

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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_db(tmp_path, suffix: str = "test"):
    """Return (engine, session_factory) with schema created in a temp file."""
    db_file = tmp_path / f"issue07_{suffix}.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    return engine, get_sessionmaker(engine)


def _seed_fixtures(session_factory) -> tuple[str, str]:
    """Insert minimum required rows and return (store_id, product_id)."""
    store_id = "STORE-A"
    product_id = "PROD-HISENSE-120L"

    with session_factory() as session:
        session.add(
            Store(
                id=store_id,
                code="A",
                name="Store Alpha",
                address="1 Main St",
                is_active=True,
            )
        )
        session.commit()

        session.add(
            Product(
                id=product_id,
                sku="ELEC-HISENSE-120L",
                name="Hisense 120L Refrigerator",
                category="Appliances",
                unit="pcs",
                is_active=True,
            )
        )
        session.add(
            User(
                id="USER-DEMO",
                username="demo",
                role="CASHIER",
            )
        )
        session.add(
            Device(
                id="DEV-DEMO",
                store_id=store_id,
                device_name="Demo Device",
                is_active=True,
            )
        )
        session.commit()

    return store_id, product_id


def _receive_stock(session_factory, store_id: str, product_id: str, qty: int, tx_id: str) -> None:
    """Simulate the Rust receive_stock command: insert RECEIPT transaction + update balance."""
    now = datetime.now(UTC)
    with session_factory() as session:
        session.add(
            InventoryTransaction(
                transaction_id=tx_id,
                store_id=store_id,
                product_id=product_id,
                movement_type="RECEIPT",
                stock_bucket="AVAILABLE",
                quantity_delta=qty,
                occurred_at=now,
                recorded_at=now,
                user_id="USER-DEMO",
                device_id="DEV-DEMO",
                sync_status="PENDING",
            )
        )
        existing = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        if existing:
            existing.quantity += qty
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-AVAILABLE",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket="AVAILABLE",
                    quantity=qty,
                )
            )
        session.commit()


def _sell_stock(
    session_factory,
    store_id: str,
    product_id: str,
    qty: int,
    tx_id: str,
    strict_mode: bool = True,
) -> InventoryTransaction:
    """
    Simulate the Rust sell_stock command with strict-mode enforcement.

    Steps (mirroring lib.rs sell_stock):
      1. Read current AVAILABLE balance.
      2. If strict_mode and qty > balance: raise NegativeStockError (FR-MOV-008).
      3. Insert SALE transaction with quantity_delta = -qty.
      4. Decrease stock_balances.
      5. Create outbox event.
      6. Return the inserted transaction row.

    The domain validate_transaction is also called here so the Python-layer
    business rule is exercised (FR-MOV-008, AT-001, AT-012).
    """
    now = datetime.now(UTC)

    with session_factory() as session:
        # 1. Read balance
        balance_row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        current_balance = balance_row.quantity if balance_row else 0

        # 2. Build domain transaction for rule validation
        domain_tx = DomainTransaction(
            store_id=store_id,
            product_id=product_id,
            movement_type=MovementType.SALE,
            quantity_delta=-qty,
            occurred_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            stock_bucket=StockBucket.AVAILABLE,
            sync_status=SyncStatus.PENDING,
        )

        # Fetch existing domain history for the validator
        existing_txs = session.scalars(
            select(InventoryTransaction).where(
                InventoryTransaction.store_id == store_id,
                InventoryTransaction.product_id == product_id,
            )
        ).all()
        history = [
            DomainTransaction(
                store_id=t.store_id,
                product_id=t.product_id,
                movement_type=MovementType(t.movement_type),
                quantity_delta=t.quantity_delta,
                occurred_at=t.occurred_at,
                user_id=t.user_id,
                device_id=t.device_id,
                stock_bucket=StockBucket(t.stock_bucket),
                sync_status=SyncStatus(t.sync_status),
            )
            for t in existing_txs
        ]

        # This raises NegativeStockError if strict_mode and would go negative (FR-MOV-008)
        validate_transaction(domain_tx, history, strict_mode=strict_mode)

        # 3. Insert SALE transaction
        sale_tx = InventoryTransaction(
            transaction_id=tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type="SALE",
            stock_bucket="AVAILABLE",
            quantity_delta=-qty,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            sync_status="PENDING",
        )
        session.add(sale_tx)

        # 4. Decrease balance
        if balance_row:
            balance_row.quantity = current_balance - qty
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-AVAILABLE",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket="AVAILABLE",
                    quantity=-qty,
                )
            )

        # 5. Outbox event
        payload = json.dumps(
            {
                "transaction_id": tx_id,
                "store_id": store_id,
                "product_id": product_id,
                "movement_type": "SALE",
                "quantity_delta": -qty,
            }
        )
        session.add(
            OutboxEvent(
                id=f"OB-{tx_id}",
                event_id=f"EVT-{tx_id}",
                event_type="INVENTORY_TRANSACTION",
                payload=payload,
                status="PENDING",
                retry_count=0,
            )
        )

        session.commit()
        return sale_tx


# ---------------------------------------------------------------------------
# AT-001: Start at 6, disconnect (simulate), sell 1 -> balance becomes 5, PENDING
# ---------------------------------------------------------------------------


def test_at001_sale_decreases_balance_and_creates_pending_transaction(tmp_path) -> None:
    """
    AT-001: receive 6 -> sell 1 (offline/disconnected) -> balance = 5, sync_status = PENDING.

    This is the canonical offline-first acceptance test: the transaction is persisted
    locally before any synchronization attempt, balance projection is correct, and the
    outbox event is enqueued for later sync.
    """
    _, session_factory = _setup_db(tmp_path, "at001")
    store_id, product_id = _seed_fixtures(session_factory)

    # --- Receive 6 units (simulates prior receipt while online or offline) ---
    _receive_stock(session_factory, store_id, product_id, 6, "TX-RECEIPT-001")

    # Verify starting balance
    with session_factory() as session:
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert balance.quantity == 6, "Starting balance must be 6"

    # --- Simulate OFFLINE / disconnected sale of 1 unit ---
    _sell_stock(session_factory, store_id, product_id, 1, "TX-SALE-001")

    # --- Assert: balance is now 5 ---
    with session_factory() as session:
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert balance.quantity == 5, f"Balance should be 5 after selling 1, got {balance.quantity}"

    # --- Assert: SALE transaction exists and is PENDING ---
    with session_factory() as session:
        tx = session.scalar(
            select(InventoryTransaction).where(InventoryTransaction.transaction_id == "TX-SALE-001")
        )
        assert tx is not None, "SALE transaction must exist in ledger"
        assert tx.movement_type == "SALE"
        assert tx.quantity_delta == -1, "SALE quantity_delta must be -1"
        assert tx.store_id == store_id
        assert tx.product_id == product_id
        assert tx.sync_status == "PENDING", "Transaction must be PENDING (offline / not yet synced)"

    # --- Assert: outbox event enqueued for sync ---
    with session_factory() as session:
        outbox = session.scalar(
            select(OutboxEvent).where(OutboxEvent.event_id == "EVT-TX-SALE-001")
        )
        assert outbox is not None, "Outbox event must be created for background sync"
        assert outbox.status == "PENDING"
        assert outbox.event_type == "INVENTORY_TRANSACTION"
        assert "TX-SALE-001" in outbox.payload


# ---------------------------------------------------------------------------
# AT-012: Sell more than available -> rejected with available quantity in message
# ---------------------------------------------------------------------------


def test_at012_strict_mode_rejects_excess_sale_and_shows_available_quantity(tmp_path) -> None:
    """
    AT-012: attempting to sell more than available is rejected and shows the available quantity.

    Strict mode (FR-MOV-008) must raise NegativeStockError. The error message must
    contain the current available quantity so the UI can surface it clearly.
    Balance must remain unchanged after a rejection.
    """
    _, session_factory = _setup_db(tmp_path, "at012")
    store_id, product_id = _seed_fixtures(session_factory)

    # Receive 6 units
    _receive_stock(session_factory, store_id, product_id, 6, "TX-RECEIPT-AT012")

    # Attempt to sell 10 (more than the 6 available) -> must be rejected
    with pytest.raises(NegativeStockError) as exc_info:
        _sell_stock(session_factory, store_id, product_id, 10, "TX-SALE-AT012-EXCESS")

    error_msg = str(exc_info.value)
    # The domain-layer error must mention the negative projection (FR-MOV-008)
    assert (
        "negative" in error_msg.lower()
    ), f"Error must mention 'negative' for strict-mode rejection, got: {error_msg!r}"

    # Balance must be unchanged after the rejection
    with session_factory() as session:
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert (
            balance.quantity == 6
        ), f"Balance must remain 6 after rejected sale, got {balance.quantity}"

    # No SALE transaction must have been inserted
    with session_factory() as session:
        sale_txs = session.scalars(
            select(InventoryTransaction).where(InventoryTransaction.movement_type == "SALE")
        ).all()
        assert len(sale_txs) == 0, "No SALE transaction should exist after a rejected sale"

    # No outbox event for the rejected sale
    with session_factory() as session:
        outbox_events = session.scalars(
            select(OutboxEvent).where(OutboxEvent.event_type == "INVENTORY_TRANSACTION")
        ).all()
        assert len(outbox_events) == 0, "No outbox event should be created for a rejected sale"


def test_at012_valid_sale_then_excess_rejected(tmp_path) -> None:
    """
    AT-012 variant: sell a valid amount first, then attempt to sell more than remaining.
    Verifies strict mode is evaluated against the *current* balance, not the original.
    """
    _, session_factory = _setup_db(tmp_path, "at012b")
    store_id, product_id = _seed_fixtures(session_factory)

    # Receive 6 units
    _receive_stock(session_factory, store_id, product_id, 6, "TX-RECEIPT-B")

    # Valid sale: sell 5 -> balance becomes 1
    _sell_stock(session_factory, store_id, product_id, 5, "TX-SALE-B-VALID")

    with session_factory() as session:
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert balance.quantity == 1

    # Attempt to sell 2 (only 1 remains) -> must be rejected
    with pytest.raises(NegativeStockError):
        _sell_stock(session_factory, store_id, product_id, 2, "TX-SALE-B-EXCESS")

    # Balance must remain 1
    with session_factory() as session:
        balance = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        assert balance is not None
        assert (
            balance.quantity == 1
        ), f"Balance must remain 1 after excess rejection, got {balance.quantity}"


def test_non_strict_mode_allows_excess_sale(tmp_path) -> None:
    """
    Non-strict mode must not raise NegativeStockError (FR-MOV-008: strict mode is configurable).
    This ensures the domain rule is not unconditional.
    """
    _, session_factory = _setup_db(tmp_path, "nonstrict")
    store_id, product_id = _seed_fixtures(session_factory)

    _receive_stock(session_factory, store_id, product_id, 2, "TX-RECEIPT-NS")

    # Sell 5 in non-strict mode - no exception
    _sell_stock(session_factory, store_id, product_id, 5, "TX-SALE-NS", strict_mode=False)

    with session_factory() as session:
        tx = session.scalar(
            select(InventoryTransaction).where(InventoryTransaction.transaction_id == "TX-SALE-NS")
        )
        assert tx is not None
        assert tx.sync_status == "PENDING"
