"""
User model for the local SQLite database (read-only identity cache).

Issue 25 — Auth consolidation:
The local SQLite users table is a READ-ONLY CACHE of identity/role/display-name
pulled from the central API via the sync pull (Issue 15).  It NEVER stores a
password or password hash.  Authentication always happens against the central
FastAPI service (/api/v1/auth/login); the desktop only caches the returned JWT
and the user's id/username/role for offline display purposes.

The hashed_password column was present in migration 0001 and is removed in
migration 0002_drop_sqlite_password_column.

The ID is a String(36) matching the UUID-style identifiers used throughout the
local storage package (stores, products, devices all use String(36) PKs).
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from storage.db import Base


def current_utc_now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    """Local identity cache — populated by sync pull, never holds a central password."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    # pin_hash: bcrypt hash of the user's offline PIN/password.
    # Set during sync pull or by the dev seed. Enables local login without
    # a network connection (Section 21 offline-first requirement).
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="STORE_CLERK")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_now, nullable=False
    )
