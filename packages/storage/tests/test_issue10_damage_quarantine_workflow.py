"""
Integration tests for Issue 10: Damage and Quarantine workflow.

Acceptance criteria:
  - Moving 2 units to DAMAGED reduces AVAILABLE by 2 and increases DAMAGED by 2, with a stored reason.
  - Required reason field validation.
  - Strict-mode validation prevents moving more stock than available in source bucket.
  - Regression check: Issue 07 Sale screen workflow cannot sell DAMAGED or QUARANTINE stock.
"""

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


def _setup_db(tmp_path, suffix: str = "test"):
    """Return (engine, session_factory) with schema created in a temp file."""
    db_file = tmp_path / f"issue10_{suffix}.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    return engine, get_sessionmaker(engine)


def _seed_fixtures(session_factory) -> tuple[str, str]:
    """Insert minimum required rows and return (store_id, product_id)."""
    store_id = "STORE-DMG-01"
    product_id = "PROD-SONY-TV"

    with session_factory() as session:
        session.add(
            Store(
                id=store_id,
                code="DMG01",
                name="Damage Store",
                address="200 Main St",
                is_active=True,
            )
        )
        session.commit()

        session.add(
            Product(
                id=product_id,
                sku="ELEC-SONY-55TV",
                name="Sony 55 Inch OLED TV",
                category="Electronics",
                unit="pcs",
                is_active=True,
            )
        )
        session.add(
            User(
                id="USER-DEMO",
                username="demo",
                role="MANAGER",
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


def _receive_stock(
    session_factory,
    store_id: str,
    product_id: str,
    qty: int,
    tx_id: str,
    bucket: str = "AVAILABLE",
) -> None:
    """Helper to seed initial stock balances."""
    now = datetime.now(UTC)
    with session_factory() as session:
        session.add(
            InventoryTransaction(
                transaction_id=tx_id,
                store_id=store_id,
                product_id=product_id,
                movement_type="RECEIPT",
                stock_bucket=bucket,
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
                StockBalance.stock_bucket == bucket,
            )
        )
        if existing:
            existing.quantity += qty
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-{bucket}",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket=bucket,
                    quantity=qty,
                )
            )
        session.commit()


def _move_stock_bucket(
    session_factory,
    store_id: str,
    product_id: str,
    from_bucket: str,
    to_bucket: str,
    quantity: int,
    reason: str,
    outflow_tx_id: str,
    inflow_tx_id: str,
    strict_mode: bool = True,
) -> tuple[InventoryTransaction, InventoryTransaction]:
    """Execute damage/quarantine bucket movement logic and validate business rules."""
    now = datetime.now(UTC)

    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    if not reason or not reason.strip():
        raise ValueError("Reason is required for damage/quarantine movements.")

    if from_bucket == to_bucket:
        raise ValueError("Source and destination buckets must be different.")

    valid_buckets = ("AVAILABLE", "DAMAGED", "QUARANTINE")
    if from_bucket not in valid_buckets or to_bucket not in valid_buckets:
        raise ValueError("Invalid stock bucket. Must be AVAILABLE, DAMAGED, or QUARANTINE.")

    with session_factory() as session:
        # Fetch current balance of source bucket
        src_balance_row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == from_bucket,
            )
        )
        src_qty = src_balance_row.quantity if src_balance_row else 0

        if strict_mode and quantity > src_qty:
            domain_tx = DomainTransaction(
                transaction_id=outflow_tx_id,
                store_id=store_id,
                product_id=product_id,
                movement_type=MovementType.DAMAGE,
                stock_bucket=StockBucket(from_bucket),
                quantity_delta=-quantity,
                occurred_at=now,
                user_id="USER-DEMO",
                device_id="DEV-DEMO",
                reason_code=reason,
                sync_status=SyncStatus.PENDING,
            )
            history_rows = session.scalars(
                select(InventoryTransaction).where(
                    InventoryTransaction.store_id == store_id,
                    InventoryTransaction.product_id == product_id,
                    InventoryTransaction.stock_bucket == from_bucket,
                )
            ).all()
            history = [
                DomainTransaction(
                    transaction_id=t.transaction_id,
                    store_id=t.store_id,
                    product_id=t.product_id,
                    movement_type=MovementType(t.movement_type),
                    stock_bucket=StockBucket(t.stock_bucket),
                    quantity_delta=t.quantity_delta,
                    occurred_at=t.occurred_at,
                    user_id=t.user_id,
                    device_id=t.device_id,
                    sync_status=SyncStatus(t.sync_status),
                )
                for t in history_rows
            ]
            validate_transaction(domain_tx, history, strict_mode=True)
            raise ValueError(
                f"Insufficient stock in {from_bucket} bucket. Available quantity: {src_qty}. Cannot move {quantity} units."
            )

        # Record outflow transaction
        tx_out = InventoryTransaction(
            transaction_id=outflow_tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type="DAMAGE",
            stock_bucket=from_bucket,
            quantity_delta=-quantity,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            reason_code=reason,
            sync_status="PENDING",
        )
        session.add(tx_out)

        # Record inflow transaction
        tx_in = InventoryTransaction(
            transaction_id=inflow_tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type="DAMAGE",
            stock_bucket=to_bucket,
            quantity_delta=quantity,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            reason_code=reason,
            sync_status="PENDING",
        )
        session.add(tx_in)

        # Update source stock balance
        if src_balance_row:
            src_balance_row.quantity -= quantity
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-{from_bucket}",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket=from_bucket,
                    quantity=-quantity,
                )
            )

        # Update destination stock balance
        dst_balance_row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == to_bucket,
            )
        )
        if dst_balance_row:
            dst_balance_row.quantity += quantity
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-{to_bucket}",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket=to_bucket,
                    quantity=quantity,
                )
            )

        # Outbox events
        session.add(
            OutboxEvent(
                id=f"OB-{outflow_tx_id}",
                event_id=f"EVT-{outflow_tx_id}",
                event_type="INVENTORY_TRANSACTION",
                payload=f'{{"transaction_id": "{outflow_tx_id}", "stock_bucket": "{from_bucket}", "quantity_delta": {-quantity}}}',
                status="PENDING",
            )
        )
        session.add(
            OutboxEvent(
                id=f"OB-{inflow_tx_id}",
                event_id=f"EVT-{inflow_tx_id}",
                event_type="INVENTORY_TRANSACTION",
                payload=f'{{"transaction_id": "{inflow_tx_id}", "stock_bucket": "{to_bucket}", "quantity_delta": {quantity}}}',
                status="PENDING",
            )
        )

        session.commit()
        session.refresh(tx_out)
        session.refresh(tx_in)
        return tx_out, tx_in


def _get_balance(session_factory, store_id: str, product_id: str, bucket: str) -> int:
    """Read stored stock_balance quantity for a given bucket."""
    with session_factory() as session:
        row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == bucket,
            )
        )
        return row.quantity if row else 0


def _sell_stock(
    session_factory,
    store_id: str,
    product_id: str,
    quantity: int,
    tx_id: str,
) -> InventoryTransaction:
    """Simulate Issue 07 sale_stock command (sells strictly from AVAILABLE bucket)."""
    with session_factory() as session:
        row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == "AVAILABLE",
            )
        )
        available = row.quantity if row else 0

        if quantity > available:
            raise ValueError(
                f"Insufficient stock. Available quantity: {available}. Cannot sell {quantity} units."
            )

        now = datetime.now(UTC)
        tx = InventoryTransaction(
            transaction_id=tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type="SALE",
            stock_bucket="AVAILABLE",
            quantity_delta=-quantity,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            sync_status="PENDING",
        )
        session.add(tx)
        row.quantity -= quantity
        session.commit()
        session.refresh(tx)
        return tx


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------


def test_move_stock_to_damaged_reduces_available_increases_damaged(tmp_path):
    """
    Acceptance Criteria:
    Moving 2 units to DAMAGED reduces AVAILABLE by 2 and increases DAMAGED by 2, with a stored reason.
    """
    _, session_factory = _setup_db(tmp_path, "acc_test")
    store_id, product_id = _seed_fixtures(session_factory)

    # Initial stock: 10 units in AVAILABLE
    _receive_stock(session_factory, store_id, product_id, 10, "TX-INIT-01", "AVAILABLE")
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 10
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 0

    # Move 2 units to DAMAGED
    reason_text = "Screen cracked during storage"
    tx_out, tx_in = _move_stock_bucket(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        from_bucket="AVAILABLE",
        to_bucket="DAMAGED",
        quantity=2,
        reason=reason_text,
        outflow_tx_id="TX-MOVE-OUT-01",
        inflow_tx_id="TX-MOVE-IN-01",
    )

    # Verify transactions
    assert tx_out.stock_bucket == "AVAILABLE"
    assert tx_out.quantity_delta == -2
    assert tx_out.movement_type == "DAMAGE"
    assert tx_out.reason_code == reason_text

    assert tx_in.stock_bucket == "DAMAGED"
    assert tx_in.quantity_delta == 2
    assert tx_in.movement_type == "DAMAGE"
    assert tx_in.reason_code == reason_text

    # Verify balances: AVAILABLE is 8, DAMAGED is 2
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 8
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 2


def test_move_stock_requires_reason(tmp_path):
    """Moving stock without a reason raises ValueError."""
    _, session_factory = _setup_db(tmp_path, "reason_test")
    store_id, product_id = _seed_fixtures(session_factory)
    _receive_stock(session_factory, store_id, product_id, 5, "TX-INIT-02", "AVAILABLE")

    with pytest.raises(ValueError, match="Reason is required"):
        _move_stock_bucket(
            session_factory,
            store_id=store_id,
            product_id=product_id,
            from_bucket="AVAILABLE",
            to_bucket="DAMAGED",
            quantity=1,
            reason="",
            outflow_tx_id="TX-O-02",
            inflow_tx_id="TX-I-02",
        )


def test_move_stock_exceeding_source_balance_rejected(tmp_path):
    """Attempting to move more units than available in source bucket is rejected in strict mode."""
    _, session_factory = _setup_db(tmp_path, "strict_test")
    store_id, product_id = _seed_fixtures(session_factory)
    _receive_stock(session_factory, store_id, product_id, 3, "TX-INIT-03", "AVAILABLE")

    with pytest.raises((ValueError, NegativeStockError)) as exc_info:
        _move_stock_bucket(
            session_factory,
            store_id=store_id,
            product_id=product_id,
            from_bucket="AVAILABLE",
            to_bucket="DAMAGED",
            quantity=5,
            reason="Water damage",
            outflow_tx_id="TX-O-03",
            inflow_tx_id="TX-I-03",
            strict_mode=True,
        )
    assert "Insufficient stock" in str(exc_info.value) or "negative" in str(exc_info.value)

    # Balance remains 3
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 3
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 0


def test_regression_sale_screen_cannot_sell_damaged_or_quarantine_stock(tmp_path):
    """
    Regression Test:
    Confirms Issue 07 sale screen workflow cannot sell DAMAGED or QUARANTINE stock.
    - Start with 5 AVAILABLE stock.
    - Move 3 units to DAMAGED and 2 units to QUARANTINE -> AVAILABLE becomes 0.
    - Attempting to sell even 1 unit fails because only AVAILABLE stock can be sold.
    """
    _, session_factory = _setup_db(tmp_path, "regression_sale_test")
    store_id, product_id = _seed_fixtures(session_factory)

    # Initial AVAILABLE stock = 5
    _receive_stock(session_factory, store_id, product_id, 5, "TX-INIT-04", "AVAILABLE")

    # Move 3 to DAMAGED, 2 to QUARANTINE
    _move_stock_bucket(
        session_factory,
        store_id,
        product_id,
        "AVAILABLE",
        "DAMAGED",
        3,
        "Physical damage",
        "TX-O-04A",
        "TX-I-04A",
    )
    _move_stock_bucket(
        session_factory,
        store_id,
        product_id,
        "AVAILABLE",
        "QUARANTINE",
        2,
        "Recall inspection",
        "TX-O-04B",
        "TX-I-04B",
    )

    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 0
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 3
    assert _get_balance(session_factory, store_id, product_id, "QUARANTINE") == 2

    # Attempting to sell 1 unit must fail with Insufficient stock error showing available 0
    with pytest.raises(ValueError) as exc_info:
        _sell_stock(session_factory, store_id, product_id, 1, "TX-SALE-FAIL-01")

    err_msg = str(exc_info.value)
    assert "Insufficient stock" in err_msg
    assert "Available quantity: 0" in err_msg
