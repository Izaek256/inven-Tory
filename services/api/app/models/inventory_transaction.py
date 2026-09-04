"""
InventoryTransaction ORM model — central PostgreSQL.

The ledger is an append-only log of immutable movement events (Section 9.1).
`transaction_id` is a client-generated ULID and serves as the idempotency key
for SYNC-003/SYNC-004: duplicate submissions are detected by a unique PK lookup
before any insert is attempted.

Mirrors packages/storage/storage/models/inventory_transaction.py but targets
app.db.Base (async PostgreSQL).
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class InventoryTransaction(Base):
    """Immutable central inventory transaction ledger event."""

    __tablename__ = "inventory_transactions"

    # Client-generated ULID — doubles as the idempotency key (SYNC-003/004).
    transaction_id: Mapped[str] = mapped_column(String(36), primary_key=True)

    store_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stores.id"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    movement_type: Mapped[str] = mapped_column(String(50), nullable=False)
    stock_bucket: Mapped[str] = mapped_column(String(50), nullable=False, default="AVAILABLE")
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("devices.id"), nullable=False, index=True
    )
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transfer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("transfers.id"), nullable=True, index=True
    )

    # Section 16.1 additions
    purchase_order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    client_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Central-side sync lifecycle (server sets this on ingestion)
    sync_status: Mapped[str] = mapped_column(String(50), nullable=False, default="ACCEPTED")
    server_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Reversal pointer (FR-MOV-009)
    original_transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        # Section 16.2 composite indexes
        Index("ix_inv_tx_prod_store_date", "product_id", "store_id", "occurred_at"),
        Index("ix_inv_tx_store_prod_date", "store_id", "product_id", "occurred_at"),
    )
