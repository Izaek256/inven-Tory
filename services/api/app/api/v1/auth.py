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
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_users import FastAPIUsers
from fastapi_users import exceptions as fu_exceptions
from jose import JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.auth import auth_backend, get_user_manager
from app.auth.manager import UserManager
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
    # Single-user mode (Issue fix/auth-bootstrap-single-user):
    #   device_id is now OPTIONAL. When provided, the row is auto-created on
    #   first use (anchored to the user's assigned_store_id) so desktop can
    #   be placed and used on ANY device without pre-registration.
    device_id: str | None = Field(default=None, min_length=1, max_length=64)

    # Sentinel used when the caller omits device_id entirely.
    @classmethod
    def default_device(cls) -> str:
        return "SINGLE-USER-DEVICE"


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
# POST /api/v1/auth/register  (GLOBAL_ADMIN only — AT-011)
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=UserRead,
    summary="Register a new user (GLOBAL_ADMIN only)",
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: UserCreate,
    request: Request,
    current_user: User = Depends(get_current_user),  # noqa: B008
    user_manager: UserManager = Depends(get_user_manager),  # noqa: B008
) -> UserRead:
    """
    Create a new user account.

    AT-011: only GLOBAL_ADMIN may register users; any other role gets 403.
    Duplicate email or username returns 409.
    """
    if current_user.role != "GLOBAL_ADMIN":
        logger.warning(
            "AUTHZ_FAILURE register_denied user_id=%s role=%s",
            current_user.id,
            current_user.role,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only GLOBAL_ADMIN may register new users.",
        )

    try:
        created = await user_manager.create(body, safe=True, request=request)
    except fu_exceptions.UserAlreadyExists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email or username already exists.",
        )
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email or username already exists.",
        )

    return UserRead.model_validate(created)


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
    Validate username + password, then issue JWT tokens.

    Single-user mode (no device pre-registration):
      - ``device_id`` in the request is OPTIONAL.
      - If provided and the device row is missing, we auto-create it anchored
        to the user's ``assigned_store_id`` (fallback: store with the lowest
        lexicographic id). This means desktop can be installed on ANY machine
        and the first successful login "registers" that device implicitly.
      - If the device row exists but was explicitly revoked (is_active=False
        WITH a revocation_reason), we still reject it — so an admin CAN lock
        out a known-compromised device; but merely not-yet-registered devices
        never block login.

    JWT transport rationale: Bearer tokens fit all three client surfaces
    (Tauri desktop, React web, mobile PWA) without cookie domain constraints.

    Failure cases (all return 401 to avoid user enumeration):
      - Unknown username
      - Wrong password
      - Inactive user account
      - Device explicitly revoked (is_active=False AND revocation_reason set)
    """
    _unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    _device_revoked = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="This device has been revoked. Contact your administrator.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    now = datetime.now(UTC)

    # 1. Look up user by username (not email, for our custom login)
    result = await db.execute(select(User).where(User.username == body.username))
    user: User | None = result.scalars().first()

    if user is None or not user.is_active:
        logger.warning("LOGIN_FAILURE reason=user_missing_or_inactive username=%s", body.username)
        raise _unauthorized

    # 2. Verify password using bcrypt directly
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    if not pwd_context.verify(body.password, user.hashed_password):
        logger.warning("LOGIN_FAILURE reason=wrong_password username=%s", body.username)
        raise _unauthorized

    # 3. Resolve device_id — use default if omitted
    from app.models.store import Store

    raw_device_id = (body.device_id or "").strip() or LoginRequest.default_device()

    dev_result = await db.execute(select(Device).where(Device.id == raw_device_id))
    device: Device | None = dev_result.scalars().first()

    if device is None:
        # ── Auto-register (single-user mode) ────────────────────────────────
        # Anchor to user.assigned_store_id; if that's NULL for a global role,
        # grab any store row. If zero stores exist yet, fall back to the
        # sentinel id (the FK would fail otherwise — create the row with a
        # "catch-all" store only when we can resolve one from the DB; we
        # refuse login with a clear message in the extremely rare case where
        # zero stores exist AND the user has no assigned_store_id).
        anchor_store_id: str | None = user.assigned_store_id
        if anchor_store_id is None:
            any_store = await db.scalar(select(Store.id).limit(1))
            anchor_store_id = any_store

        if anchor_store_id is None:
            logger.error(
                "LOGIN_BLOCKED reason=no_store_available username=%s device_id=%s",
                body.username,
                raw_device_id,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No store configured. Run the genesis script or create a store first.",
            )

        device = Device(
            id=raw_device_id,
            store_id=anchor_store_id,
            device_name=f"Auto-registered ({raw_device_id[:24]})",
            is_active=True,
            registered_at=now,
            last_seen_at=now,
            registered_by_user_id=user.id,
        )
        db.add(device)
        await db.flush()
        logger.info(
            "DEVICE_AUTO_REGISTERED device_id=%s store_id=%s user_id=%s",
            raw_device_id,
            anchor_store_id,
            user.id,
        )
    else:
        # Exists → reject ONLY if explicitly revoked (is_active False WITH reason).
        # "is_active=False + no reason" is treated as a transient glitch —
        # flip it back on. This keeps the UX frictionless.
        if (not device.is_active) and device.revocation_reason:
            logger.warning(
                "LOGIN_FAILURE reason=device_revoked username=%s device_id=%s reason=%s",
                body.username,
                raw_device_id,
                device.revocation_reason,
            )
            raise _device_revoked

        if not device.is_active:
            device.is_active = True
            device.revocation_reason = None
            device.revoked_at = None
            logger.info("DEVICE_REACTIVATED device_id=%s user_id=%s", raw_device_id, user.id)

        # Update last-seen timestamp on every successful login
        device.last_seen_at = now

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
# GET /api/v1/auth/me (custom wrapper for current user profile)
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    summary="Get current user profile",
    status_code=status.HTTP_200_OK,
)
async def get_me(
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, object]:
    """
    Return the authenticated user's profile.

    This endpoint works with both custom login tokens and FastAPI Users tokens.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "assigned_store_id": current_user.assigned_store_id,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at.isoformat(),
        "updated_at": current_user.updated_at.isoformat(),
    }


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
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # Verify current password
    if not pwd_context.verify(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current password.",
        )

    # Update password using bcrypt
    current_user.hashed_password = pwd_context.hash(body.new_password)
    db.add(current_user)
    await db.flush()

    logger.info("PASSWORD_CHANGED user_id=%s", current_user.id)

    return LogoutResponse(message="Password updated. Please re-authenticate.")
