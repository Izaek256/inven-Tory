"""
SyncReceipt ORM model — central PostgreSQL.

A server-side acknowledgement record created for every processed
transaction (accepted or rejected).  Acts as the server's durable
idempotency log: once a receipt exists for a transaction_id the server
returns the stored outcome without re-running ingestion logic.

Section 17.2 push payload; SYNC-003, SYNC-004, SYNC-012.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SyncReceipt(Base):
    """
    Idempotency receipt for a single ingested transaction_id.

    Primary key: transaction_id (mirrors InventoryTransaction PK so the
    two tables stay in 1-to-1 correspondence without a separate FK needed
    at the model layer — the ingestion service enforces the relationship).
    """

    __tablename__ = "sync_receipts"

    # Use transaction_id as PK — one receipt per transaction, ever.
    transaction_id: Mapped[str] = mapped_column(String(36), primary_key=True)

    # Whether the transaction was actually written to the ledger.
    accepted: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Human-readable rejection reason if accepted=False.
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
