"""
Multi-store transfer domain state machine rules and invariants (Section 11, AT-005).
"""

from datetime import UTC, datetime

from domain.entities.enums import MovementType, StockBucket, TransferStatus
from domain.entities.inventory_transaction import InventoryTransaction
from domain.entities.transfer import Transfer


class InvalidTransferStateTransitionError(ValueError):
    """Raised when an illegal transfer state machine transition is attempted."""


ALLOWED_TRANSITIONS: dict[TransferStatus, set[TransferStatus]] = {
    TransferStatus.DRAFT: {TransferStatus.DISPATCHED, TransferStatus.CANCELLED},
    TransferStatus.DISPATCHED: {
        TransferStatus.RECEIVED,
        TransferStatus.EXCEPTION,
        TransferStatus.CANCELLED,
    },
    TransferStatus.EXCEPTION: {TransferStatus.RECEIVED, TransferStatus.CANCELLED},
    TransferStatus.RECEIVED: set(),
    TransferStatus.CANCELLED: set(),
}


def validate_transfer_transition(
    current_status: TransferStatus, new_status: TransferStatus
) -> None:
    """
    Validate inter-store transfer state machine transition (Section 11).

    Transitions allowed:
    - DRAFT -> DISPATCHED | CANCELLED
    - DISPATCHED -> RECEIVED | EXCEPTION | CANCELLED
    - EXCEPTION -> RECEIVED | CANCELLED
    - RECEIVED / CANCELLED -> terminal states (no further transitions allowed)
    """
    if current_status == new_status:
        return

    allowed = ALLOWED_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        raise InvalidTransferStateTransitionError(
            f"Cannot transition transfer from status '{current_status.value}' to '{new_status.value}'."
        )


def create_dispatch_transaction(
    transfer: Transfer,
    user_id: str,
    device_id: str,
    occurred_at: datetime | None = None,
) -> InventoryTransaction:
    """
    Create source store dispatch transaction.

    Decreases AVAILABLE stock at the source store by the transfer quantity.
    """
    return InventoryTransaction(
        store_id=transfer.source_store_id,
        product_id=transfer.product_id,
        movement_type=MovementType.TRANSFER,
        stock_bucket=StockBucket.AVAILABLE,
        quantity_delta=-transfer.quantity,
        occurred_at=occurred_at or datetime.now(UTC),
        user_id=user_id,
        device_id=device_id,
        transfer_id=transfer.id,
        reason_code=f"TRANSFER DISPATCH -> Store {transfer.destination_store_id}",
        reference_number=f"TRF-DISP-{transfer.id}",
    )


def create_receive_transaction(
    transfer: Transfer,
    user_id: str,
    device_id: str,
    occurred_at: datetime | None = None,
) -> InventoryTransaction:
    """
    Create destination store receive confirmation transaction (AT-005).

    Increases AVAILABLE stock at the destination store by the transfer quantity.
    """
    return InventoryTransaction(
        store_id=transfer.destination_store_id,
        product_id=transfer.product_id,
        movement_type=MovementType.TRANSFER,
        stock_bucket=StockBucket.AVAILABLE,
        quantity_delta=transfer.quantity,
        occurred_at=occurred_at or datetime.now(UTC),
        user_id=user_id,
        device_id=device_id,
        transfer_id=transfer.id,
        reason_code=f"TRANSFER RECEIVE <- Store {transfer.source_store_id}",
        reference_number=f"TRF-RECV-{transfer.id}",
    )


def create_cancel_compensation_transaction(
    transfer: Transfer,
    user_id: str,
    device_id: str,
    occurred_at: datetime | None = None,
) -> InventoryTransaction | None:
    """
    Create compensating transaction if a dispatched transfer is cancelled.

    Restores stock to source store (+quantity) if transfer was in DISPATCHED or EXCEPTION status.
    Returns None if transfer was in DRAFT.
    """
    if transfer.status not in (TransferStatus.DISPATCHED, TransferStatus.EXCEPTION):
        return None

    return InventoryTransaction(
        store_id=transfer.source_store_id,
        product_id=transfer.product_id,
        movement_type=MovementType.TRANSFER,
        stock_bucket=StockBucket.AVAILABLE,
        quantity_delta=transfer.quantity,
        occurred_at=occurred_at or datetime.now(UTC),
        user_id=user_id,
        device_id=device_id,
        transfer_id=transfer.id,
        reason_code="TRANSFER CANCELLED -> Stock Restored",
        reference_number=f"TRF-CNCL-{transfer.id}",
    )


def validate_transfer_deltas(
    dispatch_tx: InventoryTransaction, receive_tx: InventoryTransaction
) -> None:
    """
    Enforce that source and destination deltas are always equal and opposite (AT-005).
    """
    if dispatch_tx.transfer_id is None or dispatch_tx.transfer_id != receive_tx.transfer_id:
        raise ValueError("Dispatch and receive transactions must share the same transfer_id.")

    if dispatch_tx.product_id != receive_tx.product_id:
        raise ValueError("Dispatch and receive transactions must involve the same product_id.")

    if dispatch_tx.quantity_delta + receive_tx.quantity_delta != 0:
        raise ValueError(
            f"Transfer deltas must be equal and opposite. "
            f"Got dispatch delta {dispatch_tx.quantity_delta} and receive delta {receive_tx.quantity_delta}."
        )
