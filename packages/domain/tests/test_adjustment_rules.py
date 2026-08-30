"""
Domain unit tests for physical count adjustment rules (FR-MOV-006, Section 13.4, AT-008).

Acceptance criteria (AT-008):
    System quantity = 18, physical count = 17
    → Approved reconciliation creates ADJUSTMENT −1 with reason, user, and audit trail.
"""

from datetime import UTC, datetime

import pytest

from domain import (
    InventoryTransaction,
    MissingAdjustmentReasonError,
    MovementType,
    StockBucket,
    create_adjustment_transaction,
    project_balance,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STORE_ID = "STORE-001"
PRODUCT_ID = "PROD-TV-55"
USER_ID = "manager@store.local"
DEVICE_ID = "tablet-001"
FIXED_TS = datetime(2026, 8, 30, 14, 0, 0, tzinfo=UTC)


def _make_receipt(qty: int) -> InventoryTransaction:
    """Return a RECEIPT event establishing initial stock."""
    return InventoryTransaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        movement_type=MovementType.RECEIPT,
        quantity_delta=qty,
        occurred_at=FIXED_TS,
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )


# ---------------------------------------------------------------------------
# AT-008: core acceptance test
# ---------------------------------------------------------------------------


def test_at008_system_18_counted_17_creates_adjustment_minus_1() -> None:
    """
    AT-008: system quantity 18, physical count 17
    → approved reconciliation creates ADJUSTMENT −1 with reason, user, and audit trail.
    """
    # Establish a ledger history that projects to system_quantity = 18
    history = [_make_receipt(18)]
    system_qty = project_balance(history, store_id=STORE_ID, product_id=PRODUCT_ID)
    assert system_qty == 18  # pre-condition: system qty is 18

    counted_qty = 17
    reason = "Cycle count: one unit missing — shelf damage suspected"

    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=system_qty,
        counted_quantity=counted_qty,
        reason=reason,
        user_id=USER_ID,
        device_id=DEVICE_ID,
        occurred_at=FIXED_TS,
    )

    # Core assertion: delta must be −1
    assert adj.quantity_delta == -1

    # Movement type must be ADJUSTMENT (FR-MOV-006)
    assert adj.movement_type == MovementType.ADJUSTMENT

    # Audit trail: reason, user, store, product
    assert adj.reason_code == reason
    assert adj.user_id == USER_ID
    assert adj.device_id == DEVICE_ID
    assert adj.store_id == STORE_ID
    assert adj.product_id == PRODUCT_ID

    # Stock bucket is AVAILABLE
    assert adj.stock_bucket == StockBucket.AVAILABLE

    # A unique transaction_id is auto-generated (not empty)
    assert adj.transaction_id != ""

    # reference_number is populated
    assert adj.reference_number is not None

    # Post-reconciliation projection reflects corrected quantity
    post_balance = project_balance(
        history + [adj],
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
    )
    assert post_balance == 17


# ---------------------------------------------------------------------------
# Zero variance — no-op adjustment
# ---------------------------------------------------------------------------


def test_zero_variance_creates_zero_delta_adjustment() -> None:
    """When system qty equals counted qty the delta is 0 — still a valid record."""
    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=10,
        counted_quantity=10,
        reason="Routine count — no discrepancy found",
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )
    assert adj.quantity_delta == 0
    assert adj.movement_type == MovementType.ADJUSTMENT


# ---------------------------------------------------------------------------
# Positive variance (overage)
# ---------------------------------------------------------------------------


def test_positive_variance_creates_positive_delta() -> None:
    """Physical count higher than system qty → positive ADJUSTMENT (unrecorded receipt)."""
    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=5,
        counted_quantity=8,
        reason="Three extra units found in back storeroom",
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )
    assert adj.quantity_delta == 3


# ---------------------------------------------------------------------------
# Missing reason — raises MissingAdjustmentReasonError
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_reason", ["", "   ", "\t"])
def test_blank_reason_raises(bad_reason: str) -> None:
    """Adjustment without a reason must be rejected (FR-MOV-006)."""
    with pytest.raises(MissingAdjustmentReasonError, match="reason is required"):
        create_adjustment_transaction(
            store_id=STORE_ID,
            product_id=PRODUCT_ID,
            system_quantity=18,
            counted_quantity=17,
            reason=bad_reason,
            user_id=USER_ID,
            device_id=DEVICE_ID,
        )


# ---------------------------------------------------------------------------
# Custom count_reference is honoured
# ---------------------------------------------------------------------------


def test_custom_count_reference_used() -> None:
    """Caller-supplied count_reference appears as reference_number on the transaction."""
    ref = "COUNT-2026-08-30-STORE001"
    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=18,
        counted_quantity=17,
        reason="Monthly cycle count",
        user_id=USER_ID,
        device_id=DEVICE_ID,
        count_reference=ref,
    )
    assert adj.reference_number == ref


# ---------------------------------------------------------------------------
# Default reference_number is auto-generated when not supplied
# ---------------------------------------------------------------------------


def test_default_reference_number_auto_generated() -> None:
    """Without count_reference, a sensible default reference is set."""
    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=18,
        counted_quantity=17,
        reason="Missing unit",
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )
    assert adj.reference_number is not None
    assert STORE_ID in adj.reference_number
    assert PRODUCT_ID in adj.reference_number


# ---------------------------------------------------------------------------
# Occurred_at propagation
# ---------------------------------------------------------------------------


def test_occurred_at_propagated() -> None:
    """occurred_at passed by caller is preserved on the transaction."""
    ts = datetime(2026, 1, 15, 9, 30, 0, tzinfo=UTC)
    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=20,
        counted_quantity=19,
        reason="Physical count Jan 15",
        user_id=USER_ID,
        device_id=DEVICE_ID,
        occurred_at=ts,
    )
    assert adj.occurred_at == ts


# ---------------------------------------------------------------------------
# project_balance correctly incorporates ADJUSTMENT after other events
# ---------------------------------------------------------------------------


def test_ledger_projection_after_multiple_events() -> None:
    """
    Verify that project_balance correctly derives system quantity
    from a mixed-event history, matching what the count screen would display.
    """
    now = datetime.now(UTC)
    events: list[InventoryTransaction] = [
        InventoryTransaction(
            store_id=STORE_ID,
            product_id=PRODUCT_ID,
            movement_type=MovementType.RECEIPT,
            quantity_delta=20,
            occurred_at=now,
            user_id=USER_ID,
            device_id=DEVICE_ID,
        ),
        InventoryTransaction(
            store_id=STORE_ID,
            product_id=PRODUCT_ID,
            movement_type=MovementType.SALE,
            quantity_delta=-2,
            occurred_at=now,
            user_id=USER_ID,
            device_id=DEVICE_ID,
        ),
    ]
    # System qty = 20 - 2 = 18
    system_qty = project_balance(events, store_id=STORE_ID, product_id=PRODUCT_ID)
    assert system_qty == 18

    adj = create_adjustment_transaction(
        store_id=STORE_ID,
        product_id=PRODUCT_ID,
        system_quantity=system_qty,
        counted_quantity=17,
        reason="AT-008 reproduction",
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )
    assert adj.quantity_delta == -1

    final_qty = project_balance(events + [adj], store_id=STORE_ID, product_id=PRODUCT_ID)
    assert final_qty == 17
