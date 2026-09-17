"""
Admin endpoints — genesis and data management.

These endpoints are for first-time setup (genesis) and administrative operations.
The genesis endpoint is intentionally NOT protected by authentication — it is
meant to be called by a fresh desktop app that has no credentials yet.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import hash_password
from app.models.device import Device
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


class GenesisRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=1, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)
    role: str = Field(default="GLOBAL_ADMIN", max_length=50)
    store_id: str = Field(..., min_length=1, max_length=36)
    store_code: str = Field(..., min_length=1, max_length=50)
    store_name: str = Field(..., min_length=1, max_length=255)
    store_address: str | None = Field(default=None, max_length=500)


class GenesisResponse(BaseModel):
    success: bool
    message: str
    username: str
    store_code: str


class RestorePreviewRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class RestorePreview(BaseModel):
    stores_count: int
    products_count: int
    transactions_count: int
    last_sync_timestamp: str
    estimated_critical_time_seconds: int
    estimated_total_time_minutes: int


class RestoreStartRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class RestoreStartResponse(BaseModel):
    restore_id: str
    access_token: str


@router.post("/genesis", response_model=GenesisResponse)
@router.post("/admin/genesis", response_model=GenesisResponse, include_in_schema=False)
async def run_genesis(
    body: GenesisRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> GenesisResponse:
    """
    Create the initial admin user, store, and device in the central database.

    This endpoint is designed for the desktop app's first-run genesis wizard.
    It is idempotent: if the username or store code already exists, it updates
    the existing records instead of creating duplicates.

    No authentication is required — this is the bootstrap endpoint.
    """
    now = datetime.now(UTC)
    username = body.username.strip()
    email = body.email.strip()
    full_name = body.full_name.strip()
    role = body.role.strip() or "GLOBAL_ADMIN"
    store_code = body.store_code.strip().upper()
    store_name = body.store_name.strip()
    store_address = (body.store_address or "").strip() or None
    store_id = body.store_id.strip()

    # --- Store ---
    existing_store = await db.execute(select(Store).where(Store.id == store_id))
    existing_store = existing_store.scalar_one_or_none()
    if existing_store:
        existing_store.code = store_code
        existing_store.name = store_name
        existing_store.address = store_address
        existing_store.is_active = True
        existing_store.updated_at = now
        logger.info("[GENESIS] Updated store %s", store_id)
    else:
        # Check unique store code
        code_check = await db.execute(select(Store).where(Store.code == store_code))
        if code_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Store code '{store_code}' already exists",
            )
        existing_store = Store(
            id=store_id,
            code=store_code,
            name=store_name,
            address=store_address,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(existing_store)
        logger.info("[GENESIS] Created store %s (%s)", store_id, store_code)

    await db.flush()

    # --- User ---
    existing_user = await db.execute(select(User).where(User.username == username))
    existing_user = existing_user.scalar_one_or_none()
    if existing_user:
        existing_user.email = email
        existing_user.full_name = full_name
        existing_user.hashed_password = hash_password(body.password)
        existing_user.role = role
        existing_user.assigned_store_id = store_id
        existing_user.is_active = True
        existing_user.is_superuser = role == "GLOBAL_ADMIN"
        existing_user.is_verified = True
        existing_user.updated_at = now
        logger.info("[GENESIS] Updated user %s", username)
    else:
        # Check unique username
        user_check = await db.execute(select(User).where(User.username == username))
        if user_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{username}' already exists",
            )
        existing_user = User(
            username=username,
            email=email,
            full_name=full_name,
            hashed_password=hash_password(body.password),
            role=role,
            assigned_store_id=store_id,
            is_active=True,
            is_superuser=(role == "GLOBAL_ADMIN"),
            is_verified=True,
            created_at=now,
            updated_at=now,
        )
        db.add(existing_user)
        logger.info("[GENESIS] Created user %s (role=%s)", username, role)

    await db.flush()

    # --- Device — ensure WEB-DASHBOARD-DEVICE exists ---
    web_device_id = "WEB-DASHBOARD-DEVICE"
    web_dev = await db.execute(select(Device).where(Device.id == web_device_id))
    web_dev = web_dev.scalar_one_or_none()
    if web_dev:
        web_dev.store_id = store_id
        web_dev.is_active = True
        web_dev.revoked_at = None
        web_dev.revocation_reason = None
    else:
        web_dev = Device(
            id=web_device_id,
            store_id=store_id,
            device_name="Web Management Dashboard",
            is_active=True,
            registered_at=now,
        )
        db.add(web_dev)

    await db.commit()

    return GenesisResponse(
        success=True,
        message="Genesis complete on central server.",
        username=username,
        store_code=store_code,
    )


@router.post("/restore/preview", response_model=RestorePreview)
@router.post("/admin/restore/preview", response_model=RestorePreview, include_in_schema=False)
async def validate_restore_credentials(
    body: RestorePreviewRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> RestorePreview:
    """
    Validate restore credentials and return a real preview of data on the server.

    Checks that the username/password are valid before revealing counts.
    No authentication header required — this is used before the local database is set up.
    """
    from sqlalchemy import func

    from app.core.security import verify_password
    from app.models.inventory_transaction import InventoryTransaction
    from app.models.product import Product

    # Validate credentials
    user_result = await db.execute(select(User).where(User.username == body.username.strip()))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Query real counts from the database
    stores_count = (
        await db.execute(select(func.count()).select_from(Store).where(Store.is_active.is_(True)))
    ).scalar_one() or 0

    products_count = (await db.execute(select(func.count()).select_from(Product))).scalar_one() or 0

    transactions_count = (
        await db.execute(select(func.count()).select_from(InventoryTransaction))
    ).scalar_one() or 0

    estimated_critical_time_seconds = max(15, (products_count + stores_count) // 100)
    estimated_total_time_minutes = max(2, (transactions_count // 1000) + 2)

    return RestorePreview(
        stores_count=stores_count,
        products_count=products_count,
        transactions_count=transactions_count,
        last_sync_timestamp=datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
        estimated_critical_time_seconds=estimated_critical_time_seconds,
        estimated_total_time_minutes=estimated_total_time_minutes,
    )


@router.post("/restore/start", response_model=RestoreStartResponse)
@router.post("/admin/restore/start", response_model=RestoreStartResponse, include_in_schema=False)
async def start_prioritized_restore(
    body: RestoreStartRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> RestoreStartResponse:
    """
    Validate credentials and return a JWT access token for the phased restore.

    The Rust desktop client uses this token to call the authenticated
    GET /api/v1/sync/restore/critical, /important, /background endpoints to
    actually pull and write the data locally.

    No authentication header required — credentials are validated in the body.
    """
    import uuid

    from app.core.security import create_access_token, verify_password

    # Validate credentials
    user_result = await db.execute(select(User).where(User.username == body.username.strip()))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    restore_id = f"restore_{uuid.uuid4().hex[:16]}"
    # Issue a token the restore client can use for the authenticated fetch endpoints.
    # We use a stable device ID so no device row check is triggered in deps.py.
    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role,
        device_id="RESTORE-CLIENT",
    )

    # Ensure the RESTORE-CLIENT device exists so get_current_user won't reject it
    from app.models.device import Device

    now = datetime.now(UTC)
    restore_device_id = "RESTORE-CLIENT"
    dev_result = await db.execute(select(Device).where(Device.id == restore_device_id))
    restore_device = dev_result.scalar_one_or_none()
    if restore_device is None:
        # Find any active store to anchor the device to
        store_result = await db.execute(select(Store).where(Store.is_active.is_(True)).limit(1))
        anchor_store = store_result.scalar_one_or_none()
        if anchor_store:
            restore_device = Device(
                id=restore_device_id,
                store_id=anchor_store.id,
                device_name="Restore Client (temporary)",
                is_active=True,
                registered_at=now,
            )
            db.add(restore_device)
    elif not restore_device.is_active:
        restore_device.is_active = True

    await db.commit()

    logger.info("[RESTORE] Issued restore token %s for user %s", restore_id, body.username)

    return RestoreStartResponse(restore_id=restore_id, access_token=access_token)
