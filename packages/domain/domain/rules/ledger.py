"""
Inventory ledger business rules and invariants (Section 9, Appendix B).
"""

from collections.abc import Sequence
from datetime import UTC, datetime

from domain.entities.enums import StockBucket, SyncStatus
from domain.entities.inventory_transaction import InventoryTransaction


class NegativeStockError(ValueError):
    """Raised when a transaction would cause a negative stock balance in strict mode (FR-MOV-008)."""


def project_balance(
    events: Sequence[InventoryTransaction],
    store_id: str | None = None,
    product_id: str | None = None,
    stock_bucket: StockBucket | None = None,
) -> int:
    """
    Pure balance projection function matching Section 9.4 balance invariant.

    Calculates current balance by summing quantity_delta over valid, accepted or pending
    events matching the given criteria. Events with sync_status=REJECTED are ignored.
    """
    total = 0
    for event in events:
        if event.sync_status == SyncStatus.REJECTED:
            continue
        if store_id is not None and event.store_id != store_id:
            continue
        if product_id is not None and event.product_id != product_id:
            continue
        if stock_bucket is not None and event.stock_bucket != stock_bucket:
            continue
        total += event.quantity_delta
    return total


def project_balances_by_store(
    events: Sequence[InventoryTransaction],
    product_id: str | None = None,
    stock_bucket: StockBucket | None = None,
) -> dict[str, int]:
    """Calculate projected balances per store for a product (or all products)."""
    store_balances: dict[str, int] = {}
    for event in events:
        if event.sync_status == SyncStatus.REJECTED:
            continue
        if product_id is not None and event.product_id != product_id:
            continue
        if stock_bucket is not None and event.stock_bucket != stock_bucket:
            continue
        store_balances[event.store_id] = (
            store_balances.get(event.store_id, 0) + event.quantity_delta
        )
    return store_balances


def project_global_balance(
    events: Sequence[InventoryTransaction],
    product_id: str | None = None,
    stock_bucket: StockBucket | None = None,
) -> int:
    """Calculate global projected total balance across all stores."""
    return project_balance(events, product_id=product_id, stock_bucket=stock_bucket)


def validate_transaction(
    transaction: InventoryTransaction,
    history: Sequence[InventoryTransaction],
    strict_mode: bool = True,
) -> None:
    """
    Validate transaction against ledger invariants.

    Enforces strict-mode negative-stock rejection rule (FR-MOV-008).
    """
    if not strict_mode:
        return

    future_history = list(history) + [transaction]
    projected = project_balance(
        future_history,
        store_id=transaction.store_id,
        product_id=transaction.product_id,
        stock_bucket=transaction.stock_bucket,
    )
    if projected < 0:
        raise NegativeStockError(
            f"Transaction would drive stock negative ({projected}) for store '{transaction.store_id}', "
            f"product '{transaction.product_id}', bucket '{transaction.stock_bucket.value}' in strict mode."
        )


def create_reversal(
    original_transaction: InventoryTransaction,
    reason: str,
    user_id: str | None = None,
    device_id: str | None = None,
    occurred_at: datetime | None = None,
) -> InventoryTransaction:
    """
    Reversal/compensation model (FR-MOV-009).

    A correction is ALWAYS a new event linked to original_transaction_id with negated
    quantity_delta. The original event is NEVER deleted or modified.
    """
    return InventoryTransaction(
        store_id=original_transaction.store_id,
        product_id=original_transaction.product_id,
        movement_type=original_transaction.movement_type,
        quantity_delta=-original_transaction.quantity_delta,
        occurred_at=occurred_at or datetime.now(UTC),
        user_id=user_id or original_transaction.user_id,
        device_id=device_id or original_transaction.device_id,
        stock_bucket=original_transaction.stock_bucket,
        reason_code=f"REVERSAL: {reason}",
        reference_number=f"REV-{original_transaction.transaction_id}",
        transfer_id=original_transaction.transfer_id,
        purchase_order_id=original_transaction.purchase_order_id,
        batch_id=original_transaction.batch_id,
        original_transaction_id=original_transaction.transaction_id,
    )
