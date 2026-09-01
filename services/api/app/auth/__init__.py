"""FastAPI Users authentication module — Issue 25."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.backend import auth_backend
from app.auth.manager import UserManager
from app.auth.user import User, UserCreate, UserRead, UserUpdate
from app.db import get_db

__all__ = [
    "User",
    "UserCreate",
    "UserManager",
    "UserRead",
    "UserUpdate",
    "auth_backend",
    "get_user_db",
    "get_user_manager",
]


async def get_user_db(
    session: AsyncSession = Depends(get_db),
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:  # noqa: B008
    """
    Dependency that yields a SQLAlchemyUserDatabase instance.

    This is used by FastAPI Users' user manager to access the database.
    """
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase = Depends(get_user_db),
) -> AsyncGenerator[UserManager, None]:  # noqa: B008
    """
    Dependency that yields a UserManager instance.

    This is used by FastAPI Users' routers to access user management operations.
    """
    yield UserManager(user_db)
