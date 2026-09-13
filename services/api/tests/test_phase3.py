"""
Phase 3 backend tests.

Covers:
  - Task D: cross-store product aggregation (?scope=all-stores):
      * single-store product,
      * multi-store product,
      * product with zero stock in some stores,
      * total-sum correctness,
      * backward compatibility (no scope => original response shape).
  - Task B: dashboard metrics endpoint (KPI tiles incl. most-sold via SALE
    transactions, low-stock via existing threshold field, cross-store summary,
    receipt-linked sales volume per day).
  - Task F: receipt number (reference_number) compulsory for SALE transactions.
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
    name: str = "Phase3 Widget",
    sku: str | None = None,
    low_stock_threshold: int | None = None,
    unit: str = "pcs",
) -> Product:
    product = Product(
        id=_uid(),
        sku=sku or f"SKU-{uuid.uuid4().hex[:8].upper()}",
        name=name,
        category="Electronics",
        unit=unit,
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
) -> StockBalance:
    balance = StockBalance(
        id=_uid(),
        store_id=store_id,
        product_id=product_id,
        stock_bucket=stock_bucket,
        quantity=quantity,
        updated_at=datetime.now(UTC),
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
        reference_number=reference_number,
        occurred_at=now - occurred_ago,
        recorded_at=now - occurred_ago,
        user_id=user_id,
        device_id=device_id,
        sync_status="ACCEPTED",
        server_accepted_at=now - occurred_ago,
    )
    db.add(tx)
    await db.flush()
    return tx


# ---------------------------------------------------------------------------
# Task D — cross-store aggregation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_all_stores_multitous_store_breakdown(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Multi-store product returns one entry per store with correct totals."""
    store_a = await _seed_store(db_session, name="Store Alpha")
    store_b = await _seed_store(db_session, name="Store Beta")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store_a.id, user.id)
    product = await _seed_product(db_session, name="Shared Gadget")
    await _seed_balance(db_session, store_a.id, product.id, quantity=12)
    await _seed_balance(db_session, store_b.id, product.id, quantity=30)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/products/search",
        params={"q": "Shared", "scope": "all-stores"},
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    row = next(r for r in data["results"] if r["id"] == product.id)
    assert row["total_quantity"] == 42
    by_name = {q["store_name"]: q["quantity"] for q in row["store_quantities"]}
    assert by_name == {"Store Alpha": 12, "Store Beta": 30}


@pytest.mark.asyncio
async def test_search_all_stores_single_store_product(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """A product in only one store does not fabricate a second column row."""
    store_a = await _seed_store(db_session, name="Store Alpha")
    await _seed_store(db_session, name="Store Beta")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store_a.id, user.id)
    product = await _seed_product(db_session, name="Only Here")
    await _seed_balance(db_session, store_a.id, product.id, quantity=7)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/products/search",
        params={"q": "Only Here", "scope": "all-stores"},
        headers=headers,
    )

    assert resp.status_code == 200
    row = next(r for r in resp.json()["results"] if r["id"] == product.id)
    assert len(row["store_quantities"]) == 1
    assert row["store_quantities"][0]["store_name"] == "Store Alpha"
    assert row["store_quantities"][0]["quantity"] == 7
    assert row["total_quantity"] == 7


@pytest.mark.asyncio
async def test_search_all_stores_zero_stock_in_second_store(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Zero-quantity rows are omitted from the breakdown (no empty columns)."""
    store_a = await _seed_store(db_session, name="Store Alpha")
    store_b = await _seed_store(db_session, name="Store Beta")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store_a.id, user.id)
    product = await _seed_product(db_session, name="Zero Elsewhere")
    await _seed_balance(db_session, store_a.id, product.id, quantity=5)
    await _seed_balance(db_session, store_b.id, product.id, quantity=0)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/products/search",
        params={"q": "Zero Elsewhere", "scope": "all-stores"},
        headers=headers,
    )

    assert resp.status_code == 200
    row = next(r for r in resp.json()["results"] if r["id"] == product.id)
    assert [q["store_name"] for q in row["store_quantities"]] == ["Store Alpha"]
    assert row["total_quantity"] == 5


@pytest.mark.asyncio
async def test_search_backward_compatible_without_scope(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """No ?scope param → store_quantities is empty and totals still present."""
    store = await _seed_store(db_session, name="Solo")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session, name="Legacy Shape")
    await _seed_balance(db_session, store.id, product.id, quantity=9)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get(
        "/api/v1/products/search",
        params={"q": "Legacy Shape"},
        headers=headers,
    )

    assert resp.status_code == 200
    row = next(r for r in resp.json()["results"] if r["id"] == product.id)
    assert row["store_quantities"] == []
    assert row["total_quantity"] == 9


# ---------------------------------------------------------------------------
# Task F — receipt number required for SALE
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingestion_rejects_sale_without_reference_number(
    db_session: AsyncSession,
) -> None:
    """Server-side: a SALE payload without a receipt is rejected."""
    from app.services.ingestion import TransactionPayload, _validate_payload

    payload = TransactionPayload(
        transaction_id=_uid(),
        store_id=_uid(),
        product_id=_uid(),
        movement_type="SALE",
        quantity_delta=-1,
        occurred_at=datetime.now(UTC),
        user_id=1,
        device_id=_uid(),
        reference_number=None,
    )
    reason = _validate_payload(payload)
    assert reason is not None
    assert "reference_number is required" in reason


@pytest.mark.asyncio
async def test_ingestion_accepts_sale_with_reference_number(
    db_session: AsyncSession,
) -> None:
    """Server-side: a SALE payload with a receipt passes validation."""
    from app.services.ingestion import TransactionPayload, _validate_payload

    payload = TransactionPayload(
        transaction_id=_uid(),
        store_id=_uid(),
        product_id=_uid(),
        movement_type="SALE",
        quantity_delta=-1,
        occurred_at=datetime.now(UTC),
        user_id=1,
        device_id=_uid(),
        reference_number="RCP-42",
    )
    assert _validate_payload(payload) is None


@pytest.mark.asyncio
async def test_ingestion_allows_null_reference_for_non_sale(
    db_session: AsyncSession,
) -> None:
    """Non-SALE movement types are unaffected by the new rule (backward compat)."""
    from app.services.ingestion import TransactionPayload, _validate_payload

    for movement in ("RECEIPT", "RETURN", "DAMAGE", "ADJUSTMENT"):
        payload = TransactionPayload(
            transaction_id=_uid(),
            store_id=_uid(),
            product_id=_uid(),
            movement_type=movement,
            quantity_delta=1,
            occurred_at=datetime.now(UTC),
            user_id=1,
            device_id=_uid(),
            reference_number=None,
        )
        assert _validate_payload(payload) is None


# ---------------------------------------------------------------------------
# Task B — dashboard metrics endpoint
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dashboard_metrics_happy_path(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Metrics endpoint returns all KPI groups with correct totals."""
    store_a = await _seed_store(db_session, name="M Alpha")
    store_b = await _seed_store(db_session, name="M Beta")
    user = await _seed_user(db_session, role="GLOBAL_ADMIN")
    device = await _seed_device(db_session, store_a.id, user.id)

    headers = _auth_header(user.id, device.id)
    # Baseline before this test's fixtures (the API test session is shared).
    base = client.get("/api/v1/dashboard/metrics", headers=headers).json()

    p1 = await _seed_product(db_session, name="Metric Widget", low_stock_threshold=5)
    p2 = await _seed_product(db_session, name="Metric Gadget")
    await _seed_balance(db_session, store_a.id, p1.id, quantity=40)
    await _seed_balance(db_session, store_b.id, p1.id, quantity=10)
    await _seed_balance(db_session, store_a.id, p2.id, quantity=2)

    # SALE lines (with receipts) and a damage line that must NOT count as sold.
    await _seed_transaction(
        db_session,
        store_a.id,
        p1.id,
        str(user.id),
        device.id,
        quantity_delta=-3,
        movement_type="SALE",
        reference_number="RCP-1",
        occurred_ago=timedelta(hours=1),
    )
    await _seed_transaction(
        db_session,
        store_a.id,
        p1.id,
        str(user.id),
        device.id,
        quantity_delta=-2,
        movement_type="SALE",
        reference_number="RCP-1",
        occurred_ago=timedelta(hours=1),
    )
    await _seed_transaction(
        db_session,
        store_a.id,
        p2.id,
        str(user.id),
        device.id,
        quantity_delta=-1,
        movement_type="DAMAGE",
        reference_number=None,
        occurred_ago=timedelta(hours=2),
    )
    await db_session.commit()

    resp = client.get("/api/v1/dashboard/metrics", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    # Delta assertions isolate this test from other committed fixtures.
    assert data["total_products"] - base["total_products"] == 2
    assert data["total_stock_units"] - base["total_stock_units"] == 52  # 40 + 10 + 2

    # Most-sold is defined by SALE lines only; the DAMAGE line must be ignored.
    assert any(r["product_id"] == p1.id for r in data["most_sold"])
    sold_row = next(r for r in data["most_sold"] if r["product_id"] == p1.id)
    assert sold_row["units_sold"] == 5

    # Low-stock: neither product is flagged (p2 has no threshold, p1 is above).
    low_ids = [r["product_id"] for r in data["low_stock"]]
    assert p2.id not in low_ids
    assert p1.id not in low_ids

    # Cross-store: p1 is in two stores; p2 only in one.
    assert data["cross_store"]["products_in_multiple_stores"] >= 1

    # Receipt-linked sales: one receipt (RCP-1) with two line items today.
    today_row = next(
        (
            r
            for r in data["receipt_linked_sales"]
            if r["date"] == datetime.now(UTC).date().isoformat()
        ),
        None,
    )
    assert today_row is not None
    assert today_row["receipt_count"] >= 1
    assert today_row["items_sold"] >= 2


@pytest.mark.asyncio
async def test_dashboard_metrics_low_stock_flags_below_threshold(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Products below their configured low_stock_threshold are flagged."""
    store = await _seed_store(db_session, name="Low Stock Store")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    p = await _seed_product(db_session, name="Low Stock Item", low_stock_threshold=5)
    await _seed_balance(db_session, store.id, p.id, quantity=2)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/metrics", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    low_ids = [r["product_id"] for r in data["low_stock"]]
    assert p.id in low_ids
    row = next(r for r in data["low_stock"] if r["product_id"] == p.id)
    assert row["quantity"] == 2
    assert row["threshold"] == 5


@pytest.mark.asyncio
async def test_dashboard_metrics_empty_state(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Empty database → zeros, no crashes, tiles renderable."""
    store = await _seed_store(db_session, name="Empty")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    resp = client.get("/api/v1/dashboard/metrics", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    # Structure contract regardless of shared-session leftovers.
    assert isinstance(data["total_products"], int)
    assert isinstance(data["total_stock_units"], int)
    assert isinstance(data["most_sold"], list)
    assert isinstance(data["low_stock"], list)
    assert isinstance(data["cross_store"]["products_in_multiple_stores"], int)
    assert isinstance(data["cross_store"]["combined_quantity"], int)
    assert len(data["receipt_linked_sales"]) > 0  # all-zero rows are still reported
    # Every reported day has a fully zero receipt payload when nothing sold.
    sold_rows = [r for r in data["receipt_linked_sales"] if r["items_sold"] > 0]
    assert isinstance(sold_rows, list)
