"""
Unit tests for multi-store transfer domain entities and state machine rules (Section 11, AT-005).
"""

import pytest

from domain.entities import Transfer, TransferStatus
from domain.rules import (
    InvalidTransferStateTransitionError,
    create_cancel_compensation_transaction,
    create_dispatch_transaction,
    create_receive_transaction,
    validate_transfer_deltas,
    validate_transfer_transition,
)


def test_transfer_entity_validation() -> None:
    """Test Transfer entity initialization and invariant validation."""
    transfer = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-100",
        quantity=5,
        created_by_user_id="USER-01",
    )
    assert transfer.source_store_id == "STORE-A"
    assert transfer.destination_store_id == "STORE-B"
    assert transfer.quantity == 5
    assert transfer.status == TransferStatus.DRAFT
    assert transfer.id.startswith("TRF-")

    # Quantity must be > 0
    with pytest.raises(ValueError, match="greater than zero"):
        Transfer(
            source_store_id="STORE-A",
            destination_store_id="STORE-B",
            product_id="PROD-100",
            quantity=0,
            created_by_user_id="USER-01",
        )

    # Source and destination must be different
    with pytest.raises(ValueError, match="must be different"):
        Transfer(
            source_store_id="STORE-A",
            destination_store_id="STORE-A",
            product_id="PROD-100",
            quantity=5,
            created_by_user_id="USER-01",
        )


def test_transfer_state_machine_valid_transitions() -> None:
    """Test allowed state transitions in the transfer state machine."""
    # DRAFT -> DISPATCHED -> RECEIVED (happy path)
    validate_transfer_transition(TransferStatus.DRAFT, TransferStatus.DISPATCHED)
    validate_transfer_transition(TransferStatus.DISPATCHED, TransferStatus.RECEIVED)

    # DRAFT -> CANCELLED
    validate_transfer_transition(TransferStatus.DRAFT, TransferStatus.CANCELLED)

    # DISPATCHED -> EXCEPTION -> RECEIVED
    validate_transfer_transition(TransferStatus.DISPATCHED, TransferStatus.EXCEPTION)
    validate_transfer_transition(TransferStatus.EXCEPTION, TransferStatus.RECEIVED)

    # DISPATCHED / EXCEPTION -> CANCELLED
    validate_transfer_transition(TransferStatus.DISPATCHED, TransferStatus.CANCELLED)
    validate_transfer_transition(TransferStatus.EXCEPTION, TransferStatus.CANCELLED)


def test_transfer_state_machine_invalid_transitions() -> None:
    """Test that invalid state transitions raise InvalidTransferStateTransitionError."""
    # DRAFT -> RECEIVED directly without DISPATCHED
    with pytest.raises(InvalidTransferStateTransitionError):
        validate_transfer_transition(TransferStatus.DRAFT, TransferStatus.RECEIVED)

    # Terminal state RECEIVED cannot transition to anything
    with pytest.raises(InvalidTransferStateTransitionError):
        validate_transfer_transition(TransferStatus.RECEIVED, TransferStatus.DISPATCHED)

    # Terminal state CANCELLED cannot transition to anything
    with pytest.raises(InvalidTransferStateTransitionError):
        validate_transfer_transition(TransferStatus.CANCELLED, TransferStatus.DRAFT)


def test_at_005_equal_and_opposite_deltas() -> None:
    """
    AT-005: transferring 5 units A->B results in A -5, B +5, both transactions sharing one transfer_id.
    """
    transfer = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-ELEC-01",
        quantity=5,
        created_by_user_id="USER-01",
    )

    dispatch_tx = create_dispatch_transaction(transfer, user_id="USER-01", device_id="DEV-01")
    receive_tx = create_receive_transaction(transfer, user_id="USER-02", device_id="DEV-02")

    assert dispatch_tx.store_id == "STORE-A"
    assert dispatch_tx.quantity_delta == -5
    assert dispatch_tx.transfer_id == transfer.id

    assert receive_tx.store_id == "STORE-B"
    assert receive_tx.quantity_delta == 5
    assert receive_tx.transfer_id == transfer.id

    # Verify equal and opposite delta invariant
    validate_transfer_deltas(dispatch_tx, receive_tx)


def test_validate_transfer_deltas_rejection() -> None:
    """Test validation failure when transactions do not match equal and opposite criteria."""
    transfer1 = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-1",
        quantity=5,
        created_by_user_id="USER-1",
    )
    transfer2 = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-1",
        quantity=5,
        created_by_user_id="USER-1",
    )

    dispatch_tx = create_dispatch_transaction(transfer1, user_id="U1", device_id="D1")
    receive_tx = create_receive_transaction(transfer2, user_id="U2", device_id="D2")

    # Mismatched transfer_ids
    with pytest.raises(ValueError, match="share the same transfer_id"):
        validate_transfer_deltas(dispatch_tx, receive_tx)


def test_create_cancel_compensation_transaction() -> None:
    """Test compensating transaction creation for cancelled dispatched transfer."""
    draft_transfer = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-1",
        quantity=3,
        created_by_user_id="USER-1",
        status=TransferStatus.DRAFT,
    )
    # Draft cancellation does not produce a stock transaction
    assert (
        create_cancel_compensation_transaction(draft_transfer, user_id="U1", device_id="D1") is None
    )

    dispatched_transfer = Transfer(
        source_store_id="STORE-A",
        destination_store_id="STORE-B",
        product_id="PROD-1",
        quantity=3,
        created_by_user_id="USER-1",
        status=TransferStatus.DISPATCHED,
    )

    comp_tx = create_cancel_compensation_transaction(
        dispatched_transfer, user_id="U1", device_id="D1"
    )
    assert comp_tx is not None
    assert comp_tx.store_id == "STORE-A"
    assert comp_tx.quantity_delta == 3
    assert comp_tx.transfer_id == dispatched_transfer.id
