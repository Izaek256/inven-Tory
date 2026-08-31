"""
AuditEvent ORM model — central PostgreSQL.

Append-only audit log for security and compliance events (Section 22, AT-011).
Full audit endpoint wiring lands in Issue 17; the table is created here so
that other services can write audit rows from Issue 14 onward.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class AuditEvent(Base):
    """Immutable audit log entry."""

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    # Who / what triggered the event
    actor_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_device_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Classification
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Optional reference to the affected entity
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Free-form JSON payload (severity, message, metadata, etc.)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False, index=True
    )
