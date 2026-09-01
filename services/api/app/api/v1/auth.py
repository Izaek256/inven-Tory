"""
Authentication endpoints — Issue 25 (SRS §15.1/15.2, AT-011).

FastAPI Users-based authentication with custom device verification and role support.

This module wraps FastAPI Users' standard routers with our custom requirements:
- Device verification (FR-STORE-003) on login
- Custom role-based permissions (SRS §15.2)
- Device revocation independent of user session state

FastAPI Users provides:
  POST /api/v1/auth/jwt/login       — standard JWT login
  POST /api/v1/auth/jwt/logout      — logout
  GET  /api/v1/auth/me              — current user profile
  POST /api/v1/auth/register        — user registration
  POST /api/v1/auth/forgot-password — password reset request
  POST /api/v1/auth/reset-password  — password reset with token
  GET  /api/v1/auth/users           — user management endpoints

Custom endpoints added:
  POST /api/v1/auth/login           — login with device verification (desktop primary)
  POST /api/v1/auth/refresh         — refresh access token
  POST /api/v1/auth/change-password — change own password

Auth backend: JWT Bearer transport (compatible with Tauri secure storage).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_users import FastAPIUsers
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.auth import auth_backend, get_user_manager
from app.auth.user import User, UserCreate, UserRead, UserUpdate
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.models.device import Device

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI Users setup
# ---------------------------------------------------------------------------

fastapi_users = FastAPIUsers[User, int](
    get_user_manager,
    [auth_backend],
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Include FastAPI Users standard routers
router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/jwt",
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_reset_password_router(),
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["auth"],
)


# ---------------------------------------------------------------------------
# Custom endpoints (device verification and role support)
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
    user_id: int
    username: str
    full_name: str | None
    assigned_store_id: str | None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class LogoutResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login (custom with device verification)
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user with device verification and issue JWT tokens",
    status_code=status.HTTP_200_OK,
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> TokenResponse:
    """
    Validate username + password, verify the calling device is registered and
    active, then issue an access + refresh token pair.

    This custom endpoint extends FastAPI Users' standard login with device
    verification (FR-STORE-003). The standard FastAPI Users login at /auth/jwt/login
    does not include device verification.

    JWT transport rationale: Bearer tokens fit all three client surfaces
    (Tauri desktop, React web, mobile PWA) without cookie domain constraints.

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

    # 1. Look up user by username (not email, for our custom login)
    result = await db.execute(select(User).where(User.username == body.username))
    user: User | None = result.scalars().first()

    if user is None or not user.is_active:
        logger.warning("LOGIN_FAILURE reason=user_missing_or_inactive username=%s", body.username)
        raise _unauthorized

    # 2. Verify password using FastAPI Users' password manager
    async for user_manager in get_user_manager():
        if not await user_manager.verify(body.password, user):
            logger.warning("LOGIN_FAILURE reason=wrong_password username=%s", body.username)
            raise _unauthorized
        break

    # 3. Verify device is registered and active
    dev_result = await db.execute(select(Device).where(Device.id == body.device_id))
    device: Device | None = dev_result.scalars().first()

    if device is None or not device.is_active:
        logger.warning(
            "LOGIN_FAILURE reason=device_revoked_or_missing username=%s device_id=%s",
            body.username,
            body.device_id,
        )
        raise _unauthorized

    # 4. Issue tokens using our custom JWT strategy (includes device_id and role)
    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role,
        device_id=device.id,
    )
    refresh_token = create_refresh_token(user_id=str(user.id))

    logger.info("LOGIN_SUCCESS user_id=%s device_id=%s role=%s", user.id, device.id, user.role)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        assigned_store_id=user.assigned_store_id,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh (custom refresh with role support)
# ---------------------------------------------------------------------------


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Exchange a refresh token for a new access token",
    status_code=status.HTTP_200_OK,
)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AccessTokenResponse:
    """
    Exchange a valid refresh token for a fresh access token.

    The refresh token does not carry a device_id claim; callers are expected to
    re-supply their device_id via a follow-up login or by embedding it in the
    next push payload. For simplicity here we issue a token without a device_id
    (the caller must follow up with a full login to regain device-verified access).
    This keeps the refresh flow safe offline without requiring device round-trips.

    Offline behavior (Section 21 / AT-021):
    - The desktop app calls this endpoint when reconnected to refresh an expired
      token; it must NOT discard pending outbox events while offline.
    """
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_refresh_token(body.refresh_token)
    except JWTError:
        raise _invalid

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise _invalid

    try:
        user_id_int = int(user_id)
    except ValueError:
        logger.warning("REFRESH_FAILURE reason=invalid_user_id_format user_id=%s", user_id)
        raise _invalid

    result = await db.execute(select(User).where(User.id == user_id_int))
    user: User | None = result.scalars().first()

    if user is None or not user.is_active:
        logger.warning("REFRESH_FAILURE reason=user_inactive_or_missing user_id=%s", user_id)
        raise _invalid

    # Issue a device-less access token (device verification happens at next login)
    # We embed a sentinel device_id so the claim structure is consistent; the
    # subsequent login will re-embed the real device_id.
    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role,
        device_id="REFRESH_NO_DEVICE",
    )

    logger.info("REFRESH_SUCCESS user_id=%s", user.id)

    return AccessTokenResponse(
        access_token=access_token,
        role=user.role,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout (custom for audit logging)
# ---------------------------------------------------------------------------


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Invalidate the current session (client hint)",
    status_code=status.HTTP_200_OK,
)
async def logout(
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> LogoutResponse:
    """
    Stateless logout — the server does not maintain a token blacklist.
    The client is responsible for discarding its cached tokens.

    This endpoint exists so clients can signal intent (audit log hook), and to
    provide a consistent API surface. True token revocation is handled by:
      a) access token expiry (60 min by default)
      b) device revocation (Section 15.1) which rejects all tokens for that device
    """
    logger.info("LOGOUT user_id=%s", current_user.id)
    return LogoutResponse(message="Logged out. Discard your local tokens.")


# ---------------------------------------------------------------------------
# POST /api/v1/auth/change-password (custom using FastAPI Users manager)
# ---------------------------------------------------------------------------


@router.post(
    "/change-password",
    response_model=LogoutResponse,
    summary="Change the authenticated user's password",
    status_code=status.HTTP_200_OK,
)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> LogoutResponse:
    """
    Change the calling user's password. Requires the current password as proof.

    After a password change, existing tokens remain valid until they expire
    (stateless JWT). Clients should treat this as an implicit logout signal
    and prompt for re-authentication.
    """
    async for user_manager in get_user_manager():
        # Verify current password
        if not await user_manager.verify(body.current_password, current_user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        if body.new_password == body.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must differ from the current password.",
            )

        # Update password using FastAPI Users manager
        await user_manager.update(
            current_user,
            {"password": body.new_password},
            safe=True,
        )
        break

    logger.info("PASSWORD_CHANGED user_id=%s", current_user.id)

    return LogoutResponse(message="Password updated. Please re-authenticate.")
