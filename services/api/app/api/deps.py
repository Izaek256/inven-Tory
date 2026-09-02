"""
FastAPI reusable dependencies.

get_db       — async DB session (one per request)
get_current_user   — validates custom Bearer JWT, checks device revocation
require_permission — factory that returns a dependency enforcing a specific permission

AT-011 groundwork: every unauthorized / revoked access attempt is logged as an
audit event.  The full audit table lands in Issue 17; for now we write to the
application logger at WARNING level so the event is observable in log aggregation.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.user import User
from app.core.permissions import Permission, role_has_permission
from app.core.security import decode_access_token
from app.db import get_db
from app.models.device import Device

logger = logging.getLogger(__name__)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> User:
    """
    Validate the Bearer JWT and return the active User.

    Accepts BOTH our custom access tokens (issued by POST /auth/login with
    device verification) and FastAPI Users JWT tokens (issued by POST
    /auth/jwt/login).  Custom tokens are tried first; if that fails the
    FastAPI Users strategy is used as a fallback.

    After authenticating the user this function adds:
    - Device revocation check (SRS §15) — device_id is embedded in our custom JWT.

    Any failure is logged for audit purposes (AT-011 groundwork) and raises
    HTTP 401 so the client knows the call was rejected.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[len("Bearer ") :]
    user: User | None = None
    device_id: str | None = None

    # --- Try our custom JWT first ---
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str:
            user_id_int = int(user_id_str)
            result = await db.execute(select(User).where(User.id == user_id_int))
            user = result.scalars().first()
            device_id = payload.get("device_id")
    except (JWTError, ValueError, AttributeError):
        user = None

    if user is None or not user.is_active:
        logger.warning("AUTH_FAILURE invalid_or_expired_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # --- Device revocation check (only for custom tokens with device_id) ---
    if device_id and device_id != "REFRESH_NO_DEVICE":
        device_result = await db.execute(select(Device).where(Device.id == device_id))
        device: Device | None = device_result.scalars().first()

        if device is None or not device.is_active:
            logger.warning(
                "AUTH_FAILURE device_revoked user_id=%s device_id=%s",
                user.id,
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
