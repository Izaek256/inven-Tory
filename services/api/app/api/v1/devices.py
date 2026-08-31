"""
Device registration and revocation endpoints (SRS §17, FR-STORE-003).

POST /api/v1/devices/register  — register a new device against a store.
POST /api/v1/devices/{device_id}/revoke — revoke (deactivate) a device.

Revocation: a revoked device's token is rejected on the very next
authenticated call because get_current_user() in deps.py re-checks
device.is_active on every request.

AT-011 groundwork: every register / revoke action is logged at INFO level
with enough context to produce an audit record once the audit table lands
(Issue 17).  Unauthorized attempts to revoke are logged at WARNING.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.core.permissions import Permission
from app.models.device import Device
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/devices", tags=["devices"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DeviceRegisterRequest(BaseModel):
    store_id: str = Field(..., min_length=1, max_length=36)
    device_name: str = Field(..., min_length=1, max_length=255)
    # Optional hardware fingerprint — allows detecting duplicate registrations
    hardware_id: str | None = Field(default=None, max_length=255)


class DeviceResponse(BaseModel):
    id: str
    store_id: str
    device_name: str
    hardware_id: str | None
    is_active: bool
    registered_at: datetime
    registered_by_user_id: str | None


class RevokeRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class RevokeResponse(BaseModel):
    id: str
    is_active: bool
    revoked_at: datetime
    revocation_reason: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=DeviceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new device to a store",
)
async def register_device(
    body: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_permission(Permission.DEVICE_REGISTER)),  # noqa: B008
) -> DeviceResponse:
    """
    Register a new desktop device to a store.

    Requires: DEVICE_REGISTER permission (STORE_MANAGER and above).

    - The store must exist and be active.
    - If a hardware_id is supplied and a device with that hardware_id already
      exists, the existing registration is returned (idempotent re-registration).
    - The calling user is recorded as registered_by_user_id for the audit trail.
    """
    # Verify store exists and is active
    store_result = await db.execute(select(Store).where(Store.id == body.store_id))
    store: Store | None = store_result.scalars().first()
    if store is None or not store.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found or inactive",
        )

    # Idempotent: if same hardware_id already registered, return existing record
    if body.hardware_id:
        existing_result = await db.execute(
            select(Device).where(Device.hardware_id == body.hardware_id)
        )
        existing: Device | None = existing_result.scalars().first()
        if existing is not None:
            logger.info(
                "DEVICE_REGISTER_IDEMPOTENT device_id=%s hardware_id=%s user_id=%s",
                existing.id,
                body.hardware_id,
                current_user.id,
            )
            return DeviceResponse(
                id=existing.id,
                store_id=existing.store_id,
                device_name=existing.device_name,
                hardware_id=existing.hardware_id,
                is_active=existing.is_active,
                registered_at=existing.registered_at,
                registered_by_user_id=existing.registered_by_user_id,
            )

    # Create new device
    device = Device(
        id=str(uuid.uuid4()),
        store_id=body.store_id,
        device_name=body.device_name,
        hardware_id=body.hardware_id,
        is_active=True,
        registered_at=datetime.now(UTC),
        registered_by_user_id=current_user.id,
    )
    db.add(device)
    await db.flush()

    logger.info(
        "DEVICE_REGISTERED device_id=%s store_id=%s name=%r user_id=%s",
        device.id,
        device.store_id,
        device.device_name,
        current_user.id,
    )

    return DeviceResponse(
        id=device.id,
        store_id=device.store_id,
        device_name=device.device_name,
        hardware_id=device.hardware_id,
        is_active=device.is_active,
        registered_at=device.registered_at,
        registered_by_user_id=device.registered_by_user_id,
    )


@router.post(
    "/{device_id}/revoke",
    response_model=RevokeResponse,
    summary="Revoke (deactivate) a registered device",
)
async def revoke_device(
    device_id: str,
    body: RevokeRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_permission(Permission.DEVICE_REGISTER)),  # noqa: B008
) -> RevokeResponse:
    """
    Revoke a device.  The device's token is rejected on the next call
    because every request re-validates device.is_active.

    Requires: DEVICE_REGISTER permission (STORE_MANAGER and above).

    AT-011: unauthorized revoke attempts are denied and logged.
    """
    result = await db.execute(select(Device).where(Device.id == device_id))
    device: Device | None = result.scalars().first()

    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if not device.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device is already revoked",
        )

    now = datetime.now(UTC)
    device.is_active = False  # type: ignore[assignment]
    device.revocation_reason = body.reason  # type: ignore[assignment]
    device.revoked_at = now  # type: ignore[assignment]
    await db.flush()

    logger.info(
        "DEVICE_REVOKED device_id=%s revoked_by=%s reason=%r",
        device.id,
        current_user.id,
        body.reason,
    )

    return RevokeResponse(
        id=device.id,
        is_active=False,
        revoked_at=now,
        revocation_reason=body.reason,
    )
