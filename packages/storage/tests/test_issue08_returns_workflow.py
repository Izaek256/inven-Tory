"""
Integration tests for Issue 08: Customer and Supplier Returns workflow.

Acceptance criteria:
  - A customer return marked "damaged" increases the DAMAGED bucket, not AVAILABLE.
  - A customer return marked "available" increases the AVAILABLE bucket.
  - A customer return marked "quarantine" increases the QUARANTINE bucket.
  - A supplier return decreases AVAILABLE (or the selected bucket) correctly.
  - A supplier return exceeding bucket balance is rejected in strict mode.
  - Original transaction reference number is preserved on return transactions.
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
    db_file = tmp_path / f"issue08_{suffix}.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    return engine, get_sessionmaker(engine)


def _seed_fixtures(session_factory) -> tuple[str, str]:
    """Insert minimum required rows and return (store_id, product_id)."""
    store_id = "STORE-RET-01"
    product_id = "PROD-LG-WASHER"

    with session_factory() as session:
        session.add(
            Store(
                id=store_id,
                code="RET01",
                name="Returns Store",
                address="100 Main St",
                is_active=True,
            )
        )
        session.commit()

        session.add(
            Product(
                id=product_id,
                sku="ELEC-LG-WASHER-10KG",
                name="LG 10kg Washing Machine",
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


def _process_return(
    session_factory,
    store_id: str,
    product_id: str,
    return_type: str,  # "CUSTOMER" or "SUPPLIER"
    stock_bucket: str,  # "AVAILABLE", "DAMAGED", "QUARANTINE"
    quantity: int,
    tx_id: str,
    reference_number: str | None = None,
    reason: str | None = None,
    strict_mode: bool = True,
) -> InventoryTransaction:
    """Simulate return_stock command logic and validate business rules."""
    now = datetime.now(UTC)

    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    if return_type not in ("CUSTOMER", "SUPPLIER"):
        raise ValueError("Return type must be CUSTOMER or SUPPLIER.")

    with session_factory() as session:
        current_balance_row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == stock_bucket,
            )
        )
        current_qty = current_balance_row.quantity if current_balance_row else 0

        quantity_delta = quantity if return_type == "CUSTOMER" else -quantity

        # For domain ledger validation (FR-MOV-008 invariant):
        domain_tx = DomainTransaction(
            transaction_id=tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type=MovementType.RETURN,
            stock_bucket=StockBucket(stock_bucket),
            quantity_delta=quantity_delta,
            occurred_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            reference_number=reference_number,
            reason_code=reason,
            sync_status=SyncStatus.PENDING,
        )

        all_txs_rows = session.scalars(
            select(InventoryTransaction).where(
                InventoryTransaction.store_id == store_id,
                InventoryTransaction.product_id == product_id,
                InventoryTransaction.stock_bucket == stock_bucket,
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
            for t in all_txs_rows
        ]

        if strict_mode and return_type == "SUPPLIER" and quantity > current_qty:
            # Enforce strict mode validation
            validate_transaction(domain_tx, history, strict_mode=True)
            raise ValueError(
                f"Insufficient stock in {stock_bucket} bucket. Available quantity: {current_qty}. "
                f"Cannot return {quantity} units to supplier."
            )

        validate_transaction(domain_tx, history, strict_mode=strict_mode)

        # Record transaction
        tx = InventoryTransaction(
            transaction_id=tx_id,
            store_id=store_id,
            product_id=product_id,
            movement_type="RETURN",
            stock_bucket=stock_bucket,
            quantity_delta=quantity_delta,
            occurred_at=now,
            recorded_at=now,
            user_id="USER-DEMO",
            device_id="DEV-DEMO",
            reference_number=reference_number,
            reason_code=reason,
            sync_status="PENDING",
        )
        session.add(tx)

        # Update balance
        if current_balance_row:
            current_balance_row.quantity += quantity_delta
        else:
            session.add(
                StockBalance(
                    id=f"SB-{store_id}-{product_id}-{stock_bucket}",
                    store_id=store_id,
                    product_id=product_id,
                    stock_bucket=stock_bucket,
                    quantity=quantity_delta,
                )
            )

        # Outbox event
        outbox_payload = {
            "transaction_id": tx_id,
            "store_id": store_id,
            "product_id": product_id,
            "movement_type": "RETURN",
            "stock_bucket": stock_bucket,
            "quantity_delta": quantity_delta,
            "reference_number": reference_number,
        }
        session.add(
            OutboxEvent(
                id=f"OB-{tx_id}",
                event_id=f"EVT-{tx_id}",
                event_type="INVENTORY_TRANSACTION",
                payload=json.dumps(outbox_payload),
                status="PENDING",
                retry_count=0,
                created_at=now,
            )
        )

        session.commit()
        session.refresh(tx)
        return tx


def _get_balance(session_factory, store_id: str, product_id: str, bucket: str) -> int:
    with session_factory() as session:
        row = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == store_id,
                StockBalance.product_id == product_id,
                StockBalance.stock_bucket == bucket,
            )
        )
        return row.quantity if row else 0


# ---------------------------------------------------------------------------
# Integration Tests
# ---------------------------------------------------------------------------


def test_customer_return_damaged_increases_damaged_bucket(tmp_path):
    """
    Acceptance Criteria:
    A customer return marked 'damaged' increases the DAMAGED bucket, not AVAILABLE.
    """
    _, session_factory = _setup_db(tmp_path, "damaged")
    store_id, product_id = _seed_fixtures(session_factory)

    # Seed 5 available units initially
    _receive_stock(session_factory, store_id, product_id, 5, "TX-INIT-01", "AVAILABLE")
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 5
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 0

    # Customer returns 2 damaged units
    tx = _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="CUSTOMER",
        stock_bucket="DAMAGED",
        quantity=2,
        tx_id="TX-RET-DAMAGED-01",
        reference_number="REF-SALE-1001",
        reason="Cracked front door panel",
    )

    assert tx.movement_type == "RETURN"
    assert tx.stock_bucket == "DAMAGED"
    assert tx.quantity_delta == 2

    # Verify DAMAGED bucket increased by 2, AVAILABLE bucket remains 5
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 2
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 5


def test_customer_return_available_increases_available_bucket(tmp_path):
    """Customer return marked AVAILABLE increases AVAILABLE bucket."""
    _, session_factory = _setup_db(tmp_path, "avail")
    store_id, product_id = _seed_fixtures(session_factory)

    _receive_stock(session_factory, store_id, product_id, 5, "TX-INIT-02", "AVAILABLE")

    _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="CUSTOMER",
        stock_bucket="AVAILABLE",
        quantity=1,
        tx_id="TX-RET-AVAIL-01",
    )

    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 6


def test_customer_return_quarantine_increases_quarantine_bucket(tmp_path):
    """Customer return marked QUARANTINE increases QUARANTINE bucket."""
    _, session_factory = _setup_db(tmp_path, "quarantine")
    store_id, product_id = _seed_fixtures(session_factory)

    _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="CUSTOMER",
        stock_bucket="QUARANTINE",
        quantity=3,
        tx_id="TX-RET-QUAR-01",
        reason="Recall inspection",
    )

    assert _get_balance(session_factory, store_id, product_id, "QUARANTINE") == 3
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 0


def test_supplier_return_decreases_selected_bucket(tmp_path):
    """
    Acceptance Criteria:
    A supplier return decreases AVAILABLE (or the selected bucket) correctly.
    """
    _, session_factory = _setup_db(tmp_path, "supplier")
    store_id, product_id = _seed_fixtures(session_factory)

    _receive_stock(session_factory, store_id, product_id, 10, "TX-INIT-03", "AVAILABLE")
    _receive_stock(session_factory, store_id, product_id, 4, "TX-INIT-04", "DAMAGED")

    # Supplier return 3 units from AVAILABLE
    tx1 = _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="SUPPLIER",
        stock_bucket="AVAILABLE",
        quantity=3,
        tx_id="TX-SUP-RET-01",
        reference_number="PO-9001",
    )
    assert tx1.quantity_delta == -3
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 7

    # Supplier return 2 units from DAMAGED
    tx2 = _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="SUPPLIER",
        stock_bucket="DAMAGED",
        quantity=2,
        tx_id="TX-SUP-RET-02",
        reference_number="RMA-5512",
    )
    assert tx2.quantity_delta == -2
    assert _get_balance(session_factory, store_id, product_id, "DAMAGED") == 2


def test_supplier_return_exceeding_bucket_stock_rejected(tmp_path):
    """Attempting to return more stock to supplier than available in bucket is rejected."""
    _, session_factory = _setup_db(tmp_path, "reject")
    store_id, product_id = _seed_fixtures(session_factory)

    _receive_stock(session_factory, store_id, product_id, 3, "TX-INIT-05", "AVAILABLE")

    with pytest.raises((NegativeStockError, ValueError)) as excinfo:
        _process_return(
            session_factory,
            store_id=store_id,
            product_id=product_id,
            return_type="SUPPLIER",
            stock_bucket="AVAILABLE",
            quantity=5,
            tx_id="TX-SUP-RET-EXCESS",
        )

    assert "Insufficient stock" in str(excinfo.value) or "negative" in str(excinfo.value)
    # Balance remains 3
    assert _get_balance(session_factory, store_id, product_id, "AVAILABLE") == 3


def test_return_preserves_original_reference_number(tmp_path):
    """Preserves original reference number when return is linked to a prior transaction."""
    _, session_factory = _setup_db(tmp_path, "ref")
    store_id, product_id = _seed_fixtures(session_factory)

    orig_ref = "TX-SALE-2026-0830-001"
    tx = _process_return(
        session_factory,
        store_id=store_id,
        product_id=product_id,
        return_type="CUSTOMER",
        stock_bucket="AVAILABLE",
        quantity=1,
        tx_id="TX-RET-REF-01",
        reference_number=orig_ref,
    )

    assert tx.reference_number == orig_ref

    # Query outbox event to confirm reference_number is passed in payload
    with session_factory() as session:
        outbox = session.scalar(select(OutboxEvent).where(OutboxEvent.id == "OB-TX-RET-REF-01"))
        assert outbox is not None
        payload_data = json.loads(outbox.payload)
        assert payload_data["reference_number"] == orig_ref
