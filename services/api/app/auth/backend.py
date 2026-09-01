"""
FastAPI Users authentication backend — Issue 25.

Configures JWT-based authentication with Bearer token transport.
This replaces the bespoke JWT implementation from Issue 13.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)

from app.core.config import settings


def get_jwt_strategy() -> JWTStrategy:
    """
    Configure JWT strategy for FastAPI Users.

    Uses the same secret key and token lifetime as the bespoke implementation
    to maintain compatibility during migration.
    """
    return JWTStrategy(
        secret=settings.secret_key,
        lifetime_seconds=timedelta(minutes=settings.access_token_expire_minutes).total_seconds(),
        algorithm="HS256",
    )


bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)
