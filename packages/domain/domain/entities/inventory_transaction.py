"""
Inventory transaction domain entity.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from ulid import ULID

from domain.entities.enums import MovementType, StockBucket, SyncStatus


def _coerce_and_validate_enum[E: Enum](val: Any, enum_cls: type[E], field_name: str) -> E:
    if isinstance(val, enum_cls):
        return val
    if isinstance(val, str) and not isinstance(val, bool):
        return enum_cls(val)
    raise TypeError(
        f"{field_name} must be a {enum_cls.__name__} or string representation, got {type(val).__name__}"
    )


def generate_ulid() -> str:
    """Generate a globally unique ULID string for transaction identification."""
    return str(ULID())


def current_utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(UTC)


@dataclass(frozen=True)
class InventoryTransaction:
    """
    Immutable domain entity representing a single inventory movement event (Section 9.1).

    The ledger is an append-only set of these events. Stock balances are derived
    projections over accepted transaction history.
    """

    store_id: str
    product_id: str
    movement_type: MovementType
    quantity_delta: int
    occurred_at: datetime
    user_id: str
    device_id: str
    transaction_id: str = field(default_factory=generate_ulid)
    stock_bucket: StockBucket = StockBucket.AVAILABLE
    recorded_at: datetime = field(default_factory=current_utc_now)
    reference_number: str | None = None
    reason_code: str | None = None
    transfer_id: str | None = None
    purchase_order_id: str | None = None
    batch_id: str | None = None
    client_sequence: int | None = None
    sync_status: SyncStatus = SyncStatus.PENDING
    server_accepted_at: datetime | None = None
    original_transaction_id: str | None = None

    def __post_init__(self) -> None:
        """Enforce field type integrity upon initialization."""
        if isinstance(self.quantity_delta, bool) or not isinstance(self.quantity_delta, int):
            raise TypeError("quantity_delta must be an integer")
        if self.client_sequence is not None and (
            isinstance(self.client_sequence, bool) or not isinstance(self.client_sequence, int)
        ):
            raise TypeError("client_sequence must be an integer")

        object.__setattr__(
            self,
            "movement_type",
            _coerce_and_validate_enum(self.movement_type, MovementType, "movement_type"),
        )
        object.__setattr__(
            self,
            "stock_bucket",
            _coerce_and_validate_enum(self.stock_bucket, StockBucket, "stock_bucket"),
        )
        object.__setattr__(
            self,
            "sync_status",
            _coerce_and_validate_enum(self.sync_status, SyncStatus, "sync_status"),
        )
