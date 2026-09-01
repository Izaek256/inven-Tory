"""
Tests for Issue 16 dashboard endpoints.

Covers:
  AT-006: search returns per-store quantities, total, and last-sync time.
  AT-007: a disconnected store is marked STALE/VERY_STALE remotely.

Additional coverage:
  - GET /api/v1/products/search — happy path and empty results.
  - GET /api/v1/products/{id}/inventory — per-store breakdown + total.
  - GET /api/v1/products/{id}/history — movement history rows.
  - GET /api/v1/stores/{id}/inventory — store snapshot with freshness.
  - Freshness classification: FRESH, RECENT, STALE, VERY_STALE.
  - Unauthenticated requests rejected with 401.
  - Unknown product/store returns 404.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.device import Device
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uid() -> str:
    return str(uuid.uuid4())


def _auth_header(user_id: str, device_id: str, role: str = "STORE_MANAGER") -> dict[str, str]:
    token = create_access_token(user_id=user_id, role=role, device_id=device_id)
    return {"Authorization": f"Bearer {token}"}


async def _seed_store(db: AsyncSession, code: str | None = None, name: str = "Test Store") -> Store:
    store = Store(
        id=_uid(),
        code=code or f"S-{uuid.uuid4().hex[:6].upper()}",
        name=name,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(store)
    await db.flush()
    return store


async def _seed_user(db: AsyncSession, role: str = "STORE_MANAGER") -> User:
    user = User(
        id=_uid(),
        username=f"u_{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("pw"),
        role=role,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_device(db: AsyncSession, store_id: str, user_id: str) -> Device:
    device = Device(
        id=_uid(),
        store_id=store_id,
        device_name="POS Terminal",
        is_active=True,
        registered_at=datetime.now(UTC),
        registered_by_user_id=user_id,
    )
    db.add(device)
    await db.flush()
    return device


async def _seed_product(
    db: AsyncSession,
    name: str = "Test Widget",
    sku: str | None = None,
) -> Product:
    product = Product(
        id=_uid(),
        sku=sku or f"SKU-{uuid.uuid4().hex[:8].upper()}",
        name=name,
        category="Electronics",
        unit="pcs",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(product)
    await db.flush()
    return product


async def _seed_balance(
    db: AsyncSession,
    store_id: str,
    product_id: str,
    quantity: int = 100,
    stock_bucket: str = "AVAILABLE",
    updated_ago: timedelta = timedelta(minutes=5),
) -> StockBalance:
    balance = StockBalance(
        id=_uid(),
        store_id=store_id,
        product_id=product_id,
        stock_bucket=stock_bucket,
        quantity=quantity,
        updated_at=datetime.now(UTC) - updated_ago,
    )
    db.add(balance)
    await db.flush()
    return balance


async def _seed_transaction(
    db: AsyncSession,
    store_id: str,
    product_id: str,
    user_id: str,
    device_id: str,
    *,
    quantity_delta: int = 10,
    movement_type: str = "RECEIPT",
    occurred_ago: timedelta = timedelta(minutes=5),
    accepted_ago: timedelta = timedelta(minutes=5),
) -> InventoryTransaction:
    now = datetime.now(UTC)
    tx = InventoryTransaction(
        transaction_id=_uid(),
        store_id=store_id,
        product_id=product_id,
        movement_type=movement_type,
        stock_bucket="AVAILABLE",
        quantity_delta=quantity_delta,
        occurred_at=now - occurred_ago,
        recorded_at=now - accepted_ago,
        user_id=user_id,
        device_id=device_id,
        sync_status="ACCEPTED",
        server_accepted_at=now - accepted_ago,
    )
    db.add(tx)
    await db.flush()
    return tx


# ---------------------------------------------------------------------------
# Product Search — GET /api/v1/products/search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_returns_matching_product(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Search by partial name returns the matching product."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session, name="Hisense 120L Fridge", sku="HIS-120L")
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/products/search", params={"q": "hisense"}, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "hisense"
    assert data["total"] >= 1
    ids = [r["id"] for r in data["results"]]
    assert product.id in ids


@pytest.mark.asyncio
async def test_search_by_sku(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Search by partial SKU returns the matching product."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session, name="Widget A", sku="SRCH-SKU-001")
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/products/search", params={"q": "SRCH-SKU"}, headers=headers)

    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["results"]]
    assert product.id in ids


@pytest.mark.asyncio
async def test_search_no_results(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Search with no match returns empty results list."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/products/search",
        params={"q": "ZZZNOMATCH_XYZABC"},
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.json()["total"] == 0
    assert resp.json()["results"] == []


def test_search_unauthenticated_returns_401(client: TestClient) -> None:
    resp = client.get("/api/v1/products/search", params={"q": "anything"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Product Inventory — GET /api/v1/products/{id}/inventory  (AT-006 partial)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at006_product_inventory_per_store_and_total(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-006: product inventory shows per-store quantities and global total.
    Two stores with known quantities — total must equal the sum.
    """
    user = await _seed_user(db_session)
    store_a = await _seed_store(db_session, code="AT6-A", name="Store Alpha")
    store_b = await _seed_store(db_session, code="AT6-B", name="Store Beta")
    device = await _seed_device(db_session, store_a.id, user.id)
    product = await _seed_product(db_session, name="AT-006 Product")

    await _seed_balance(db_session, store_a.id, product.id, quantity=120)
    await _seed_balance(db_session, store_b.id, product.id, quantity=80)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/products/{product.id}/inventory", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["product_id"] == product.id
    assert data["total_quantity"] == 200  # 120 + 80

    store_ids = [s["store_id"] for s in data["stores"]]
    assert store_a.id in store_ids
    assert store_b.id in store_ids

    qty_by_store = {s["store_id"]: s["quantity"] for s in data["stores"]}
    assert qty_by_store[store_a.id] == 120
    assert qty_by_store[store_b.id] == 80


@pytest.mark.asyncio
async def test_product_inventory_unknown_product_returns_404(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/products/{_uid()}/inventory", headers=headers)
    assert resp.status_code == 404


def test_product_inventory_unauthenticated_returns_401(client: TestClient) -> None:
    resp = client.get(f"/api/v1/products/{_uid()}/inventory")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Product History — GET /api/v1/products/{id}/history  (AT-006 partial)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at006_product_history_returns_movement_rows(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-006: movement history is available for a product.
    Seeds two transactions; both must appear in the history response.
    """
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="HIS-ST", name="History Store")
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session, name="History Product")

    tx1 = await _seed_transaction(
        db_session, store.id, product.id, user.id, device.id, quantity_delta=50
    )
    tx2 = await _seed_transaction(
        db_session,
        store.id,
        product.id,
        user.id,
        device.id,
        quantity_delta=-20,
        movement_type="SALE",
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/products/{product.id}/history", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["product_id"] == product.id
    tx_ids = [r["transaction_id"] for r in data["rows"]]
    assert tx1.transaction_id in tx_ids
    assert tx2.transaction_id in tx_ids


@pytest.mark.asyncio
async def test_product_history_filter_by_store(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """History filtered by store_id only returns rows for that store."""
    user = await _seed_user(db_session)
    store_a = await _seed_store(db_session, code="HA-A")
    store_b = await _seed_store(db_session, code="HA-B")
    device = await _seed_device(db_session, store_a.id, user.id)
    product = await _seed_product(db_session)

    tx_a = await _seed_transaction(
        db_session, store_a.id, product.id, user.id, device.id, quantity_delta=10
    )
    await _seed_transaction(
        db_session, store_b.id, product.id, user.id, device.id, quantity_delta=5
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        f"/api/v1/products/{product.id}/history",
        params={"store_id": store_a.id},
        headers=headers,
    )

    assert resp.status_code == 200
    tx_ids = [r["transaction_id"] for r in resp.json()["rows"]]
    assert tx_a.transaction_id in tx_ids
    # store_b transaction must NOT appear
    for row in resp.json()["rows"]:
        assert row["store_id"] == store_a.id


@pytest.mark.asyncio
async def test_product_history_unknown_product_returns_404(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/products/{_uid()}/history", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Store Inventory — GET /api/v1/stores/{id}/inventory  (AT-006, AT-007)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at006_store_inventory_shows_products_and_last_sync(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-006: store inventory includes product rows and last-sync timestamp.
    A recently-synced store (5 min ago) must be FRESH.
    """
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="AT6-S", name="AT-006 Store")
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session, name="AT-006 Store Product")

    await _seed_balance(db_session, store.id, product.id, quantity=300)
    await _seed_transaction(
        db_session,
        store.id,
        product.id,
        user.id,
        device.id,
        accepted_ago=timedelta(minutes=5),  # synced 5 min ago → FRESH
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{store.id}/inventory", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["store_id"] == store.id
    assert data["freshness"] == "FRESH"
    assert data["last_sync_at"] is not None
    assert data["total_quantity"] == 300

    product_ids = [p["product_id"] for p in data["products"]]
    assert product.id in product_ids


@pytest.mark.asyncio
async def test_at007_disconnected_store_is_stale(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-007: a store that last synced > 24 hours ago is VERY_STALE.
    This directly tests the remote freshness classification for a
    disconnected store.
    """
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="AT7-ST", name="AT-007 Stale Store")
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)

    await _seed_balance(db_session, store.id, product.id, quantity=50)
    # Seed a transaction that was accepted 48 hours ago — simulates disconnected store
    await _seed_transaction(
        db_session,
        store.id,
        product.id,
        user.id,
        device.id,
        accepted_ago=timedelta(hours=48),
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{store.id}/inventory", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["freshness"] == "VERY_STALE"
    assert data["last_sync_at"] is not None


@pytest.mark.asyncio
async def test_store_inventory_never_synced_is_very_stale(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """A store with no accepted transactions has freshness VERY_STALE."""
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="NS-ST", name="Never Synced Store")
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{store.id}/inventory", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["freshness"] == "VERY_STALE"
    assert data["last_sync_at"] is None
    assert data["products"] == []


@pytest.mark.asyncio
async def test_store_inventory_recent_freshness(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """A store synced 3 hours ago is classified RECENT."""
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="REC-ST")
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)

    await _seed_balance(db_session, store.id, product.id, quantity=10)
    await _seed_transaction(
        db_session,
        store.id,
        product.id,
        user.id,
        device.id,
        accepted_ago=timedelta(hours=3),
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{store.id}/inventory", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["freshness"] == "RECENT"


@pytest.mark.asyncio
async def test_store_inventory_stale_freshness(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """A store synced 12 hours ago is classified STALE."""
    user = await _seed_user(db_session)
    store = await _seed_store(db_session, code="STL-ST")
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)

    await _seed_balance(db_session, store.id, product.id, quantity=10)
    await _seed_transaction(
        db_session,
        store.id,
        product.id,
        user.id,
        device.id,
        accepted_ago=timedelta(hours=12),
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{store.id}/inventory", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["freshness"] == "STALE"


@pytest.mark.asyncio
async def test_store_inventory_unknown_store_returns_404(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(f"/api/v1/stores/{_uid()}/inventory", headers=headers)
    assert resp.status_code == 404


def test_store_inventory_unauthenticated_returns_401(client: TestClient) -> None:
    resp = client.get(f"/api/v1/stores/{_uid()}/inventory")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Freshness utility — unit tests
# ---------------------------------------------------------------------------


def test_freshness_fresh() -> None:
    from app.api.v1.stores import compute_freshness

    ts = datetime.now(UTC) - timedelta(minutes=10)
    assert compute_freshness(ts) == "FRESH"


def test_freshness_recent() -> None:
    from app.api.v1.stores import compute_freshness

    ts = datetime.now(UTC) - timedelta(hours=2)
    assert compute_freshness(ts) == "RECENT"


def test_freshness_stale() -> None:
    from app.api.v1.stores import compute_freshness

    ts = datetime.now(UTC) - timedelta(hours=12)
    assert compute_freshness(ts) == "STALE"


def test_freshness_very_stale_by_age() -> None:
    from app.api.v1.stores import compute_freshness

    ts = datetime.now(UTC) - timedelta(hours=48)
    assert compute_freshness(ts) == "VERY_STALE"


def test_freshness_none_is_very_stale() -> None:
    from app.api.v1.stores import compute_freshness

    assert compute_freshness(None) == "VERY_STALE"
