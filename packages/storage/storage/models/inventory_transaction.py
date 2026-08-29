"""
Inventory transaction model for local SQLite database.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from storage.db import Base


def current_utc_now() -> datetime:
    return datetime.now(UTC)


class InventoryTransaction(Base):
    """Immutable inventory transaction ledger event."""

    __tablename__ = "inventory_transactions"

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
        DateTime(timezone=True), default=current_utc_now, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
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
    sync_status: Mapped[str] = mapped_column(String(50), nullable=False, default="PENDING")
    server_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    original_transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        Index("ix_inv_tx_prod_store_date", "product_id", "store_id", "occurred_at"),
        Index("ix_inv_tx_store_prod_date", "store_id", "product_id", "occurred_at"),
    )
