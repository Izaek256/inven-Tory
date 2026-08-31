"""
Tests for device registration and revocation endpoints.

Covers:
- POST /api/v1/devices/register → 201 created
- POST /api/v1/devices/register same hardware_id → 201 idempotent (same id returned)
- POST /api/v1/devices/register without auth → 403
- POST /api/v1/devices/register STORE_CLERK role → 403
- POST /api/v1/devices/register inactive store → 404
- POST /api/v1/devices/{id}/revoke → 200, device deactivated
- Revoked device token rejected on next authenticated call → 401  (AT-011 / acceptance criterion)
- POST /api/v1/devices/{id}/revoke already revoked → 409
- POST /api/v1/devices/{id}/revoke unknown device → 404
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.device import Device
from app.models.store import Store
from app.models.user import User

REGISTER_URL = "/api/v1/devices/register"


def _revoke_url(device_id: str) -> str:
    return f"/api/v1/devices/{device_id}/revoke"


def _auth_headers(user_id: str, role: str, device_id: str) -> dict[str, str]:
    token = create_access_token(user_id=user_id, role=role, device_id=device_id)
    return {"Authorization": f"Bearer {token}"}


async def _seed_base(
    db: AsyncSession,
    store_code: str,
    username: str,
    role: str = "STORE_MANAGER",
    device_active: bool = True,
) -> tuple[Store, User, Device]:
    """Seed a store + user + one active auth device, flush but don't commit."""
    store = Store(
        id=str(uuid.uuid4()),
        code=store_code,
        name=f"Store {store_code}",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(store)

    user = User(
        id=str(uuid.uuid4()),
        username=username,
        hashed_password=hash_password("pw"),
        role=role,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)

    device = Device(
        id=str(uuid.uuid4()),
        store_id=store.id,
        device_name="Auth Device",
        is_active=device_active,
        registered_at=datetime.now(UTC),
        registered_by_user_id=user.id,
    )
    db.add(device)
    await db.flush()
    return store, user, device


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


async def test_register_device_success(client: TestClient, db_session: AsyncSession) -> None:
    """STORE_MANAGER can register a new device → 201."""
    store, user, auth_device = await _seed_base(db_session, "D01", "mgr_d01")

    resp = client.post(
        REGISTER_URL,
        json={"store_id": store.id, "device_name": "New POS Terminal"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["store_id"] == store.id
    assert body["device_name"] == "New POS Terminal"
    assert body["is_active"] is True
    assert "id" in body


async def test_register_device_idempotent_hardware_id(
    client: TestClient, db_session: AsyncSession
) -> None:
    """Same hardware_id registered twice → same device id returned both times."""
    store, user, auth_device = await _seed_base(db_session, "D02", "mgr_d02")
    hw_id = f"HW-{uuid.uuid4().hex[:12]}"
    headers = _auth_headers(user.id, user.role, auth_device.id)

    resp1 = client.post(
        REGISTER_URL,
        json={"store_id": store.id, "device_name": "Terminal A", "hardware_id": hw_id},
        headers=headers,
    )
    assert resp1.status_code == 201
    first_id = resp1.json()["id"]

    resp2 = client.post(
        REGISTER_URL,
        json={"store_id": store.id, "device_name": "Terminal A v2", "hardware_id": hw_id},
        headers=headers,
    )
    assert resp2.status_code == 201
    assert resp2.json()["id"] == first_id


async def test_register_device_requires_auth(
    client: TestClient,
    db_session: AsyncSession,  # fixture needed for table setup even if unused here
) -> None:
    """No token → 401 (HTTPBearer raises 401 when no Authorization header present)."""
    resp = client.post(
        REGISTER_URL,
        json={"store_id": str(uuid.uuid4()), "device_name": "Ghost"},
    )
    assert resp.status_code == 401


async def test_register_device_clerk_forbidden(
    client: TestClient, db_session: AsyncSession
) -> None:
    """STORE_CLERK does not have DEVICE_REGISTER permission → 403."""
    store, user, auth_device = await _seed_base(db_session, "D03", "clerk_d03", role="STORE_CLERK")

    resp = client.post(
        REGISTER_URL,
        json={"store_id": store.id, "device_name": "Denied"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )
    assert resp.status_code == 403


async def test_register_device_inactive_store(client: TestClient, db_session: AsyncSession) -> None:
    """Registering to an inactive store → 404."""
    _store, user, auth_device = await _seed_base(db_session, "D04", "mgr_d04")

    inactive = Store(
        id=str(uuid.uuid4()),
        code="D04-CLOSED",
        name="Closed Store",
        is_active=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(inactive)
    await db_session.flush()

    resp = client.post(
        REGISTER_URL,
        json={"store_id": inactive.id, "device_name": "Terminal"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------


async def test_revoke_device_success(client: TestClient, db_session: AsyncSession) -> None:
    """STORE_MANAGER can revoke a device → 200, is_active=False."""
    store, user, auth_device = await _seed_base(db_session, "D05", "mgr_d05")

    target = Device(
        id=str(uuid.uuid4()),
        store_id=store.id,
        device_name="Old Terminal",
        is_active=True,
        registered_at=datetime.now(UTC),
        registered_by_user_id=user.id,
    )
    db_session.add(target)
    await db_session.flush()

    resp = client.post(
        _revoke_url(target.id),
        json={"reason": "Lost device"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == target.id
    assert body["is_active"] is False
    assert body["revocation_reason"] == "Lost device"
    assert "revoked_at" in body


async def test_revoked_device_token_rejected(client: TestClient, db_session: AsyncSession) -> None:
    """
    AT-011 acceptance criterion:
    After a device is revoked, any subsequent request bearing its token
    must be rejected with 401.
    """
    store, clerk_user, victim_device = await _seed_base(
        db_session, "D06", "clerk_d06", role="STORE_CLERK"
    )

    # Create an admin who can revoke
    admin = User(
        id=str(uuid.uuid4()),
        username="admin_d06",
        hashed_password=hash_password("pw"),
        role="GLOBAL_ADMIN",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(admin)
    admin_device = Device(
        id=str(uuid.uuid4()),
        store_id=store.id,
        device_name="Admin Device",
        is_active=True,
        registered_at=datetime.now(UTC),
        registered_by_user_id=admin.id,
    )
    db_session.add(admin_device)
    await db_session.flush()

    # Step 1 — revoke victim_device
    revoke_resp = client.post(
        _revoke_url(victim_device.id),
        json={"reason": "Compromised"},
        headers=_auth_headers(admin.id, admin.role, admin_device.id),
    )
    assert revoke_resp.status_code == 200

    # Step 2 — use the now-revoked token; must be rejected
    follow_up = client.post(
        REGISTER_URL,
        json={"store_id": store.id, "device_name": "Should Fail"},
        headers=_auth_headers(clerk_user.id, clerk_user.role, victim_device.id),
    )
    assert follow_up.status_code == 401


async def test_revoke_already_revoked_device(client: TestClient, db_session: AsyncSession) -> None:
    """Revoking an already-revoked device → 409 Conflict."""
    store, user, auth_device = await _seed_base(db_session, "D07", "mgr_d07")

    pre_revoked = Device(
        id=str(uuid.uuid4()),
        store_id=store.id,
        device_name="Already Gone",
        is_active=False,
        registered_at=datetime.now(UTC),
        registered_by_user_id=user.id,
    )
    db_session.add(pre_revoked)
    await db_session.flush()

    resp = client.post(
        _revoke_url(pre_revoked.id),
        json={"reason": "Again"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )
    assert resp.status_code == 409


async def test_revoke_unknown_device(client: TestClient, db_session: AsyncSession) -> None:
    """Revoking a non-existent device → 404."""
    _store, user, auth_device = await _seed_base(db_session, "D08", "mgr_d08")

    resp = client.post(
        _revoke_url(str(uuid.uuid4())),
        json={"reason": "Does not exist"},
        headers=_auth_headers(user.id, user.role, auth_device.id),
    )
    assert resp.status_code == 404
