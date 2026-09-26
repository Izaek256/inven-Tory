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
    reference_number: str | None = None,
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
        "reference_number": reference_number,
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
            reference_number="RCP-AT003",
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


@pytest.mark.asyncio
async def test_push_with_products_upserts_and_pull_returns_them(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Pushing products via /sync/push upserts them into DB and pull returns them."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    # Push a new product
    product_payload = {
        "id": "PROD-CLIENT-NEW-1",
        "sku": "CLIENT-001",
        "name": "Client Created Product",
        "category": "Electronics",
        "unit": "pcs",
        "is_active": True,
    }

    response = client.post(
        "/api/v1/sync/push",
        json={"events": [], "products": [product_payload]},
        headers=headers,
    )
    assert response.status_code == 200

    # Pull must return the new product with its real name
    pull_res = client.post("/api/v1/sync/pull", headers=headers)
    assert pull_res.status_code == 200
    pulled_prods = pull_res.json()["products"]
    matched = [p for p in pulled_prods if p["id"] == "PROD-CLIENT-NEW-1"]
    assert len(matched) == 1
    assert matched[0]["name"] == "Client Created Product"
    assert matched[0]["sku"] == "CLIENT-001"


@pytest.mark.asyncio
async def test_push_product_name_is_preserved_on_server(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Pushing a product and later updating its name must sync the exact name."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    product_id = "PROD-NAME-SYNC-1"

    # First push — create product with initial name
    product_v1 = {
        "id": product_id,
        "sku": "NAME-SKU-1",
        "name": "Original Name",
        "category": "Electronics",
        "unit": "pcs",
        "is_active": True,
    }
    event_v1 = _tx_item(store.id, product_id, user.id, device.id, quantity_delta=5)

    r1 = client.post(
        "/api/v1/sync/push",
        json={"events": [event_v1], "products": [product_v1]},
        headers=headers,
    )
    assert r1.status_code == 200
    assert r1.json()["accepted_count"] == 1

    prod = await db_session.get(Product, product_id)
    assert prod is not None
    assert prod.name == "Original Name"

    # Second push — update the product name
    product_v2 = {
        "id": product_id,
        "sku": "NAME-SKU-1",
        "name": "Updated Name",
        "category": "Electronics",
        "unit": "pcs",
        "is_active": True,
    }
    event_v2 = _tx_item(
        store.id,
        product_id,
        user.id,
        device.id,
        quantity_delta=3,
        transaction_id=_uid(),
    )

    r2 = client.post(
        "/api/v1/sync/push",
        json={"events": [event_v2], "products": [product_v2]},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["accepted_count"] == 1

    await db_session.refresh(prod)
    assert prod.name == "Updated Name"


@pytest.mark.asyncio
async def test_push_event_for_existing_product_resolves_by_id(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    Pushing an event for a product_id that already exists in the central DB
    must resolve the product by ID without creating an OFFLINE-PROD placeholder.
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
        quantity_delta=5,
    )

    response = client.post(
        "/api/v1/sync/push",
        json={"events": [event]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["accepted_count"] == 1

    # Exactly one product row — the original, not a placeholder
    products = (
        (await db_session.execute(select(Product).where(Product.id == product.id))).scalars().all()
    )
    assert len(products) == 1
    assert not products[0].sku.startswith("OFFLINE-")
    assert not products[0].name.startswith("OFFLINE-PROD-")

    tx = await db_session.get(InventoryTransaction, tx_id)
    assert tx is not None
    assert tx.product_id == product.id


@pytest.mark.asyncio
async def test_push_same_product_and_event_twice_is_idempotent(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """Re-pushing an identical product+event batch must not create duplicates."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    product_payload = {
        "id": "PROD-IDEM-1",
        "sku": "IDEM-SKU",
        "name": "Idempotent Product",
        "category": "Electronics",
        "unit": "pcs",
        "is_active": True,
    }
    tx_id = _uid()
    event_payload = _tx_item(
        store.id,
        product_payload["id"],
        user.id,
        device.id,
        transaction_id=tx_id,
        quantity_delta=5,
    )

    body = {"events": [event_payload], "products": [product_payload]}

    r1 = client.post("/api/v1/sync/push", json=body, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["accepted_count"] == 1

    r2 = client.post("/api/v1/sync/push", json=body, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["accepted_count"] == 1

    products = (
        (await db_session.execute(select(Product).where(Product.id == product_payload["id"])))
        .scalars()
        .all()
    )
    assert len(products) == 1

    txs = (
        (
            await db_session.execute(
                select(InventoryTransaction).where(InventoryTransaction.transaction_id == tx_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(txs) == 1

    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product_payload["id"],
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 5


# ---------------------------------------------------------------------------
# Regression: desktop-initiated transfers carry a transfer_id that does NOT
# exist in the central transfers table (the desktop owns the transfer
# lifecycle and never replicates transfer rows). inventory_transactions must
# accept the ledger events anyway — the old hard FK to transfers.id rejected
# every TRANSFER_OUT/TRANSFER_IN with an IntegrityError, leaving the desktop
# outbox stuck in RETRYABLE_ERROR ("sync no longer working").
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_events_accepted_without_server_side_transfer_row(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    Push a RECEIPT baseline, then a TRANSFER_OUT at the source store and a
    TRANSFER_IN at the destination store whose transfer_id refers to a
    transfer that only exists in the desktop database.

    Both legs must be accepted (previously they were rejected with an
    "inventory_transactions_transfer_id_fkey" IntegrityError) and the final
    balances must be zero-sum: source loses 10, destination gains 10.
    """
    source = await _seed_store(db_session, code="STORE-MAIN")
    dest = await _seed_store(db_session, code="STORE-BRANCH")
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, source.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    server_unknown_transfer_id = _uid()  # only exists in the desktop DB

    baseline = client.post(
        "/api/v1/sync/push",
        json={
            "events": [
                _tx_item(
                    source.id,
                    product.id,
                    user.id,
                    device.id,
                    movement_type="RECEIPT",
                    quantity_delta=51,
                )
            ]
        },
        headers=headers,
    )
    assert baseline.status_code == 200
    assert baseline.json()["accepted_count"] == 1

    transfer = client.post(
        "/api/v1/sync/push",
        json={
            "events": [
                _tx_item(
                    source.id,
                    product.id,
                    user.id,
                    device.id,
                    movement_type="TRANSFER_OUT",
                    quantity_delta=-10,
                    reference_number=f"TRF-DISP-{server_unknown_transfer_id}",
                )
                | {"transfer_id": server_unknown_transfer_id},
                _tx_item(
                    dest.id,
                    product.id,
                    user.id,
                    device.id,
                    movement_type="TRANSFER_IN",
                    quantity_delta=10,
                    reference_number=f"TRF-RECV-{server_unknown_transfer_id}",
                )
                | {"transfer_id": server_unknown_transfer_id},
            ]
        },
        headers=headers,
    )
    assert transfer.status_code == 200
    data = transfer.json()
    assert data["accepted_count"] == 2, f"rejections: {data.get('rejections')}"
    assert data["rejected_count"] == 0

    async def _balance(store_id: str) -> int:
        row = (
            (
                await db_session.execute(
                    select(StockBalance).where(
                        StockBalance.store_id == store_id,
                        StockBalance.product_id == product.id,
                        StockBalance.stock_bucket == "AVAILABLE",
                    )
                )
            )
            .scalars()
            .first()
        )
        return row.quantity if row is not None else 0

    assert await _balance(source.id) == 41  # 51 - 10
    assert await _balance(dest.id) == 10  # 0 + 10

    ledger = (
        (
            await db_session.execute(
                select(InventoryTransaction.store_id).where(
                    InventoryTransaction.transfer_id == server_unknown_transfer_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(ledger) == sorted([source.id, dest.id])


@pytest.mark.asyncio
async def test_resubmit_already_accepted_transaction_returns_accepted(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    Regression: when the ledger already holds a transaction_id (an earlier /
    concurrent submission won) but the stored SyncReceipt is a stale rejected
    one, re-pushing the event must return ACCEPTED — not a retryable
    "Unexpected error: duplicate key … inventory_transactions_pkey" rejection
    that leaves the client outbox stuck in RETRYABLE_ERROR forever.

    Covers the deadlock seen after the transfer FK migration: the desktop
    events were durably accepted (balances correct) yet every re-submission
    collided on the pkey and was mis-labelled a retryable error.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    tx_id = _uid()
    now = datetime.now(UTC)

    # Simulate an acceptance that happened out-of-band: ledger row exists and
    # a stale REJECTED receipt (from a prior "duplicate key" failure) lingers.
    db_session.add(
        InventoryTransaction(
            transaction_id=tx_id,
            store_id=store.id,
            product_id=product.id,
            movement_type="RECEIPT",
            stock_bucket="AVAILABLE",
            quantity_delta=5,
            occurred_at=now,
            recorded_at=now,
            user_id=user.id,
            device_id=device.id,
            sync_status="ACCEPTED",
            server_accepted_at=now,
        )
    )
    db_session.add(
        SyncReceipt(
            transaction_id=tx_id,
            accepted=False,
            rejection_reason=(
                "Unexpected error: duplicate key value violates unique constraint "
                '"inventory_transactions_pkey"'
            ),
            received_at=now,
            processed_at=now,
        )
    )
    await db_session.commit()

    response = client.post(
        "/api/v1/sync/push",
        json={
            "events": [
                _tx_item(
                    store.id,
                    product.id,
                    user.id,
                    device.id,
                    transaction_id=tx_id,
                    quantity_delta=5,
                )
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["accepted_count"] == 1
    assert response.json()["rejected_count"] == 0

    stored = await db_session.get(SyncReceipt, tx_id)
    assert stored is not None
    assert stored.accepted is True
    assert stored.rejection_reason is None


# ---------------------------------------------------------------------------
# Coalescing window unit tests (P0: batch nearby operations before syncing)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_coalescing_window_first_call_does_not_block() -> None:
    """The first call for a key returns immediately (no prior trigger)."""
    from app.api.v1.sync import _CoalescingWindow

    _CoalescingWindow._last_trigger.pop("test-first", None)
    import asyncio as _asyncio

    start = _asyncio.get_event_loop().time()
    await _CoalescingWindow.wait("test-first", window_s=10.0)
    elapsed = _asyncio.get_event_loop().time() - start
    assert elapsed < 1.0, f"first call should not wait, took {elapsed:.3f}s"


@pytest.mark.asyncio
async def test_coalescing_window_second_call_within_window_waits() -> None:
    """A second call inside the window sleeps until the window elapses."""
    from app.api.v1.sync import _CoalescingWindow

    _CoalescingWindow._last_trigger.pop("test-second", None)
    import asyncio as _asyncio

    loop = _asyncio.get_event_loop()

    await _CoalescingWindow.wait("test-second", window_s=0.3)
    first_at = loop.time()

    await _CoalescingWindow.wait("test-second", window_s=0.3)
    second_at = loop.time()

    waited = second_at - first_at
    assert waited >= 0.25, f"second call should wait ~0.3s, waited {waited:.3f}s"


@pytest.mark.asyncio
async def test_coalescing_window_keys_are_independent() -> None:
    """Different keys do not block each other."""
    from app.api.v1.sync import _CoalescingWindow

    _CoalescingWindow._last_trigger.pop("test-key-a", None)
    _CoalescingWindow._last_trigger.pop("test-key-b", None)
    import asyncio as _asyncio

    loop = _asyncio.get_event_loop()

    await _CoalescingWindow.wait("test-key-a", window_s=10.0)
    start_b = loop.time()
    await _CoalescingWindow.wait("test-key-b", window_s=10.0)
    elapsed_b = loop.time() - start_b
    assert elapsed_b < 1.0, f"key b should not wait on key a, took {elapsed_b:.3f}s"


@pytest.mark.asyncio
async def test_coalescing_window_uses_settings_default() -> None:
    """wait() without an explicit window falls back to the setting."""
    from app.api.v1.sync import _CoalescingWindow
    from app.core.config import settings

    assert settings.sync_coalescing_window_s > 0
    _CoalescingWindow._last_trigger.pop("test-default", None)
    import asyncio as _asyncio

    start = _asyncio.get_event_loop().time()
    await _CoalescingWindow.wait("test-default")
    elapsed = _asyncio.get_event_loop().time() - start
    assert elapsed < settings.sync_coalescing_window_s + 1.0


# ---------------------------------------------------------------------------
# gzip transport (compression): request decompression + response compression
# ---------------------------------------------------------------------------


async def test_push_gzipped_request_body_is_accepted(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """
    P2 (optimization plan): the desktop client gzips push payloads
    (Content-Encoding: gzip). The server must gunzip them before JSON
    parsing — without the request-decompression middleware this returns
    422 (invalid JSON) instead of 200.
    """
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    event = _tx_item(store.id, product.id, user.id, device.id, transaction_id=_uid())

    import gzip
    import json

    raw = json.dumps({"events": [event]}).encode()
    compressed = gzip.compress(raw)

    response = client.post(
        "/api/v1/sync/push",
        content=compressed,
        headers={
            **headers,
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["accepted_count"] == 1
    assert data["rejected_count"] == 0


def test_push_invalid_gzip_body_returns_400(client: TestClient) -> None:
    """A body claiming Content-Encoding: gzip but not gzip fails with 400."""
    headers = {"Content-Type": "application/json", "Content-Encoding": "gzip"}
    response = client.post(
        "/api/v1/sync/push",
        content=b"this is not gzip at all",
        headers=headers,
    )
    assert response.status_code == 400
    assert "gzip" in response.json()["detail"].lower()


def test_large_response_is_gzip_compressed(client: TestClient) -> None:
    """
    P2 (optimization plan): sync/pull payloads are gzip-compressed when the
    client advertises support and the body exceeds the 1 KB threshold.
    /openapi.json is a stable >1 KB JSON response for this smoke test.
    """
    response = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
    assert len(response.content) > 1024


def test_small_response_is_not_gzip_compressed(client: TestClient) -> None:
    """Responses below the 1 KB threshold stay uncompressed even with gzip offered."""
    response = client.get("/health", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers


# ---------------------------------------------------------------------------
# P2 (optimization plan): delta sync (`since`) + page limits on /sync/pull
# ---------------------------------------------------------------------------


async def test_pull_delta_sync_returns_only_rows_newer_than_since(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """`since` filters products/stores/balances to updated_at > since (delta sync)."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    old_product = await _seed_product(db_session)
    await db_session.commit()

    # Cursor: strictly after store + old_product rows.
    since = datetime.now(UTC) + timedelta(seconds=1)

    new_product = Product(
        id=_uid(),
        sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
        name="Newer Widget",
        category="Electronics",
        unit="pcs",
        created_at=since,
        updated_at=since + timedelta(seconds=1),
    )
    db_session.add(new_product)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    import urllib.parse

    qs = urllib.parse.quote(since.isoformat())
    response = client.post(f"/api/v1/sync/pull?since={qs}", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()

    product_ids = [p["id"] for p in data["products"]]
    assert new_product.id in product_ids, "row newer than `since` must be returned"
    assert old_product.id not in product_ids, "row older than `since` must be excluded"
    store_ids = [s["id"] for s in data["stores"]]
    assert store.id not in store_ids, "store older than `since` must be excluded"
    # Delta filters apply to the reported totals too.
    assert data["pagination"]["total_products"] == 1


async def test_pull_without_since_returns_full_snapshot(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """No `since` → full snapshot (all rows regardless of updated_at)."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)
    product = await _seed_product(db_session)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)
    response = client.post("/api/v1/sync/pull", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert product.id in [p["id"] for p in data["products"]]
    assert store.id in [s["id"] for s in data["stores"]]


async def test_pull_respects_page_limit_and_offset(
    client: TestClient,
    db_session: AsyncSession,
) -> None:
    """limit/offset page the combined stream without duplication or loss."""
    store = await _seed_store(db_session)
    user = await _seed_user(db_session)
    device = await _seed_device(db_session, store.id, user.id)

    products = []
    for _ in range(5):
        p = Product(
            id=_uid(),
            sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
            name=f"Bulk Widget {uuid.uuid4().hex[:4]}",
            category="Electronics",
            unit="pcs",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db_session.add(p)
        products.append(p)
    await db_session.commit()

    headers = _auth_header(user.id, device.id)

    # Page 1: limit=2.
    r1 = client.post("/api/v1/sync/pull?limit=2&offset=0", headers=headers)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["pagination"]["total_products"] == 5
    assert d1["pagination"]["has_more"] is True
    assert len(d1["products"]) == 2

    # Page 2: offset=2.
    r2 = client.post("/api/v1/sync/pull?limit=2&offset=2", headers=headers)
    d2 = r2.json()
    assert len(d2["products"]) == 2

    # Page 3: offset=4 → last product + the store (combined stream).
    r3 = client.post("/api/v1/sync/pull?limit=2&offset=4", headers=headers)
    d3 = r3.json()
    assert d3["pagination"]["has_more"] is False

    # No product is duplicated or lost across pages.
    seen = (
        [p["id"] for p in d1["products"]]
        + [p["id"] for p in d2["products"]]
        + [p["id"] for p in d3["products"]]
    )
    expected = [p.id for p in products]
    assert sorted(seen) == sorted(expected), f"expected exactly {expected}, got {seen}"
