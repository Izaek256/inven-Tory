"""POST /stores placeholder healing + GET /stores placeholder filtering.

Covers the offline-create race: a desktop store created offline syncs its
first transactions before its registration POST lands, so sync ingestion
auto-provisions an "Auto Store (...)" placeholder row. When the real
registration arrives with the same deterministic ID, POST /stores must heal
the placeholder in place (same PK, so attached balances/transactions stay
valid) instead of failing with a 409 on the derived code.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store


async def _login(
    client: TestClient,
    seed_helpers: dict[str, Any],
    db_session: AsyncSession,
) -> dict[str, str]:
    admin = await seed_helpers["make_user"](db_session, role="GLOBAL_ADMIN")
    store = await seed_helpers["make_store"](db_session)
    device = await seed_helpers["make_device"](db_session, store.id, admin.id)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": admin.username, "password": "secret123", "device_id": device.id},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed_placeholder(db_session: AsyncSession, code: str = "MAIN-2") -> Store:
    """Mimic exactly what sync ingestion writes for an unknown store_id."""
    store = Store(
        id=f"STORE-{code}",
        code=code,
        name=f"Auto Store ({code})",
        is_active=True,
    )
    db_session.add(store)
    await db_session.flush()
    return store


async def test_create_store_heals_same_id_placeholder(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """POST with the placeholder's ID adopts it: real name/code, same PK."""
    headers = await _login(client, seed_helpers, db_session)
    placeholder = await _seed_placeholder(db_session, code="MAIN-2")

    # Attach a balance as the early syncs would have — healing must keep it.
    product = Product(
        id=f"PROD-{uuid.uuid4().hex[:8]}",
        sku=f"SKU-{uuid.uuid4().hex[:8]}",
        name="Heater",
        category="General",
        unit="pcs",
    )
    db_session.add(product)
    await db_session.flush()
    db_session.add(
        StockBalance(
            id=str(uuid.uuid4()),
            store_id=placeholder.id,
            product_id=product.id,
            stock_bucket="AVAILABLE",
            quantity=7,
            updated_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    resp = client.post(
        "/api/v1/stores",
        json={"id": placeholder.id, "code": "MAIN-2", "name": "Second Shop"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == placeholder.id
    assert data["code"] == "MAIN-2"
    assert data["name"] == "Second Shop"

    healed = await db_session.get(Store, placeholder.id)
    assert healed is not None
    assert healed.name == "Second Shop"
    balances = (
        (
            await db_session.execute(
                select(StockBalance).where(StockBalance.store_id == placeholder.id)
            )
        )
        .scalars()
        .all()
    )
    assert [b.quantity for b in balances] == [7]

    # And it is no longer filtered out of the store list (the web's 1-vs-2).
    listed = client.get("/api/v1/stores", headers=headers)
    assert listed.status_code == 200
    assert "Second Shop" in [s["name"] for s in listed.json()]


async def test_create_store_heal_rejects_clashing_code(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """Healing must not steal the code of a different real store (409)."""
    headers = await _login(client, seed_helpers, db_session)
    await _seed_placeholder(db_session, code="MAIN-2")
    await seed_helpers["make_store"](db_session, code="OTHER", name="Other Shop")

    resp = client.post(
        "/api/v1/stores",
        json={"id": "STORE-MAIN-2", "code": "OTHER", "name": "Second Shop"},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_create_store_duplicate_real_store_still_409(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """Existing behaviour for real stores is unchanged."""
    headers = await _login(client, seed_helpers, db_session)
    await seed_helpers["make_store"](db_session, code="MAIN", name="Main Shop")

    resp = client.post(
        "/api/v1/stores",
        json={"id": "STORE-MAIN", "code": "MAIN", "name": "Main Shop Again"},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_create_store_normal_create_still_201(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """Ordinary registration is unaffected by the heal path."""
    headers = await _login(client, seed_helpers, db_session)

    resp = client.post(
        "/api/v1/stores",
        json={"id": "STORE-NEW", "code": "NEW", "name": "New Shop"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "New Shop"


async def test_list_stores_excludes_placeholders_by_default(
    client: TestClient,
    db_session: AsyncSession,
    seed_helpers: dict[str, Any],
) -> None:
    """Documents why the web shows fewer stores than synced until healing."""
    headers = await _login(client, seed_helpers, db_session)
    await seed_helpers["make_store"](db_session, code="MAIN", name="Main Shop")
    await _seed_placeholder(db_session, code="MAIN-2")

    default = client.get("/api/v1/stores", headers=headers)
    assert default.status_code == 200
    names = [s["name"] for s in default.json()]
    assert "Main Shop" in names
    assert not any(n.startswith("Auto Store (") for n in names)

    with_placeholders = client.get("/api/v1/stores?include_placeholders=true", headers=headers)
    assert with_placeholders.status_code == 200
    all_names = [s["name"] for s in with_placeholders.json()]
    assert "Main Shop" in all_names
    assert "Auto Store (MAIN-2)" in all_names
