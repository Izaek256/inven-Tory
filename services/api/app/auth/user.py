"""
FastAPI Users Pydantic schemas — Issue 25.

The ORM ``User`` model lives in ``app.models.user`` (single source of truth).
This module re-exports it for FastAPI Users compatibility and provides the
Pydantic read/create/update schemas that FastAPI Users requires.
"""

from __future__ import annotations

from datetime import datetime

from fastapi_users import schemas

# Re-export the canonical ORM model so the rest of the auth package can
# import ``User`` from here without creating a second SQLAlchemy mapper.
from app.models.user import User

__all__ = ["User", "UserCreate", "UserRead", "UserUpdate"]


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
