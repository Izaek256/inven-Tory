"""
User ORM model — central PostgreSQL.

Roles map to SRS §4 user types.  The role column stores the enum value as a
plain string so it remains readable in raw SQL and survives future enum additions
without a migration.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    """Central user account — authenticated via /api/v1/auth/login."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # SRS §4: GLOBAL_ADMIN | INVENTORY_MANAGER | STORE_MANAGER | STORE_CLERK | AUDITOR | SYNC
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="STORE_CLERK")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )
