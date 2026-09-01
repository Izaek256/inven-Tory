"""
User ORM model — central PostgreSQL (FastAPI Users compatible).

Issue 25 — Auth consolidation:
This model now inherits from FastAPI Users' SQLAlchemyBaseUserTable to use the
library's authentication system. Custom fields for our domain are added on top.

Roles map to SRS §4 user types. The role column stores the enum value as a
plain string so it remains readable in raw SQL and survives future enum additions
without a migration.

Custom fields:
- role: SRS §4 user type
- assigned_store_id: nullable FK to stores.id for store-scoped roles
- full_name: display name
- created_at/updated_at: audit timestamps
"""

from datetime import UTC, datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTable
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class User(SQLAlchemyBaseUserTable[int], Base):
    """
    FastAPI Users user model with custom fields.

    Inherits from FastAPI Users' SQLAlchemyBaseUserTable which provides:
    - id (integer, auto-increment)
    - email (string, unique, required)
    - hashed_password (string, required)
    - is_active (boolean)
    - is_superuser (boolean)
    - is_verified (boolean)

    Custom fields added:
    - username: unique username for login
    - full_name: display name
    - role: SRS §4 user type
    - assigned_store_id: nullable FK to stores.id for store-scoped roles
    - created_at/updated_at: audit timestamps
    """

    __tablename__ = "users"

    # Custom fields
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # SRS §4: GLOBAL_ADMIN | INVENTORY_MANAGER | STORE_MANAGER | STORE_CLERK | AUDITOR | SYNC
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="STORE_CLERK")
    # NULL for global/admin roles; set for store-scoped roles (Issue 25)
    assigned_store_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("stores.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )
