"""
End-to-end tests for /api/v1/sync/push, /api/v1/sync/pull, /api/v1/sync/status.

Acceptance criteria (Issue 15):
  AT-002: Four days of offline transactions all sync correctly and exactly once
          on reconnect (deduplication, correct final balance).
  AT-003: Pending events synchronise automatically on reconnect; cloud balance
          becomes correct.
  AT-004: Client retries after simulated timeout; server records exactly one
          effect (idempotency end-to-end over HTTP).

Additional coverage:
  - Partial-batch acceptance (SYNC-012): mixed valid/invalid batch.
  - Authentication: unauthenticated push is rejected with 401.
  - Empty batch: rejected with 422 (Pydantic validation).
  - Status endpoint returns ok and correct counts.
  - Pull endpoint returns products and stores.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.device import Device
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uid() -> str:
    return str(uuid.uuid4())


def _tx_item(
    store_id: str,
    product_id: str,
    user_id: int | str,
    device_id: str,
    *,
    transaction_id: str | None = None,
    quantity_delta: int = 10,
    movement_type: str = "RECEIPT",
    stock_bucket: str = "AVAILABLE",
    days_ago: int = 0,
) -> dict:
    occurred_at = datetime.now(UTC) - timedelta(days=days_ago)
    return {
        "transaction_id": transaction_id or _uid(),
        "store_id": store_id,
        "product_id": product_id,
        "movement_type": movement_type,
        "quantity_delta": quantity_delta,
        "occurred_at": occurred_at.isoformat(),
        "user_id": str(user_id),
        "device_id": device_id,
        "stock_bucket": stock_bucket,
    }


async def _seed_store(db: AsyncSession, code: str | None = None) -> Store:
    store = Store(
        id=_uid(),
        code=code or f"S-{uuid.uuid4().hex[:6].upper()}",
        name="Test Store",
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


async def _seed_product(db: AsyncSession) -> Product:
    product = Product(
        id=_uid(),
        sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
        name="Test Widget",
        category="Electronics",
        unit="pcs",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(product)
    await db.flush()
    return product


def _auth_header(user_id: int | str, device_id: str, role: str = "STORE_MANAGER") -> dict:
    token = create_access_token(user_id=str(user_id), role=role, device_id=device_id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# AT-002: Four days of offline transactions all sync correctly, exactly once
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at002_four_days_offline_sync_exactly_once(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-002: Simulate 4 days of offline operation.
    Each day has 10 RECEIPT transactions of quantity 5 = 200 units total.
    All 40 events push successfully on reconnect.
    Balance = 200.  Pushing the same batch a second time does not double-count.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    # Build 4 * 10 = 40 transactions spanning 4 days
    events: list[dict] = []
    for day in range(4):
        for _ in range(10):
            events.append(
                _tx_item(
                    store.id,
                    product.id,
                    user.id,
                    device.id,
                    quantity_delta=5,
                    days_ago=3 - day,  # 3, 2, 1, 0 days ago
                )
            )

    headers = _auth_header(user.id, device.id)

    # First push — all events arrive on reconnect
    response = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["accepted_count"] == 40
    assert data["rejected_count"] == 0
    assert len(data["receipts"]) == 40
    assert all(r["accepted"] for r in data["receipts"])

    # Verify final balance = 200
    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 200

    # Second push with identical events — idempotent, balance unchanged
    response2 = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["accepted_count"] == 40  # idempotent receipts all accepted
    assert data2["rejected_count"] == 0

    await db_session.refresh(balance)
    assert balance.quantity == 200  # still 200 — no double-count


# ---------------------------------------------------------------------------
# AT-003: Pending events sync on reconnect; cloud balance becomes correct
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at003_pending_events_sync_correct_balance(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-003: Simulate offline RECEIPT then SALE, then push on reconnect.
    Net balance = RECEIPT 50 - SALE 20 = 30 units in the cloud.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    receipt_tx_id = _uid()
    sale_tx_id = _uid()

    events = [
        _tx_item(
            store.id,
            product.id,
            user.id,
            device.id,
            transaction_id=receipt_tx_id,
            quantity_delta=50,
            movement_type="RECEIPT",
        ),
        _tx_item(
            store.id,
            product.id,
            user.id,
            device.id,
            transaction_id=sale_tx_id,
            quantity_delta=-20,
            movement_type="SALE",
        ),
    ]

    response = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["accepted_count"] == 2
    assert data["rejected_count"] == 0

    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 30  # 50 - 20


# ---------------------------------------------------------------------------
# AT-004: Client retry after timeout → exactly one effect on the server
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_at004_retry_after_timeout_exactly_one_ledger_row(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    AT-004: The client retries (simulated by sending the same event twice).
    The server must record exactly one ledger row and one receipt.
    Balance must reflect only a single transaction.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    tx_id = _uid()

    event = _tx_item(
        store.id,
        product.id,
        user.id,
        device.id,
        transaction_id=tx_id,
        quantity_delta=15,
    )

    # First attempt — succeeds (simulates original send)
    r1 = client.post("/api/v1/sync/push", json={"events": [event]}, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["accepted_count"] == 1

    # Second attempt — retry after "simulated timeout"
    r2 = client.post("/api/v1/sync/push", json={"events": [event]}, headers=headers)
    assert r2.status_code == 200
    r2_data = r2.json()
    # Server still returns accepted=True (idempotent)
    assert r2_data["accepted_count"] == 1
    assert r2_data["rejected_count"] == 0

    # Exactly one ledger row
    tx_rows = (
        (
            await db_session.execute(
                select(InventoryTransaction).where(InventoryTransaction.transaction_id == tx_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(tx_rows) == 1

    # Exactly one receipt row
    receipt_rows = (
        (await db_session.execute(select(SyncReceipt).where(SyncReceipt.transaction_id == tx_id)))
        .scalars()
        .all()
    )
    assert len(receipt_rows) == 1

    # Balance reflects exactly one +15 delta
    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 15


# ---------------------------------------------------------------------------
# Partial-batch: mixed valid and invalid events in one push
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_partial_batch_mixed_valid_invalid(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    SYNC-012: A batch with one valid event and one zero-delta event must
    partially accept — valid is stored, invalid is rejected, no rollback.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    good_id = _uid()
    bad_id = _uid()

    events = [
        _tx_item(
            store.id, product.id, user.id, device.id, transaction_id=good_id, quantity_delta=7
        ),
        _tx_item(store.id, product.id, user.id, device.id, transaction_id=bad_id, quantity_delta=0),
    ]

    response = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["accepted_count"] == 1
    assert data["rejected_count"] == 1

    receipts_by_id = {r["transaction_id"]: r for r in data["receipts"]}
    assert receipts_by_id[good_id]["accepted"] is True
    assert receipts_by_id[bad_id]["accepted"] is False
    assert receipts_by_id[bad_id]["rejection_reason"] is not None


# ---------------------------------------------------------------------------
# Authentication: unauthenticated push returns 401
# ---------------------------------------------------------------------------


def test_push_unauthenticated_returns_401(client: TestClient) -> None:
    """No bearer token → HTTP 401."""
    response = client.post(
        "/api/v1/sync/push",
        json={
            "events": [
                {
                    "transaction_id": _uid(),
                    "store_id": "STORE-1",
                    "product_id": "PROD-1",
                    "movement_type": "RECEIPT",
                    "quantity_delta": 10,
                    "occurred_at": datetime.now(UTC).isoformat(),
                    "user_id": "USER-1",
                    "device_id": "DEV-1",
                }
            ]
        },
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Empty batch: Pydantic validation returns 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_empty_batch_returns_422(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Pydantic min_length=1 on events rejects an empty array."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    response = client.post("/api/v1/sync/push", json={"events": []}, headers=headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Pull endpoint: returns products and stores
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pull_returns_products_and_stores(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Pull must return at least the seeded product and store."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    response = client.post("/api/v1/sync/pull", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert "products" in data
    assert "stores" in data
    assert "server_time" in data

    product_ids = [p["id"] for p in data["products"]]
    assert product.id in product_ids

    store_ids = [s["id"] for s in data["stores"]]
    assert store.id in store_ids


def test_pull_unauthenticated_returns_401(client: TestClient) -> None:
    """No bearer token → HTTP 401."""
    response = client.post("/api/v1/sync/pull")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_returns_ok(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Status endpoint must return status=ok and numeric counts."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    response = client.get("/api/v1/sync/status", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert "server_time" in data
    assert isinstance(data["receipts_last_24h"], int)
    assert isinstance(data["accepted_last_24h"], int)
    assert isinstance(data["rejected_last_24h"], int)


def test_status_unauthenticated_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/sync/status")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Status counts reflect pushed events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_counts_reflect_recent_push(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """After pushing 3 events, receipts_last_24h should be >= 3."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    events = [
        _tx_item(store.id, product.id, user.id, device.id, quantity_delta=i + 1) for i in range(3)
    ]

    push_resp = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert push_resp.status_code == 200
    assert push_resp.json()["accepted_count"] == 3

    status_resp = client.get("/api/v1/sync/status", headers=headers)
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["receipts_last_24h"] >= 3
    assert data["accepted_last_24h"] >= 3


# ---------------------------------------------------------------------------
# Large batch: verify accepted_count accuracy (SYNC-010)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_large_batch_all_accepted(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Push a batch of 50 events — all unique, all accepted."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    events = [
        _tx_item(store.id, product.id, user.id, device.id, quantity_delta=1) for _ in range(50)
    ]

    response = client.post("/api/v1/sync/push", json={"events": events}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["accepted_count"] == 50
    assert data["rejected_count"] == 0

    # Balance = 50 * 1 = 50
    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 50
