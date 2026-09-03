"""
Tests for authentication endpoints — Issue 25 (SRS §15.1/15.2, AT-011).

Covers:
  POST /api/v1/auth/login
    - Happy path: valid credentials + active device → 200 + tokens + profile fields
    - Wrong password → 401
    - Unknown username → 401
    - Inactive user → 401
    - Revoked device → 401
    - Missing required fields → 422

  POST /api/v1/auth/refresh
    - Valid refresh token → 200 + new access token
    - Garbage token → 401

  GET /api/v1/auth/me
    - Authenticated → 200 + profile
    - No token → 401 (via Bearer guard)

  POST /api/v1/auth/register
    - GLOBAL_ADMIN can create a user → 201
    - Non-admin role → 403

  POST /api/v1/auth/change-password
    - Correct current password → 200
    - Wrong current password → 400

  POST /api/v1/auth/logout
    - Authenticated → 200

  AT-011: unauthorized admin operation denied and logged (verified via 403 response)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.store import Store
from app.models.user import User

LOGIN_URL = "/api/v1/auth/login"  # Use custom login endpoint
REFRESH_URL = "/api/v1/auth/refresh"
ME_URL = "/api/v1/auth/me"  # Use custom endpoint
REGISTER_URL = "/api/v1/auth/register"
CHANGE_PASSWORD_URL = "/api/v1/auth/change-password"
LOGOUT_URL = "/api/v1/auth/logout"  # Use custom endpoint

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Seed helpers
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
    assigned_store_id: str | None = None,
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
    await db.flush()  # flush store first so store.id is available

    user = User(
        # id omitted — SQLite autoincrement assigns it on flush
        email=f"{username}@example.com",
        username=username,
        hashed_password=pwd_context.hash(password),
        role=user_role,
        is_active=user_active,
        assigned_store_id=assigned_store_id or store.id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()  # flush user so user.id is populated

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


def _auth_headers(
    client: TestClient, username: str, password: str, device_id: str
) -> dict[str, str]:
    # Use our custom login endpoint which issues device-verified tokens that
    # get_current_user can decode directly (custom JWT, not FastAPI Users JWT).
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "device_id": device_id},
    )
    assert resp.status_code == 200, resp.json()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------


async def test_login_success(client: TestClient, db_session: AsyncSession) -> None:
    """Valid credentials + active device → 200 with both tokens and profile fields."""
    _store, _user, device = await _seed(
        db_session,
        store_code="A01",
        username="alice",
        password="correct",
        user_role="STORE_MANAGER",
    )
    resp = client.post(
        LOGIN_URL, json={"username": "alice", "password": "correct", "device_id": device.id}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["role"] == "STORE_MANAGER"
    # Issue 25: profile fields in login response
    assert body["username"] == "alice"
    assert "user_id" in body
    assert "assigned_store_id" in body


async def test_login_wrong_password(client: TestClient, db_session: AsyncSession) -> None:
    _s, _u, device = await _seed(db_session, store_code="A02", username="bob", password="real")
    resp = client.post(
        LOGIN_URL, json={"username": "bob", "password": "wrong", "device_id": device.id}
    )
    assert resp.status_code == 401


async def test_login_unknown_user(client: TestClient, db_session: AsyncSession) -> None:
    resp = client.post(
        LOGIN_URL, json={"username": "nobody", "password": "x", "device_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 401


async def test_login_inactive_user(client: TestClient, db_session: AsyncSession) -> None:
    _s, _u, device = await _seed(
        db_session, store_code="A03", username="charlie", password="pw", user_active=False
    )
    resp = client.post(
        LOGIN_URL, json={"username": "charlie", "password": "pw", "device_id": device.id}
    )
    assert resp.status_code == 401


async def test_login_revoked_device(client: TestClient, db_session: AsyncSession) -> None:
    _s, _user, device = await _seed(
        db_session, store_code="A04", username="dave", password="pw", device_active=False
    )
    resp = client.post(
        LOGIN_URL, json={"username": "dave", "password": "pw", "device_id": device.id}
    )
    assert resp.status_code == 401


def test_login_missing_fields(client: TestClient) -> None:
    resp = client.post(LOGIN_URL, json={"username": "x"})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /refresh
# ---------------------------------------------------------------------------


async def test_refresh_success(client: TestClient, db_session: AsyncSession) -> None:
    """Valid refresh token → 200 with new access token."""
    _s, _u, device = await _seed(
        db_session, store_code="B01", username="refresh_user", password="pw123"
    )
    login_resp = client.post(
        LOGIN_URL, json={"username": "refresh_user", "password": "pw123", "device_id": device.id}
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    resp = client.post(REFRESH_URL, json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "role" in body


def test_refresh_invalid_token(client: TestClient) -> None:
    """Garbage token → 401."""
    resp = client.post(REFRESH_URL, json={"refresh_token": "not.a.jwt"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------


async def test_me_authenticated(client: TestClient, db_session: AsyncSession) -> None:
    """Authenticated → 200 with profile."""
    _s, _u, device = await _seed(
        db_session, store_code="C01", username="me_user", password="pw", user_role="STORE_MANAGER"
    )
    # Use custom login endpoint for device verification
    login_resp = client.post(
        "/api/v1/auth/login", json={"username": "me_user", "password": "pw", "device_id": device.id}
    )
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    resp = client.get(ME_URL, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "me_user@example.com"


def test_me_unauthenticated(client: TestClient) -> None:
    """No token → 401 (our custom endpoint requires auth)."""
    resp = client.get(ME_URL)
    assert resp.status_code == 401  # Should be 401, not 404


# ---------------------------------------------------------------------------
# POST /register — AT-011
# ---------------------------------------------------------------------------


async def test_register_by_global_admin(client: TestClient, db_session: AsyncSession) -> None:
    """GLOBAL_ADMIN can register a new user (AT-011: authorized op succeeds)."""
    _s, _u, device = await _seed(
        db_session, store_code="D01", username="admin_reg", password="pw", user_role="GLOBAL_ADMIN"
    )
    headers = _auth_headers(client, "admin_reg", "pw", device.id)
    resp = client.post(
        REGISTER_URL,
        json={
            "username": "new_clerk",
            "email": "new_clerk@example.com",
            "password": "Secure1234!",
            "role": "STORE_CLERK",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "new_clerk"
    assert body["role"] == "STORE_CLERK"
    assert "id" in body


async def test_register_denied_non_admin(client: TestClient, db_session: AsyncSession) -> None:
    """Non-admin role → 403 (AT-011: unauthorized op denied)."""
    _s, _u, device = await _seed(
        db_session, store_code="D02", username="mgr_reg", password="pw", user_role="STORE_MANAGER"
    )
    headers = _auth_headers(client, "mgr_reg", "pw", device.id)
    resp = client.post(
        REGISTER_URL,
        json={
            "username": "sneaky_clerk",
            "email": "sneaky_clerk@example.com",
            "password": "Secure1234!",
            "role": "STORE_CLERK",
        },
        headers=headers,
    )
    assert resp.status_code == 403


async def test_register_duplicate_username(client: TestClient, db_session: AsyncSession) -> None:
    """Duplicate username → 409 Conflict."""
    _s, _u, device = await _seed(
        db_session, store_code="D03", username="admin_dup", password="pw", user_role="GLOBAL_ADMIN"
    )
    headers = _auth_headers(client, "admin_dup", "pw", device.id)
    # First create succeeds
    resp1 = client.post(
        REGISTER_URL,
        json={"username": "dup_name", "email": "dup@example.com", "password": "Secure1234!"},
        headers=headers,
    )
    assert resp1.status_code == 201
    # Second create with same username → 409
    resp2 = client.post(
        REGISTER_URL,
        json={"username": "dup_name", "email": "dup2@example.com", "password": "Secure5678!"},
        headers=headers,
    )
    assert resp2.status_code == 409


# ---------------------------------------------------------------------------
# POST /change-password
# ---------------------------------------------------------------------------


async def test_change_password_success(client: TestClient, db_session: AsyncSession) -> None:
    _s, _u, device = await _seed(
        db_session, store_code="E01", username="chg_pw_user", password="oldpass123"
    )
    headers = _auth_headers(client, "chg_pw_user", "oldpass123", device.id)
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": "oldpass123", "new_password": "newpass456"},
        headers=headers,
    )
    assert resp.status_code == 200


async def test_change_password_wrong_current(client: TestClient, db_session: AsyncSession) -> None:
    _s, _u, device = await _seed(
        db_session, store_code="E02", username="chg_wrong", password="correct"
    )
    headers = _auth_headers(client, "chg_wrong", "correct", device.id)
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": "wrong_pw", "new_password": "newpass456"},
        headers=headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /logout
# ---------------------------------------------------------------------------


async def test_logout_success(client: TestClient, db_session: AsyncSession) -> None:
    _s, _u, device = await _seed(
        db_session, store_code="F01", username="logout_user", password="pw"
    )
    headers = _auth_headers(client, "logout_user", "pw", device.id)
    resp = client.post(LOGOUT_URL, headers=headers)
    assert resp.status_code == 200
    assert "message" in resp.json()


def test_logout_unauthenticated(client: TestClient) -> None:
    resp = client.post(LOGOUT_URL)
    assert resp.status_code == 401  # Our custom endpoint returns 401


# ---------------------------------------------------------------------------
# Property 4: GET /api/v1/stores authentication gate
# ---------------------------------------------------------------------------


async def test_stores_endpoint_requires_authentication(
    client: TestClient, db_session: AsyncSession
) -> None:
    """GET /api/v1/stores returns 401 when no authentication token is provided (Property 4)."""
    resp = client.get("/api/v1/stores")
    assert resp.status_code == 401


async def test_stores_endpoint_authenticated_succeeds(
    client: TestClient, db_session: AsyncSession
) -> None:
    """GET /api/v1/stores returns 200 with valid authentication token (Property 4)."""
    _s, _u, device = await _seed(
        db_session, store_code="G01", username="stores_user", password="pw", user_role="STORE_MANAGER"
    )
    headers = _auth_headers(client, "stores_user", "pw", device.id)
    resp = client.get("/api/v1/stores", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    # Should return at least the seeded store
    assert len(body) >= 1
