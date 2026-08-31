"""
FastAPI reusable dependencies.

get_db       — async DB session (one per request)
get_current_user   — validates Bearer JWT, loads User, checks device revocation
require_permission — factory that returns a dependency enforcing a specific permission

AT-011 groundwork: every unauthorized / revoked access attempt is logged as an
audit event.  The full audit table lands in Issue 17; for now we write to the
application logger at WARNING level so the event is observable in log aggregation.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Permission, role_has_permission
from app.core.security import decode_access_token
from app.db import get_db
from app.models.device import Device
from app.models.user import User

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> User:
    """
    Validate the Bearer JWT and return the active User.

    Enforces (SRS §15):
    1. Token signature / expiry / type.
    2. User account is_active.
    3. The device_id in the token belongs to an active (non-revoked) device.

    Any failure is logged for audit purposes (AT-011 groundwork) and raises
    HTTP 401 so the client knows the call was rejected.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Decode token
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        logger.warning("AUTH_FAILURE token_invalid reason=%s", exc)
        raise credentials_exception from exc

    user_id: str | None = payload.get("sub")
    device_id: str | None = payload.get("device_id")

    if not user_id or not device_id:
        logger.warning(
            "AUTH_FAILURE token_missing_claims user_id=%s device_id=%s", user_id, device_id
        )
        raise credentials_exception

    # 2. Load user
    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalars().first()

    if user is None or not user.is_active:
        logger.warning("AUTH_FAILURE user_inactive_or_missing user_id=%s", user_id)
        raise credentials_exception

    # 3. Verify device is still active (revocation check — SRS §15)
    dev_result = await db.execute(select(Device).where(Device.id == device_id))
    device: Device | None = dev_result.scalars().first()

    if device is None or not device.is_active:
        logger.warning(
            "AUTH_FAILURE device_revoked_or_missing user_id=%s device_id=%s",
            user_id,
            device_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Device has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_permission(permission: Permission) -> Callable[..., User]:
    """
    Dependency factory — require *permission* in addition to a valid token.

    Usage::

        @router.post("/some-endpoint")
        async def handler(
            _user: User = Depends(require_permission(Permission.ADJUSTMENT)),
        ): ...
    """

    async def _check(user: User = Depends(get_current_user)) -> User:  # noqa: B008
        if not role_has_permission(user.role, permission):
            logger.warning(
                "AUTHZ_FAILURE permission_denied user_id=%s role=%s required=%s",
                user.id,
                user.role,
                permission.value,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission.value}' required",
            )
        return user

    return _check


__all__ = ["get_current_user", "get_db", "require_permission"]
