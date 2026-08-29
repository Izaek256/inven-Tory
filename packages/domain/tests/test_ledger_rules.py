"""
Unit tests for domain ledger rules, balance projections, and reversal logic.
"""

from datetime import UTC, datetime, timedelta

import pytest

from domain import (
    InventoryTransaction,
    MovementType,
    NegativeStockError,
    StockBucket,
    SyncStatus,
    create_reversal,
    project_balance,
    project_balances_by_store,
    project_global_balance,
    validate_transaction,
)


def test_project_balance_basic() -> None:
    now = datetime.now(UTC)
    events = [
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=50,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="samsung-55",
            movement_type=MovementType.RECEIPT,
            quantity_delta=30,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-10,
            stock_bucket=StockBucket.AVAILABLE,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.DAMAGE,
            quantity_delta=5,
            stock_bucket=StockBucket.DAMAGED,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
    ]

    # Filtering by store_id and product_id
    assert project_balance(events, store_id="store-a", product_id="hisense-120l") == 45
    assert project_balance(events, store_id="store-a", product_id="samsung-55") == 30
    assert project_balance(events, store_id="store-b") == 0

    # Filtering by stock_bucket
    assert (
        project_balance(
            events,
            store_id="store-a",
            product_id="hisense-120l",
            stock_bucket=StockBucket.AVAILABLE,
        )
        == 40
    )
    assert (
        project_balance(
            events,
            store_id="store-a",
            product_id="hisense-120l",
            stock_bucket=StockBucket.DAMAGED,
        )
        == 5
    )


def test_project_balance_filters_rejected_events() -> None:
    now = datetime.now(UTC)
    events = [
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=50,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
            sync_status=SyncStatus.ACCEPTED,
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-20,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
            sync_status=SyncStatus.REJECTED,
        ),
    ]

    # REJECTED event (-20) should be ignored
    assert project_balance(events) == 50


def test_project_balances_by_store_and_global_filters() -> None:
    now = datetime.now(UTC)
    events = [
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=100,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
            sync_status=SyncStatus.ACCEPTED,
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="other-product",
            movement_type=MovementType.RECEIPT,
            quantity_delta=50,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
        InventoryTransaction(
            store_id="store-b",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=200,
            stock_bucket=StockBucket.QUARANTINE,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-10,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
            sync_status=SyncStatus.REJECTED,
        ),
    ]

    by_store = project_balances_by_store(
        events, product_id="hisense-120l", stock_bucket=StockBucket.AVAILABLE
    )
    assert by_store == {"store-a": 100}

    global_bal = project_global_balance(
        events, product_id="hisense-120l", stock_bucket=StockBucket.QUARANTINE
    )
    assert global_bal == 200


def test_strict_mode_negative_stock_rejection() -> None:
    now = datetime.now(UTC)
    history = [
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=10,
            occurred_at=now,
            user_id="u1",
            device_id="d1",
        )
    ]

    valid_sale = InventoryTransaction(
        store_id="store-a",
        product_id="hisense-120l",
        movement_type=MovementType.SALE,
        quantity_delta=-10,
        occurred_at=now,
        user_id="u1",
        device_id="d1",
    )

    excess_sale = InventoryTransaction(
        store_id="store-a",
        product_id="hisense-120l",
        movement_type=MovementType.SALE,
        quantity_delta=-15,
        occurred_at=now,
        user_id="u1",
        device_id="d1",
    )

    # Valid sale keeps balance at 0 -> no error
    validate_transaction(valid_sale, history, strict_mode=True)

    # Excess sale drives balance negative -> NegativeStockError
    with pytest.raises(NegativeStockError, match="would drive stock negative"):
        validate_transaction(excess_sale, history, strict_mode=True)

    # In non-strict mode, no exception is raised
    validate_transaction(excess_sale, history, strict_mode=False)


def test_reversal_model() -> None:
    now = datetime.now(UTC)
    original_tx = InventoryTransaction(
        store_id="store-a",
        product_id="hisense-120l",
        movement_type=MovementType.SALE,
        quantity_delta=-5,
        occurred_at=now,
        user_id="u1",
        device_id="d1",
        reference_number="REC-1001",
    )

    # Test reversal with custom user_id, device_id
    reversal_tx = create_reversal(
        original_tx,
        reason="Customer returned duplicate entry",
        user_id="u2",
        device_id="d2",
    )

    # Original transaction MUST be unchanged
    assert original_tx.quantity_delta == -5
    assert original_tx.original_transaction_id is None

    # Reversal transaction invariants
    assert reversal_tx.original_transaction_id == original_tx.transaction_id
    assert reversal_tx.quantity_delta == 5
    assert reversal_tx.store_id == "store-a"
    assert reversal_tx.product_id == "hisense-120l"
    assert reversal_tx.user_id == "u2"
    assert reversal_tx.device_id == "d2"
    assert reversal_tx.reason_code == "REVERSAL: Customer returned duplicate entry"

    # Test reversal with default user_id and device_id fallback
    reversal_default = create_reversal(
        original_tx,
        reason="Correction without user override",
    )
    assert reversal_default.user_id == "u1"
    assert reversal_default.device_id == "d1"

    # Ledger history with reversal projects net zero effect for the sale
    history = [original_tx, reversal_tx]
    assert project_balance(history) == 0


def test_section_9_1_hisense_120l_4_stores_scenario() -> None:
    """
    Reproduces SRS Section 9.1 scenario:
    Hisense 120L refrigerator across 4 stores with per-store and global documented totals:
      Store A: 2,100 pcs
      Store B: 2,800 pcs
      Store C: 1,921 pcs
      Store D: 2,100 pcs
      Global total: 8,921 pcs
    """
    now = datetime.now(UTC)
    events = [
        # Store A: 2,000 + 150 - 50 = 2,100
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=2000,
            occurred_at=now,
            user_id="mgr-a",
            device_id="dev-a1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=150,
            occurred_at=now,
            user_id="mgr-a",
            device_id="dev-a1",
        ),
        InventoryTransaction(
            store_id="store-a",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-50,
            occurred_at=now,
            user_id="clerk-a",
            device_id="dev-a2",
        ),
        # Store B: 3,000 - 200 = 2,800
        InventoryTransaction(
            store_id="store-b",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=3000,
            occurred_at=now,
            user_id="mgr-b",
            device_id="dev-b1",
        ),
        InventoryTransaction(
            store_id="store-b",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-200,
            occurred_at=now,
            user_id="clerk-b",
            device_id="dev-b1",
        ),
        # Store C: 2,000 - 79 = 1,921
        InventoryTransaction(
            store_id="store-c",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=2000,
            occurred_at=now,
            user_id="mgr-c",
            device_id="dev-c1",
        ),
        InventoryTransaction(
            store_id="store-c",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-79,
            occurred_at=now,
            user_id="clerk-c",
            device_id="dev-c1",
        ),
        # Store D: 2,200 - 100 = 2,100
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=2200,
            occurred_at=now,
            user_id="mgr-d",
            device_id="dev-d1",
        ),
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-100,
            occurred_at=now,
            user_id="clerk-d",
            device_id="dev-d1",
        ),
    ]

    per_store = project_balances_by_store(events, product_id="hisense-120l")
    assert per_store == {
        "store-a": 2100,
        "store-b": 2800,
        "store-c": 1921,
        "store-d": 2100,
    }

    global_total = project_global_balance(events, product_id="hisense-120l")
    assert global_total == 8921


def test_section_10_4_four_day_offline_scenario() -> None:
    """
    Reproduces SRS Section 10.4 scenario:
    Store D operates offline for 4 days committing transactions to local outbox (SyncStatus.PENDING).
    - Day 1: Local receipt +500
    - Day 2: Sales -120
    - Day 3: Customer return +20, Damage transfer -10 to DAMAGED bucket
    - Day 4: Physical count reconciliation adjustment -10
    Local projection shows correct balance (2,100 starting + 500 - 120 + 20 - 10 - 10 = 2,480).
    When sync completes (status -> ACCEPTED), central ledger projection matches local projection.
    """
    day1 = datetime.now(UTC) - timedelta(days=4)
    day2 = datetime.now(UTC) - timedelta(days=3)
    day3 = datetime.now(UTC) - timedelta(days=2)
    day4 = datetime.now(UTC) - timedelta(days=1)

    initial_tx = InventoryTransaction(
        store_id="store-d",
        product_id="hisense-120l",
        movement_type=MovementType.RECEIPT,
        quantity_delta=2100,
        occurred_at=day1 - timedelta(hours=1),
        user_id="mgr-d",
        device_id="dev-d1",
        sync_status=SyncStatus.ACCEPTED,
    )

    offline_events = [
        # Day 1: Receipt +500
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.RECEIPT,
            quantity_delta=500,
            occurred_at=day1,
            user_id="clerk-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
        # Day 2: Sales -120
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.SALE,
            quantity_delta=-120,
            occurred_at=day2,
            user_id="clerk-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
        # Day 3: Customer Return +20
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.RETURN,
            quantity_delta=20,
            occurred_at=day3,
            user_id="clerk-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
        # Day 3: Damage movement (-10 from AVAILABLE, +10 in DAMAGED)
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.DAMAGE,
            quantity_delta=-10,
            stock_bucket=StockBucket.AVAILABLE,
            occurred_at=day3,
            user_id="clerk-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.DAMAGE,
            quantity_delta=10,
            stock_bucket=StockBucket.DAMAGED,
            occurred_at=day3,
            user_id="clerk-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
        # Day 4: Physical count reconciliation adjustment -10
        InventoryTransaction(
            store_id="store-d",
            product_id="hisense-120l",
            movement_type=MovementType.ADJUSTMENT,
            quantity_delta=-10,
            occurred_at=day4,
            user_id="mgr-d",
            device_id="dev-d1",
            sync_status=SyncStatus.PENDING,
        ),
    ]

    all_local_events = [initial_tx] + offline_events

    # Local AVAILABLE bucket balance during offline period
    local_available = project_balance(
        all_local_events,
        store_id="store-d",
        product_id="hisense-120l",
        stock_bucket=StockBucket.AVAILABLE,
    )
    assert local_available == 2100 + 500 - 120 + 20 - 10 - 10  # 2480

    # Local DAMAGED bucket balance
    local_damaged = project_balance(
        all_local_events,
        store_id="store-d",
        product_id="hisense-120l",
        stock_bucket=StockBucket.DAMAGED,
    )
    assert local_damaged == 10
