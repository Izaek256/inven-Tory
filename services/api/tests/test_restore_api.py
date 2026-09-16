"""
Restore API endpoints tests.

Tests the restore endpoints:
- POST /api/v1/restore/preview (and alias /api/v1/admin/restore/preview)
- POST /api/v1/restore/start (and alias /api/v1/admin/restore/start)
- GET /api/v1/sync/restore/critical and GET /api/v1/restore/critical
- GET /api/v1/sync/restore/important and GET /api/v1/restore/important
- GET /api/v1/sync/restore/background and GET /api/v1/restore/background
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.user import User


def _uid() -> str:
    return str(uuid.uuid4())


async def _seed_test_env(db: AsyncSession) -> tuple[Store, User, Product, InventoryTransaction]:
    now = datetime.now(UTC)
    store = Store(
        id=f"STORE-{_uid()[:8]}",
        code=f"ST-{_uid()[:6].upper()}",
        name="Test Store",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(store)

    user = User(
        email=f"admin_{_uid()[:8]}@example.com",
        username=f"admin_{_uid()[:8]}",
        hashed_password=hash_password("restorepass123"),
        role="GLOBAL_ADMIN",
        assigned_store_id=store.id,
        is_active=True,
        is_superuser=True,
        is_verified=True,
        created_at=now,
        updated_at=now,
    )
    db.add(user)

    product = Product(
        id=f"PROD-{_uid()[:8]}",
        sku=f"SKU-{_uid()[:8].upper()}",
        name="Widget A",
        category="General",
        unit="pcs",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(product)

    balance = StockBalance(
        id=f"SB-{_uid()[:8]}",
        store_id=store.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        quantity=50,
        updated_at=now,
    )
    db.add(balance)

    tx = InventoryTransaction(
        transaction_id=f"tx-{_uid()[:8]}",
        store_id=store.id,
        product_id=product.id,
        movement_type="RECEIPT",
        stock_bucket="AVAILABLE",
        quantity_delta=50,
        occurred_at=now,
        recorded_at=now,
        user_id=str(user.id),
        device_id="RESTORE-CLIENT",
        sync_status="SYNCED",
    )
    db.add(tx)

    await db.commit()
    return store, user, product, tx


@pytest.mark.asyncio
async def test_restore_preview_unauthenticated(client: TestClient, db_session: AsyncSession):
    """Test that restore preview rejects invalid credentials."""
    response = client.post(
        "/api/v1/restore/preview",
        json={"username": "nonexistent_user", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_restore_preview_success(client: TestClient, db_session: AsyncSession):
    """Test successful restore preview returns real DB counts."""
    _, user, _, _ = await _seed_test_env(db_session)

    response = client.post(
        "/api/v1/restore/preview",
        json={"username": user.username, "password": "restorepass123"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["stores_count"] >= 1
    assert data["products_count"] >= 1
    assert data["transactions_count"] >= 1
    assert data["estimated_critical_time_seconds"] > 0
    assert data["estimated_total_time_minutes"] > 0


@pytest.mark.asyncio
async def test_restore_start_success(client: TestClient, db_session: AsyncSession):
    """Test that restore start issues an access_token and restore_id."""
    _, user, _, _ = await _seed_test_env(db_session)

    response = client.post(
        "/api/v1/restore/start",
        json={"username": user.username, "password": "restorepass123"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "restore_id" in data
    assert "access_token" in data
    assert len(data["access_token"]) > 20


@pytest.mark.asyncio
async def test_restore_critical_unauthenticated(client: TestClient):
    """Test that restore critical requires authentication."""
    response = client.get("/api/v1/restore/critical")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_restore_critical_success(client: TestClient, db_session: AsyncSession):
    """Test successful restore critical returns stores, users, products, balances."""
    store, user, product, _ = await _seed_test_env(db_session)

    start_resp = client.post(
        "/api/v1/restore/start",
        json={"username": user.username, "password": "restorepass123"},
    )
    token = start_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test both /restore/critical and /sync/restore/critical
    for path in ("/api/v1/restore/critical", "/api/v1/sync/restore/critical"):
        resp = client.get(path, headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "stores" in data
        assert "users" in data
        assert "products" in data
        assert "stock_balances" in data
        assert "recent_transactions" in data

        store_ids = [s["id"] for s in data["stores"]]
        assert store.id in store_ids

        product_ids = [p["id"] for p in data["products"]]
        assert product.id in product_ids


@pytest.mark.asyncio
async def test_restore_important_and_background(client: TestClient, db_session: AsyncSession):
    """Test important and background restore endpoints."""
    _, user, _, _ = await _seed_test_env(db_session)

    start_resp = client.post(
        "/api/v1/restore/start",
        json={"username": user.username, "password": "restorepass123"},
    )
    token = start_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    imp_resp = client.get("/api/v1/sync/restore/important", headers=headers)
    assert imp_resp.status_code == 200
    imp_data = imp_resp.json()
    assert "recent_history" in imp_data

    bg_resp = client.get("/api/v1/sync/restore/background", headers=headers)
    assert bg_resp.status_code == 200
    bg_data = bg_resp.json()
    assert "historical_transactions" in bg_data
