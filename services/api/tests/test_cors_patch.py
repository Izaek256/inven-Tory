"""
Tests for CORS preflight (OPTIONS) and PATCH partial update routes.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/stores",
        "/api/v1/products",
        "/api/v1/sync/pull",
    ],
)
def test_cors_options_preflight(client: TestClient, path: str) -> None:
    """OPTIONS preflight from allowed origins (e.g. desktop port 1420) returns 200 OK."""
    headers = {
        "Origin": "http://localhost:1420",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Type, X-Device-Id",
    }
    resp = client.options(path, headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:1420"
    assert "access-control-allow-methods" in resp.headers


async def test_patch_product_partial_update(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """PATCH /api/v1/products/{id} updates only fields provided in payload."""
    make_store = seed_helpers["make_store"]
    make_user = seed_helpers["make_user"]
    make_device = seed_helpers["make_device"]

    store = await make_store(db_session)
    admin = await make_user(db_session, role="GLOBAL_ADMIN")
    device = await make_device(db_session, store.id, admin.id)

    # Seed product
    product_id = str(uuid.uuid4())
    product = Product(
        id=product_id,
        sku="TEST-SKU-001",
        name="Original Name",
        brand="Original Brand",
        model="V1",
        category="Hardware",
        unit="pcs",
        barcode="1234567890123",
        is_active=True,
    )
    db_session.add(product)
    await db_session.commit()

    # Login to get token
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": admin.username, "password": "secret123", "device_id": device.id},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Partial update: change only name and model
    patch_resp = client.patch(
        f"/api/v1/products/{product_id}",
        json={"name": "Patched Name", "model": "V2"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["id"] == product_id
    assert data["name"] == "Patched Name"
    assert data["model"] == "V2"
    # Unchanged fields
    assert data["sku"] == "TEST-SKU-001"
    assert data["brand"] == "Original Brand"
    assert data["category"] == "Hardware"


async def test_patch_store_partial_update(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """PATCH /api/v1/stores/{id} updates only fields provided in payload."""
    make_store = seed_helpers["make_store"]
    make_user = seed_helpers["make_user"]
    make_device = seed_helpers["make_device"]

    store = await make_store(db_session, name="Old Store Name", address="123 Main St")
    admin = await make_user(db_session, role="GLOBAL_ADMIN")
    device = await make_device(db_session, store.id, admin.id)

    # Login to get token
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": admin.username, "password": "secret123", "device_id": device.id},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Partial update: update name only
    patch_resp = client.patch(
        f"/api/v1/stores/{store.id}",
        json={"name": "New Store Name"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["id"] == store.id
    assert data["name"] == "New Store Name"
    assert data["address"] == "123 Main St"
