"""
FastAPI Users user manager — Issue 25.

Configures the user manager with async SQLAlchemy backend and JWT authentication.
"""

from __future__ import annotations

from fastapi import Request
from fastapi_users import BaseUserManager, IntegerIDMixin, exceptions
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase

from app.auth.user import User
from app.core.config import settings


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    """
    User manager for FastAPI Users.

    Handles user lifecycle operations (create, update, delete) and integrates
    with our JWT authentication backend.
    """

    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    def __init__(self, user_db: SQLAlchemyUserDatabase):
        super().__init__(user_db)

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        """Hook called after user registration — log for audit (AT-011)."""
        print(f"User {user.id} has registered.")

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        """Hook called after verification request — log for audit."""
        print(f"Verification requested for user {user.id}.")

    async def on_after_update(
        self,
        user: User,
        update_dict: dict[str, object],
        request: Request | None = None,
    ) -> None:
        """Hook called after user update — log for audit."""
        print(f"User {user.id} has been updated with {update_dict}.")

    async def create(
        self,
        user_create: dict[str, object],
        safe: bool = False,
        request: Request | None = None,
    ) -> User:
        """
        Override create to enforce role validation.

        Ensures that only valid roles from SRS §4 can be assigned.
        """
        valid_roles = {
            "GLOBAL_ADMIN",
            "INVENTORY_MANAGER",
            "STORE_MANAGER",
            "STORE_CLERK",
            "AUDITOR",
            "SYNC",
        }

        # Handle both dict and Pydantic model inputs
        if hasattr(user_create, "dict"):
            # Pydantic model
            role = getattr(user_create, "role", None)
        else:
            # Dict
            role = user_create.get("role")

        if role and str(role) not in valid_roles:
            raise exceptions.InvalidUserException(
                f"Invalid role '{role}'. Must be one of: {', '.join(sorted(valid_roles))}"
            )

        return await super().create(user_create, safe, request)
