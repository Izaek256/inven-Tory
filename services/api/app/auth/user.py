"""
FastAPI Users user model with custom fields — Issue 25.

Extends the FastAPI Users base model with our custom fields:
- role (System Administrator / Inventory Manager / Store Manager / Store Clerk / Auditor-Viewer / Sync Service)
- assigned_store_id (nullable, for store-scoped roles)

The existing User ORM model in app/models/user.py will be migrated to inherit from
FastAPI Users' base model to maintain compatibility with the library's expectations.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi_users import schemas
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTable
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(SQLAlchemyBaseUserTable[int], Base):
    """
    FastAPI Users user model with custom fields.

    Inherits from FastAPI Users' SQLAlchemyBaseUserTable which provides:
    - id (integer, auto-increment)
    - email (string, unique, nullable)
    - hashed_password (string, nullable)
    - is_active (boolean)
    - is_superuser (boolean)
    - is_verified (boolean)

    Custom fields added:
    - role: SRS §4 user type
    - assigned_store_id: nullable FK to stores.id for store-scoped roles
    - full_name: display name
    - created_at/updated_at: audit timestamps
    """

    __tablename__ = "users"

    # FastAPI Users base fields (inherited, listed here for clarity):
    # id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # email: Mapped[str] = mapped_column(String, nullable=False)
    # hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    # is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


# ---------------------------------------------------------------------------
# Pydantic schemas for FastAPI Users
# ---------------------------------------------------------------------------


class UserRead(schemas.BaseUser[int]):
    """Schema for reading user data (includes custom fields)."""

    username: str
    full_name: str | None
    role: str
    assigned_store_id: str | None
    created_at: datetime
    updated_at: datetime


class UserCreate(schemas.BaseUserCreate):
    """Schema for creating a new user (includes custom fields)."""

    username: str
    full_name: str | None = None
    role: str = "STORE_CLERK"
    assigned_store_id: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    """Schema for updating user data (includes custom fields)."""

    username: str | None = None
    full_name: str | None = None
    role: str | None = None
    assigned_store_id: str | None = None
