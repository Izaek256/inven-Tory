"""
Transfer domain entity.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from ulid import ULID

from domain.entities.enums import TransferStatus


def generate_transfer_id() -> str:
    """Generate a globally unique ULID string for transfer identification."""
    return f"TRF-{ULID()}"


def current_utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(UTC)


@dataclass(frozen=True)
class Transfer:
    """
    Linked inter-store stock movement group entity (Section 11).
    """

    source_store_id: str
    destination_store_id: str
    product_id: str
    quantity: int
    created_by_user_id: str
    id: str = field(default_factory=generate_transfer_id)
    status: TransferStatus = TransferStatus.DRAFT
    notes: str | None = None
    created_at: datetime = field(default_factory=current_utc_now)
    updated_at: datetime = field(default_factory=current_utc_now)

    def __post_init__(self) -> None:
        """Enforce field type and business logic integrity upon initialization."""
        if self.quantity <= 0:
            raise ValueError("Transfer quantity must be greater than zero.")
        if self.source_store_id == self.destination_store_id:
            raise ValueError("Source store and destination store must be different.")
        if isinstance(self.status, str) and not isinstance(self.status, TransferStatus):
            object.__setattr__(self, "status", TransferStatus(self.status))
