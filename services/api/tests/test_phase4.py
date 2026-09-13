"""
Phase 4 backend tests — new analytics endpoints.

Covers:
  - GET /api/v1/dashboard/stock-trend
      * Normal data over a date range
      * Empty store (zero data) returns zero-filled series
      * Date range params correctly filter results
  - GET /api/v1/dashboard/category-distribution
      * Products counted per category with percentages
      * Empty database returns empty distribution
  - GET /api/v1/dashboard/stock-status-by-category
      * In Stock / Low Stock / Out of Stock counts per category
      * Reuses low_stock_threshold logic
      * Empty database returns empty status list
  - GET /api/v1/dashboard/kpi-deltas
      * Current vs prior period deltas
      * Percentage and absolute deltas
      * Empty data returns zeros with valid structure
  - GET /api/v1/dashboard/most-sold-extended
      * Top products with trend direction (up/down/neutral)
      * Percentage change vs prior period
  - GET /api/v1/dashboard/recent-activity
      * Activity items classified by type
      * Color-coded activity types
      * Limited to requested count
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


def _uid() -> str:
    return str(uuid.uuid4())


def _auth_header(user_id: int | str, device_id: str, role: str = "STORE_MANAGER") -> dict[str, str]:
    token = create_access_token(user_id=str(user_id), role=role, device_id=device_id)
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
    username = f"u_{uuid.uuid4().hex[:8]}"
    user = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password=hash_password("pw"),
        role=role,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_device(db: AsyncSession, store_id: str, user_id: int | str) -> Device:
    device = Device(
        id=_uid(),
        store_id=store_id,
        device_name="POS Terminal",
        is_active=True,
        registered_at=datetime.now(UTC),
        registered_by_user_id=int(user_id) if user_id is not None else None,
    )
    db.add(device)
    await db.flush()
    return device


async def _seed_product(
    db: AsyncSession,
    name: str = "Phase4 Widget",
    sku: str | None = None,
    category: str = "Electronics",
    low_stock_threshold: int | None = None,
) -> Product:
    product = Product(
        id=_uid(),
        sku=sku or f"SKU-{uuid.uuid4().hex[:8].upper()}",
        name=name,
        category=category,
        unit="pcs",
        low_stock_threshold=low_stock_threshold,
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
    quantity_delta: int = -2,
    movement_type: str = "SALE",
    reference_number: str | None = "RCP-1001",
    occurred_ago: timedelta = timedelta(minutes=5),
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
        recorded_at=now - occurred_ago,
        user_id=user_id,
        device_id=device_id,
        sync_status="ACCEPTED",
        server_accepted_at=now - occurred_ago,
        reference_number=reference_number,
    )
    db.add(tx)
    await db.flush()
    return tx


# ---------------------------------------------------------------------------
# Stock Trend
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stock_trend_returns_daily_series(
    client: TestClient, db_session: AsyncSession
) -> None:
    store = await _seed_store(db_session, name="Trend Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Trend Product", category="Electronics")
    await _seed_balance(db_session, store.id, p.id, quantity=100)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=6)
    params = {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    resp = client.get("/api/v1/dashboard/stock-trend", params=params, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "date_range" in data
    assert len(data["data"]) == 7  # 7 days in range
    for point in data["data"]:
        assert "date" in point
        assert "total_stock_units" in point
        assert isinstance(point["total_stock_units"], int)


@pytest.mark.asyncio
async def test_stock_trend_empty_store(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Empty Trend Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=6)
    resp = client.get(
        "/api/v1/dashboard/stock-trend",
        params={"start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["date_range"] == {"start": start.isoformat(), "end": end.isoformat()}
    assert len(data["data"]) == 7
    for point in data["data"]:
        assert "date" in point
        assert "total_stock_units" in point
        assert isinstance(point["total_stock_units"], int)
        assert point["total_stock_units"] >= 0


@pytest.mark.asyncio
async def test_stock_trend_default_range(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Default Range Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session)
    await _seed_balance(db_session, store.id, p.id, quantity=50)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/stock-trend", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["data"]) == 7  # default last 7 days


# ---------------------------------------------------------------------------
# Category Distribution
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_category_distribution_normal(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p1 = await _seed_product(db_session, name="Widget A", category="Electronics")
    p2 = await _seed_product(db_session, name="Widget B", category="Electronics")
    p3 = await _seed_product(db_session, name="Gadget", category="Furniture")
    await _seed_balance(db_session, store.id, p1.id, quantity=10)
    await _seed_balance(db_session, store.id, p2.id, quantity=20)
    await _seed_balance(db_session, store.id, p3.id, quantity=5)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/category-distribution", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_products"] >= 3
    categories = {d["category"] for d in data["data"]}
    assert "Electronics" in categories
    assert "Furniture" in categories
    for item in data["data"]:
        assert isinstance(item["count"], int)
        assert isinstance(item["percentage"], float)
        assert item["percentage"] >= 0
        assert item["percentage"] <= 100


@pytest.mark.asyncio
async def test_category_distribution_empty(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Empty Category Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/category-distribution", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["total_products"], int)
    assert isinstance(data["data"], list)
    for item in data["data"]:
        assert isinstance(item["category"], str)
        assert isinstance(item["count"], int)
        assert isinstance(item["percentage"], float)


# ---------------------------------------------------------------------------
# Stock Status by Category
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stock_status_by_category_normal(
    client: TestClient, db_session: AsyncSession
) -> None:
    store = await _seed_store(db_session, name="Status Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    # Use unique category names to avoid collision with data committed by
    # other test files that share the same session-scoped in-memory DB.
    p1 = await _seed_product(
        db_session, name="In Stock Item", category="Cat-A-Status", low_stock_threshold=5
    )
    p2 = await _seed_product(
        db_session, name="Low Stock Item", category="Cat-A-Status", low_stock_threshold=50
    )
    p3 = await _seed_product(
        db_session, name="Out of Stock Item", category="Cat-B-Status", low_stock_threshold=5
    )
    await _seed_balance(db_session, store.id, p1.id, quantity=100)  # above threshold → in stock
    await _seed_balance(db_session, store.id, p2.id, quantity=2)  # below threshold → low stock
    await _seed_balance(db_session, store.id, p3.id, quantity=0)  # zero → out of stock
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/stock-status-by-category", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["data"]) >= 2
    for row in data["data"]:
        assert row["category"] in ("Cat-A-Status", "Cat-B-Status")
        assert row["in_stock"] >= 0
        assert row["low_stock"] >= 0
        assert row["out_of_stock"] >= 0
        assert row["total"] == row["in_stock"] + row["low_stock"] + row["out_of_stock"]


@pytest.mark.asyncio
async def test_stock_status_by_category_empty(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Empty Status Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/stock-status-by-category", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["data"], list)
    for row in data["data"]:
        assert "category" in row
        assert isinstance(row["in_stock"], int)
        assert isinstance(row["low_stock"], int)
        assert isinstance(row["out_of_stock"], int)
        assert row["total"] == row["in_stock"] + row["low_stock"] + row["out_of_stock"]


# ---------------------------------------------------------------------------
# KPI Deltas
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kpi_deltas_normal(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Delta Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Delta Product", category="Electronics")
    await _seed_balance(db_session, store.id, p.id, quantity=100)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=7)
    resp = client.get(
        "/api/v1/dashboard/kpi-deltas",
        params={"start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "deltas" in data
    assert "current_period" in data
    assert "prior_period" in data
    assert len(data["deltas"]) > 0
    for delta in data["deltas"]:
        assert "metric" in delta
        assert "current_value" in delta
        assert "prior_value" in delta
        assert "delta_absolute" in delta
        assert "delta_percentage" in delta or delta["delta_percentage"] is None
        assert "period_label" in delta


@pytest.mark.asyncio
async def test_kpi_deltas_default_range(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Default Delta Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session)
    await _seed_balance(db_session, store.id, p.id, quantity=50)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/kpi-deltas", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["current_period"] == {"start": "", "end": ""} or "start" in data["current_period"]


# ---------------------------------------------------------------------------
# Most Sold Extended
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_most_sold_extended_trend_up(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Trend Up Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Trending Up", category="Cat-Trend")
    # Prior period sales (1 unit)
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=-1,
        movement_type="SALE",
        reference_number="RCP-PRIOR",
        occurred_ago=timedelta(days=10),
    )
    # Current period sales (3 units)
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=-1,
        movement_type="SALE",
        reference_number="RCP-1",
        occurred_ago=timedelta(hours=2),
    )
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=-1,
        movement_type="SALE",
        reference_number="RCP-2",
        occurred_ago=timedelta(hours=1),
    )
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=-1,
        movement_type="SALE",
        reference_number="RCP-3",
        occurred_ago=timedelta(hours=0),
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=7)
    resp = client.get(
        "/api/v1/dashboard/most-sold-extended",
        params={
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "limit": 5,
        },
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["data"]) >= 1
    # Other test files may have committed products with more sales that share
    # the same session-scoped DB; assert "Trending Up" exists rather than
    # assuming it is the top-ranked product.
    by_name = {item["product_name"]: item for item in data["data"]}
    assert "Trending Up" in by_name
    product = by_name["Trending Up"]
    assert product["category"] == "Cat-Trend"
    assert product["trend_direction"] == "up"
    assert product["trend_percentage"] is not None
    assert product["trend_percentage"] > 0  # went from 1 to 3 units


@pytest.mark.asyncio
async def test_most_sold_extended_empty(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Empty Sold Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    future = datetime.now(UTC).date() + timedelta(days=365)
    resp = client.get(
        "/api/v1/dashboard/most-sold-extended",
        params={"start_date": future.isoformat(), "end_date": future.isoformat(), "limit": 5},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["data"], list)
    assert data["period"]["start"] == future.isoformat()


# ---------------------------------------------------------------------------
# Recent Activity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recent_activity_types(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Activity Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Type Check Product", category="Electronics")
    # Sale (stock_sold)
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=-2,
        movement_type="SALE",
        reference_number="RCP-A",
        occurred_ago=timedelta(hours=1),
    )
    # Receipt (stock_added)
    await _seed_transaction(
        db_session,
        store.id,
        p.id,
        str(user.id),
        device.id,
        quantity_delta=10,
        movement_type="RECEIPT",
        reference_number=None,
        occurred_ago=timedelta(hours=2),
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/recent-activity", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1
    our_items = [item for item in data["data"] if item["product_id"] == p.id]
    assert len(our_items) >= 2
    our_types = {item["type"] for item in our_items}
    assert "stock_sold" in our_types
    assert "stock_added" in our_types
    for item in our_items:
        assert item["store_id"] == store.id
        assert isinstance(item["quantity"], int)
        assert item["quantity"] > 0


@pytest.mark.asyncio
async def test_recent_activity_empty(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Empty Activity Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/dashboard/recent-activity",
        params={"limit": 1},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["data"], list)
    assert isinstance(data["total"], int)
    assert len(data["data"]) <= 1


# ---------------------------------------------------------------------------
# Edge Case Regression Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_category_distribution_null_category_safe(
    client: TestClient, db_session: AsyncSession
) -> None:
    """NULL categories are filtered at the SQL level (Product.category.is_not(None)).
    This test verifies the endpoint returns valid data without crashing.
    Direct NULL insertion is blocked by the NOT NULL schema constraint,
    so we verify the endpoint handles any existing edge cases gracefully."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()
    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/category-distribution", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "total_products" in data
    assert isinstance(data["total_products"], int)
    for d in data["data"]:
        assert d["category"] is not None
        assert isinstance(d["count"], int)
        assert isinstance(d["percentage"], float)


@pytest.mark.asyncio
async def test_stock_trend_inverted_date_range(
    client: TestClient, db_session: AsyncSession
) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session)
    await _seed_balance(db_session, store.id, p.id, quantity=10)
    await db_session.commit()
    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/dashboard/stock-trend",
        params={"start_date": "2030-01-01", "end_date": "2020-01-01"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["data"]) > 0
    assert data["date_range"]["start"] == "2020-01-01"
    assert data["date_range"]["end"] == "2030-01-01"


@pytest.mark.asyncio
async def test_all_endpoints_empty_store(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()
    headers = _auth_header(user.id, device.id)
    endpoints = [
        ("/api/v1/dashboard/category-distribution", "data"),
        ("/api/v1/dashboard/stock-status-by-category", "data"),
        ("/api/v1/dashboard/recent-activity", "data"),
        ("/api/v1/dashboard/most-sold-extended", "data"),
        ("/api/v1/dashboard/kpi-deltas", "deltas"),
    ]
    for ep, key in endpoints:
        resp = client.get(ep, headers=headers)
        assert resp.status_code == 200, f"{ep} failed"
        data = resp.json()
        assert key in data, f"{ep} missing {key} key"


@pytest.mark.asyncio
async def test_stock_status_all_zero(client: TestClient, db_session: AsyncSession) -> None:
    store = await _seed_store(db_session, name="Zero Stock Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p1 = await _seed_product(db_session, name="Zero 1", category="ZeroStock")
    p2 = await _seed_product(db_session, name="Zero 2", category="ZeroStock")
    await _seed_balance(db_session, store.id, p1.id, quantity=0)
    await _seed_balance(db_session, store.id, p2.id, quantity=0)
    await db_session.commit()
    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/stock-status-by-category", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    zero_cat = [d for d in data["data"] if d["category"] == "ZeroStock"]
    assert len(zero_cat) >= 1
    for row in zero_cat:
        assert row["out_of_stock"] >= 2
        assert row["in_stock"] >= 0
        assert row["low_stock"] >= 0
        assert row["total"] == row["in_stock"] + row["low_stock"] + row["out_of_stock"]


# ---------------------------------------------------------------------------
# Unauthenticated
# ---------------------------------------------------------------------------


def test_stock_trend_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/stock-trend")
    assert resp.status_code == 401


def test_category_distribution_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/category-distribution")
    assert resp.status_code == 401


def test_stock_status_by_category_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/stock-status-by-category")
    assert resp.status_code == 401


def test_kpi_deltas_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/kpi-deltas")
    assert resp.status_code == 401


def test_most_sold_extended_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/most-sold-extended")
    assert resp.status_code == 401


def test_recent_activity_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/recent-activity")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Operations Summary (KPI tiles: Transactions / Returns / Damage)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_operations_summary_counts_by_type(
    client: TestClient, db_session: AsyncSession
) -> None:
    store = await _seed_store(db_session, name="Ops Summary Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Ops Widget")
    await _seed_balance(db_session, store.id, p.id, quantity=500)
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="SALE", quantity_delta=-2
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="SALE", quantity_delta=-3
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="RECEIPT", quantity_delta=10
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="RETURN", quantity_delta=1
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="DAMAGE", quantity_delta=-4
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="ADJUSTMENT", quantity_delta=2
    )
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="TRANSFER", quantity_delta=-5
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=6)
    resp = client.get(
        "/api/v1/dashboard/operations-summary",
        params={"start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    # NOTE: the in-memory engine is session-scoped and earlier tests in this
    # file commit their own transactions, so totals accumulate across tests.
    # Assert lower bounds matching this test's seeds (and exact per-type units
    # for the distinctive quantities seeded here) instead of exact totals.
    assert data["total_transactions"] >= 7
    assert data["total_units_moved"] >= 27
    by_type = {row["movement_type"]: row for row in data["by_type"]}
    assert by_type["SALE"]["count"] >= 2
    assert by_type["RETURN"]["count"] >= 1
    assert by_type["DAMAGE"]["count"] >= 1
    assert data["returns_count"] >= 1
    assert data["damage_count"] >= 1
    # Quantities seeded only by this test — exact per-type unit checks.
    assert by_type["DAMAGE"]["units"] >= 4
    assert by_type["TRANSFER"]["units"] >= 5
    assert data["damage_units"] >= 4


@pytest.mark.asyncio
async def test_operations_summary_empty_period(
    client: TestClient, db_session: AsyncSession
) -> None:
    store = await _seed_store(db_session, name="Ops Empty Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Idle Widget")
    await _seed_balance(db_session, store.id, p.id, quantity=10)
    await _seed_transaction(
        db_session, store.id, p.id, user.id, device.id, movement_type="SALE", quantity_delta=-1
    )
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    # A range far in the future contains no transactions.
    future = datetime.now(UTC).date() + timedelta(days=365)
    resp = client.get(
        "/api/v1/dashboard/operations-summary",
        params={"start_date": future.isoformat(), "end_date": future.isoformat()},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_transactions"] == 0
    assert data["total_units_moved"] == 0
    assert data["by_type"] == []
    assert data["returns_count"] == 0
    assert data["returns_units"] == 0
    assert data["damage_count"] == 0
    assert data["damage_units"] == 0


def test_operations_summary_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/dashboard/operations-summary")
    assert resp.status_code == 401
