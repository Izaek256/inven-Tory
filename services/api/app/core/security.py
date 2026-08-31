"""
Security utilities — password hashing and JWT token lifecycle.

Follows SRS §15.1/15.2:
- bcrypt-hashed passwords (passlib)
- Short-lived access tokens + longer-lived refresh tokens (python-jose)
- Tokens carry: sub (user id), role, device_id, jti (unique token ID for
  revocation checks if needed), exp

Never import this module from domain/ — security is infrastructure, not domain.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True when *plain* matches *hashed*."""
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
ALGORITHM = "HS256"
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def _create_token(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Build and sign a JWT with standard + custom claims."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_access_token(user_id: str, role: str, device_id: str) -> str:
    """Issue a short-lived access token (SRS §15.1)."""
    return _create_token(
        subject=user_id,
        token_type=TOKEN_TYPE_ACCESS,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra_claims={"role": role, "device_id": device_id},
    )


def create_refresh_token(user_id: str) -> str:
    """Issue a long-lived refresh token (SRS §15.1)."""
    return _create_token(
        subject=user_id,
        token_type=TOKEN_TYPE_REFRESH,
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token; raise JWTError on any failure."""
    payload: dict[str, Any] = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != TOKEN_TYPE_ACCESS:
        raise JWTError("wrong token type")
    return payload


__all__ = [
    "ALGORITHM",
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "hash_password",
    "verify_password",
]
