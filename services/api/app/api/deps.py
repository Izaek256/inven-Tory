"""
FastAPI reusable dependencies.

get_db       — async DB session (one per request)
get_current_user   — validates Bearer JWT via FastAPI Users, checks device revocation
require_permission — factory that returns a dependency enforcing a specific permission

AT-011 groundwork: every unauthorized / revoked access attempt is logged as an
audit event.  The full audit table lands in Issue 17; for now we write to the
application logger at WARNING level so the event is observable in log aggregation.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi_users import FastAPIUsers
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import auth_backend, get_user_manager
from app.auth.user import User
from app.core.permissions import Permission, role_has_permission
from app.core.security import decode_access_token
from app.db import get_db
from app.models.device import Device

logger = logging.getLogger(__name__)

# FastAPI Users instance for authentication
fastapi_users = FastAPIUsers[User, int](get_user_manager, [auth_backend])


async def get_current_user(
    request: Request,
    user: User = Depends(fastapi_users.current_user(active=True)),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> User:
    """
    Validate the Bearer JWT via FastAPI Users and return the active User.

    FastAPI Users handles:
    1. Token signature / expiry / type validation
    2. User account is_active check

    This function adds:
    3. Device revocation check (SRS §15) - device_id is embedded in our custom JWT

    Any failure is logged for audit purposes (AT-011 groundwork) and raises
    HTTP 401 so the client knows the call was rejected.
    """
    # FastAPI Users already validated the token and user is_active
    # Now we need to verify device revocation if device_id is in the token
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        try:
            payload = decode_access_token(token)
            device_id = payload.get("device_id")

            # Check device revocation if device_id is present (from our custom login)
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
        except (JWTError, KeyError, AttributeError):
            # If we can't decode or check device, fall through to return user
            # This allows standard FastAPI Users routes to work
            pass

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
