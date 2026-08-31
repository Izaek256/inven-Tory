"""
Tests for POST /api/v1/auth/login.

Covers:
- Happy path: valid credentials + active device → 200 + tokens
- Wrong password → 401
- Unknown username → 401
- Inactive user → 401
- Revoked device → 401
- Missing required fields → 422
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.device import Device
from app.models.store import Store
from app.models.user import User

LOGIN_URL = "/api/v1/auth/login"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed(
    db: AsyncSession,
    *,
    store_code: str,
    username: str,
    password: str = "pw",
    user_role: str = "STORE_CLERK",
    user_active: bool = True,
    device_active: bool = True,
) -> tuple[Store, User, Device]:
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
        hashed_password=hash_password(password),
        role=user_role,
        is_active=user_active,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)

    device = Device(
        id=str(uuid.uuid4()),
        store_id=store.id,
        device_name="Test Device",
        is_active=device_active,
        registered_at=datetime.now(UTC),
        registered_by_user_id=user.id,
    )
    db.add(device)
    await db.flush()
    return store, user, device


# ---------------------------------------------------------------------------
# Tests  (asyncio_mode=auto — no @pytest.mark.asyncio needed)
# ---------------------------------------------------------------------------


async def test_login_success(client: TestClient, db_session: AsyncSession) -> None:
    """Valid credentials + active device → 200 with both token types."""
    _store, _user, device = await _seed(
        db_session,
        store_code="A01",
        username="alice",
        password="correct",
        user_role="STORE_MANAGER",
    )

    resp = client.post(
        LOGIN_URL,
        json={"username": "alice", "password": "correct", "device_id": device.id},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["role"] == "STORE_MANAGER"


async def test_login_wrong_password(client: TestClient, db_session: AsyncSession) -> None:
    """Wrong password → 401."""
    _s, _u, device = await _seed(db_session, store_code="A02", username="bob", password="real")

    resp = client.post(
        LOGIN_URL,
        json={"username": "bob", "password": "wrong", "device_id": device.id},
    )
    assert resp.status_code == 401


async def test_login_unknown_user(
    client: TestClient,
    db_session: AsyncSession,  # fixture needed for db setup even if unused here
) -> None:
    """Non-existent username → 401."""
    resp = client.post(
        LOGIN_URL,
        json={"username": "nobody", "password": "x", "device_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 401


async def test_login_inactive_user(client: TestClient, db_session: AsyncSession) -> None:
    """Inactive user account → 401."""
    _s, _u, device = await _seed(
        db_session,
        store_code="A03",
        username="charlie",
        password="pw",
        user_active=False,
    )

    resp = client.post(
        LOGIN_URL,
        json={"username": "charlie", "password": "pw", "device_id": device.id},
    )
    assert resp.status_code == 401


async def test_login_revoked_device(client: TestClient, db_session: AsyncSession) -> None:
    """Revoked device (is_active=False) → 401 at login time."""
    _s, _user, device = await _seed(
        db_session,
        store_code="A04",
        username="dave",
        password="pw",
        device_active=False,
    )

    resp = client.post(
        LOGIN_URL,
        json={"username": "dave", "password": "pw", "device_id": device.id},
    )
    assert resp.status_code == 401


def test_login_missing_fields(client: TestClient) -> None:
    """Missing required fields → 422 Unprocessable Entity."""
    resp = client.post(LOGIN_URL, json={"username": "x"})
    assert resp.status_code == 422
