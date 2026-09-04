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

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

_BCRYPT_MIN_ROUNDS = 12


def _bcrypt_password(plain: str) -> bytes:
    """Encode a plaintext password to UTF-8 bytes for bcrypt."""
    return plain.encode("utf-8")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*.

    Uses the :mod:`bcrypt` package directly rather than the passlib
    CryptContext wrapper to avoid a noisy (trapped)
    ``AttributeError: module 'bcrypt' has no attribute '__about__'``
    warning that passlib emits when probing the bcrypt backend's version.
    The produced ``$2b$`` hashes are fully compatible with passlib's own
    bcrypt backend, so existing stored hashes continue to verify.
    """
    salt = bcrypt.gensalt(rounds=_BCRYPT_MIN_ROUNDS)
    return bcrypt.hashpw(_bcrypt_password(plain), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True when *plain* matches *hashed*."""
    try:
        return bcrypt.checkpw(_bcrypt_password(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


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


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode and validate a refresh token; raise JWTError on any failure."""
    payload: dict[str, Any] = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != TOKEN_TYPE_REFRESH:
        raise JWTError("wrong token type")
    return payload


__all__ = [
    "ALGORITHM",
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "decode_refresh_token",
    "hash_password",
    "verify_password",
]
