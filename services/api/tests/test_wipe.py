"""
Tests for DELETE /api/v1/products/admin/wipe-all-data (GLOBAL_ADMIN only).

Covers:
  - Happy path: seeded business data exists → wipe succeeds → business
    tables are empty while users + stores are preserved.
  - Login credentials survive: password hash still verifies and a fresh
    device can log in with the same username/password after the wipe.
  - Auth semantics unchanged: non-admin role → 403, wrong store name → 400,
    and neither failure wipes anything.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.day_book import DayBook, DayBookEntry
from app.models.device import Device
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.transfer import Transfer
from app.models.user import User

WIPE_URL = "/api/v1/products/admin/wipe-all-data"
LOGIN_URL = "/api/v1/auth/login"

ADMIN_PASSWORD = "AdminPass123!"


def _uid() -> str:
    return str(uuid.uuid4())


def _admin_headers(
    user_id: int | str, device_id: str, role: str = "GLOBAL_ADMIN"
) -> dict[str, str]:
    token = create_access_token(user_id=str(user_id), role=role, device_id=device_id)
    return {"Authorization": f"Bearer {token}"}


async def _seed_business_data(db: AsyncSession) -> dict:
    """Seed two stores, an admin user, a device, and one row per business table."""
    now = datetime.now(UTC)

    # Deterministic ids so ORDER BY id picks store1 as the "first" store.
    store1 = Store(
        id="00000000-0000-0000-0000-000000000001",
        code="WIPE-01",
        name="Wipe Test Store One",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    store2 = Store(
        id="00000000-0000-0000-0000-000000000002",
        code="WIPE-02",
        name="Wipe Test Store Two",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add_all([store1, store2])
    await db.flush()

    admin = User(
        email="wipe_admin@example.com",
        username="wipe_admin",
        hashed_password=hash_password(ADMIN_PASSWORD),
        role="GLOBAL_ADMIN",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(admin)
    await db.flush()

    device = Device(
        id=_uid(),
        store_id=store1.id,
        device_name="Wipe Test Device",
        is_active=True,
        registered_at=now,
        registered_by_user_id=admin.id,
    )
    db.add(device)
    await db.flush()

    product = Product(
        id=_uid(),
        sku=f"WIPE-SKU-{uuid.uuid4().hex[:8].upper()}",
        name="Wipe Test Widget",
        category="Electronics",
        unit="pcs",
        created_at=now,
        updated_at=now,
    )
    db.add(product)
    await db.flush()

    balance = StockBalance(
        id=_uid(),
        store_id=store1.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        quantity=10,
        updated_at=now,
    )
    db.add(balance)
    await db.flush()

    txn_id = _uid()
    txn = InventoryTransaction(
        transaction_id=txn_id,
        store_id=store1.id,
        product_id=product.id,
        movement_type="RECEIPT",
        stock_bucket="AVAILABLE",
        quantity_delta=10,
        occurred_at=now,
        recorded_at=now,
        user_id=admin.id,
        device_id=device.id,
        sync_status="ACCEPTED",
    )
    db.add(txn)
    await db.flush()

    receipt = SyncReceipt(
        transaction_id=txn_id,
        accepted=True,
        received_at=now,
        processed_at=now,
    )
    db.add(receipt)
    await db.flush()

    day_book = DayBook(
        id=_uid(),
        store_id=store1.id,
        book_date=now,
        opening_balance=0,
        closing_balance=10,
        created_at=now,
        updated_at=now,
    )
    db.add(day_book)
    await db.flush()

    entry = DayBookEntry(
        id=_uid(),
        day_book_id=day_book.id,
        transaction_id=txn_id,
        movement_type="RECEIPT",
        product_id=product.id,
        quantity_delta=10,
        stock_bucket="AVAILABLE",
        occurred_at=now,
        recorded_at=now,
    )
    db.add(entry)
    await db.flush()

    transfer = Transfer(
        id=_uid(),
        source_store_id=store1.id,
        destination_store_id=store2.id,
        product_id=product.id,
        quantity=2,
        status="DRAFT",
        created_by_user_id=str(admin.id),
        created_at=now,
        updated_at=now,
    )
    db.add(transfer)
    await db.flush()

    await db.commit()
    return {"store1": store1, "store2": store2, "admin": admin, "device": device}


async def _count(db: AsyncSession, model) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_wipe_empties_business_preserves_users_stores(
    client: TestClient, db_session: AsyncSession
) -> None:
    """Seeded business rows vanish; users + stores (login credentials) survive."""
    seeded = await _seed_business_data(db_session)
    store1 = seeded["store1"]
    admin = seeded["admin"]
    device = seeded["device"]

    # Pre-condition: business data actually exists.
    assert await _count(db_session, Product) == 1
    assert await _count(db_session, Device) == 1

    headers = _admin_headers(admin.id, device.id)
    resp = client.request(
        "DELETE", WIPE_URL, json={"confirm_store_name": store1.name}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for table in (
        "day_book_entries",
        "day_books",
        "inventory_transactions",
        "stock_balances",
        "transfers",
        "sync_receipts",
        "products",
        "devices",
    ):
        assert table in body["wiped_tables"]

    # The wipe committed through the shared test session with
    # expire_on_commit=False, so expire cached state before asserting.
    db_session.expire_all()

    # Business tables are empty.
    assert await _count(db_session, DayBookEntry) == 0
    assert await _count(db_session, DayBook) == 0
    assert await _count(db_session, InventoryTransaction) == 0
    assert await _count(db_session, StockBalance) == 0
    assert await _count(db_session, Transfer) == 0
    assert await _count(db_session, SyncReceipt) == 0
    assert await _count(db_session, Product) == 0
    assert await _count(db_session, Device) == 0

    # Users preserved — password hash still verifies.
    assert await _count(db_session, User) == 1
    result = await db_session.execute(select(User).where(User.username == "wipe_admin"))
    kept_admin = result.scalars().one()
    assert kept_admin.role == "GLOBAL_ADMIN"
    assert verify_password(ADMIN_PASSWORD, kept_admin.hashed_password)

    # Stores preserved; all but the first are deactivated.
    assert await _count(db_session, Store) == 2
    stores = (await db_session.execute(select(Store))).scalars().all()
    active = [s for s in stores if s.is_active]
    assert len(active) == 1
    assert active[0].name == store1.name

    # Login credentials still work: register a fresh device, then log in.
    now = datetime.now(UTC)
    fresh_device = Device(
        id=_uid(),
        store_id=store1.id,
        device_name="Post-Wipe Device",
        is_active=True,
        registered_at=now,
        registered_by_user_id=kept_admin.id,
    )
    db_session.add(fresh_device)
    await db_session.commit()

    login_resp = client.post(
        LOGIN_URL,
        json={"username": "wipe_admin", "password": ADMIN_PASSWORD, "device_id": fresh_device.id},
    )
    assert login_resp.status_code == 200, login_resp.text
    assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_wipe_requires_global_admin(client: TestClient, db_session: AsyncSession) -> None:
    """STORE_CLERK gets 403 and nothing is wiped."""
    seeded = await _seed_business_data(db_session)
    store1 = seeded["store1"]

    now = datetime.now(UTC)
    clerk = User(
        email="wipe_clerk@example.com",
        username="wipe_clerk",
        hashed_password=hash_password("ClerkPass123!"),
        role="STORE_CLERK",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(clerk)
    await db_session.flush()
    clerk_device = Device(
        id=_uid(),
        store_id=store1.id,
        device_name="Clerk Device",
        is_active=True,
        registered_at=now,
        registered_by_user_id=clerk.id,
    )
    db_session.add(clerk_device)
    await db_session.commit()

    headers = _admin_headers(clerk.id, clerk_device.id, role="STORE_CLERK")
    resp = client.request(
        "DELETE", WIPE_URL, json={"confirm_store_name": store1.name}, headers=headers
    )
    assert resp.status_code == 403

    # Nothing was wiped.
    assert await _count(db_session, Product) == 1
    assert await _count(db_session, User) == 2


@pytest.mark.asyncio
async def test_wipe_rejects_wrong_store_name(client: TestClient, db_session: AsyncSession) -> None:
    """Wrong confirmation name → 400 and nothing is wiped."""
    seeded = await _seed_business_data(db_session)
    admin = seeded["admin"]
    device = seeded["device"]

    headers = _admin_headers(admin.id, device.id)
    resp = client.request(
        "DELETE", WIPE_URL, json={"confirm_store_name": "Not The Store"}, headers=headers
    )
    assert resp.status_code == 400

    assert await _count(db_session, Product) == 1
    assert await _count(db_session, User) == 1


@pytest.mark.asyncio
async def test_wipe_accepts_any_active_store_case_insensitive(
    client: TestClient, db_session: AsyncSession
) -> None:
    """Confirmation matches the desktop client: any active store, any case.

    Regression guard: the desktop confirms against any active store
    case-insensitively, so the server must accept the same — otherwise the
    server wipe 400s (silently, client-side) and the next sync pulls all
    server data back into the freshly wiped pages.
    """
    seeded = await _seed_business_data(db_session)
    store2 = seeded["store2"]
    admin = seeded["admin"]
    device = seeded["device"]

    headers = _admin_headers(admin.id, device.id)
    resp = client.request(
        "DELETE",
        WIPE_URL,
        json={"confirm_store_name": f"  {store2.name.lower()}  "},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    assert await _count(db_session, Product) == 0
    assert await _count(db_session, User) == 1
