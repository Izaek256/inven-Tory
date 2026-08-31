"""
POST /api/v1/auth/login — password authentication and token issuance (SRS §17).

Returns a short-lived access token and a longer-lived refresh token.
The access token carries: sub (user_id), role, device_id, exp.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.models.device import Device
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)
    # The device_id must already be registered (and active) before login succeeds.
    device_id: str = Field(..., min_length=1, max_length=36)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue tokens",
    status_code=status.HTTP_200_OK,
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """
    Validate username + password, verify the calling device is registered and
    active, then issue an access + refresh token pair.

    Failure cases (all return 401 to avoid user enumeration):
    - Unknown username
    - Wrong password
    - Inactive user account
    - Device not registered or revoked
    """
    _unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username, password, or device",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Look up user
    result = await db.execute(select(User).where(User.username == body.username))
    user: User | None = result.scalars().first()

    if user is None or not user.is_active:
        logger.warning("LOGIN_FAILURE reason=user_missing_or_inactive username=%s", body.username)
        raise _unauthorized

    # 2. Verify password
    if not verify_password(body.password, user.hashed_password):
        logger.warning("LOGIN_FAILURE reason=wrong_password username=%s", body.username)
        raise _unauthorized

    # 3. Verify device
    dev_result = await db.execute(select(Device).where(Device.id == body.device_id))
    device: Device | None = dev_result.scalars().first()

    if device is None or not device.is_active:
        logger.warning(
            "LOGIN_FAILURE reason=device_revoked_or_missing " "username=%s device_id=%s",
            body.username,
            body.device_id,
        )
        raise _unauthorized

    # 4. Issue tokens
    access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        device_id=device.id,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    logger.info("LOGIN_SUCCESS user_id=%s device_id=%s role=%s", user.id, device.id, user.role)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
    )
