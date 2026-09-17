"""
DEV-ONLY API performance benchmark.

Boots the FastAPI app against an in-memory SQLite database (same machinery as
the pytest suite), seeds a realistically-sized catalogue + ledger with batched
inserts, then times the endpoints that were optimized during the perf phase:

  - POST /api/v1/sync/pull   (full snapshot, paginated, delta `since`)
  - GET  /api/v1/transactions (store-filtered list + count)
  - GET  /api/v1/dashboard/metrics
  - GET  /api/v1/dashboard/stock-trend
  - GET  /api/v1/dashboard/most-sold-extended
  - GET  /api/v1/dashboard/operations-summary

Run from the repo root:
    python infra/perf/api_benchmark.py            # default scale
    python infra/perf/api_benchmark.py --products 20000 --transactions 100000
    python infra/perf/api_benchmark.py --json      # machine-readable output

WARNING: dev-only tooling.  Never imported from shipped app code.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from passlib.context import CryptContext
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.security import create_access_token
from app.db import Base, get_db
from app.main import app
from app.models import (
    Device,
    InventoryTransaction,
    Product,
    StockBalance,
    Store,
    User,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _auth_header(user_id: int, device_id: str) -> dict[str, str]:
    token = create_access_token(user_id=str(user_id), role="GLOBAL_ADMIN", device_id=device_id)
    return {"Authorization": f"Bearer {token}"}


def _ms(start: float, end: float) -> str:
    return f"{(end - start) * 1000:.1f} ms"


async def _seed(
    engine: AsyncEngine,
    n_products: int,
    n_stores: int,
    n_transactions: int,
) -> tuple[int, str]:
    """Batched bulk seed. Returns (admin_user_id, device_id)."""
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        now = datetime.now(UTC)

        stores = [
            {
                "id": f"STORE-{i:05d}",
                "code": f"S{i:05d}",
                "name": f"Store {i:05d}",
                "address": f"{i} Test Ave",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for i in range(n_stores)
        ]
        await session.execute(insert(Store), stores)

        admin = User(
            email="bench@inventory.local",
            username="bench_admin",
            hashed_password=pwd_context.hash("bench-pass"),
            role="GLOBAL_ADMIN",
            is_active=True,
            is_superuser=True,
            is_verified=True,
            created_at=now,
            updated_at=now,
        )
        session.add(admin)
        await session.flush()

        device = Device(
            id="BENCH-DEVICE",
            store_id="STORE-00000",
            device_name="Benchmark",
            is_active=True,
            registered_at=now,
            registered_by_user_id=admin.id,
        )
        session.add(device)

        products = [
            {
                "id": f"PROD-{i:07d}",
                "sku": f"SKU-{i:07d}",
                "name": f"Benchmark Product {i:07d}",
                "brand": "Bench",
                "model": f"M{i:05d}",
                "category": "Electronics",
                "unit": "pcs",
                "barcode": f"BAR{i:07d}",
                "alternate_names": None,
                "serial_tracking_enabled": False,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for i in range(n_products)
        ]
        await session.execute(insert(Product), products)

        balances = [
            {
                "id": f"SB-{i:07d}",
                "store_id": f"STORE-{i % n_stores:05d}",
                "product_id": f"PROD-{i:07d}",
                "stock_bucket": "AVAILABLE",
                "quantity": (i % 97) + 1,
                "updated_at": now,
            }
            for i in range(n_products)
        ]
        await session.execute(insert(StockBalance), balances)

        since_cutoff = now - timedelta(days=1)
        transactions = [
            {
                "transaction_id": f"TX-{i:08d}",
                "store_id": f"STORE-{i % n_stores:05d}",
                "product_id": f"PROD-{i % n_products:07d}",
                "movement_type": "SALE" if i % 2 == 0 else "RECEIPT",
                "stock_bucket": "AVAILABLE",
                "quantity_delta": -1 if i % 2 == 0 else 1,
                "occurred_at": since_cutoff + timedelta(seconds=i * 13),
                "recorded_at": now,
                "user_id": admin.id,
                "device_id": "BENCH-DEVICE",
                "reference_number": f"REF-{i:08d}",
                "reason_code": None,
                "transfer_id": None,
                "purchase_order_id": None,
                "batch_id": None,
                "client_sequence": i,
                "sync_status": "ACCEPTED",
                "server_accepted_at": now,
                "original_transaction_id": None,
            }
            for i in range(n_transactions)
        ]
        await session.execute(insert(InventoryTransaction), transactions)
        await session.commit()
        return admin.id, device.id


def _run_benchmark(n_products: int, n_stores: int, n_transactions: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    async def _setup() -> tuple[AsyncEngine, int, str]:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # Swap in-memory DB into the app's singletons exactly like conftest.py
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

        async def _override_get_db():  # type: ignore[return]  # noqa: ANN202
            async with factory() as session:
                yield session

        from app.api.v1.sync import get_ingest_session_factory

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_ingest_session_factory] = lambda: factory
        return engine, *(await _seed(engine, n_products, n_stores, n_transactions))

    async def _close(engine: AsyncEngine) -> None:
        app.dependency_overrides.clear()
        await engine.dispose()

    async def _main() -> list[dict[str, Any]]:
        t0 = time.perf_counter()
        engine, user_id, device_id = await _setup()
        seed_ms = (time.perf_counter() - t0) * 1000
        print(
            f"Seeded {n_products} products / {n_stores} stores / "
            f"{n_transactions} transactions in {seed_ms:.0f} ms"
        )

        headers = _auth_header(user_id, device_id)
        client = TestClient(app)
        store_id = "STORE-00000"
        since_iso = (datetime.now(UTC) - timedelta(hours=12)).isoformat()

        # ── sync/pull: full snapshot ──────────────────────────────────────────
        t = time.perf_counter()
        r = client.post("/api/v1/sync/pull", headers=headers)
        full = r.json()
        results.append(
            {
                "name": "pull full snapshot",
                "ms": (time.perf_counter() - t) * 1000,
                "json_bytes": len(r.content),
                "meta": f"{len(full['products'])}p/{len(full['stores'])}s/{len(full['stock_balances'])}b",  # noqa: E501
            }
        )

        # ── sync/pull: paginated (walks every page) ───────────────────────────
        offset = 0
        paginated_ms = 0.0
        total_pages = 0
        page_size = 2000
        while True:
            t = time.perf_counter()
            r = client.post(
                "/api/v1/sync/pull",
                params={"limit": page_size, "offset": offset},
                headers=headers,
            )
            paginated_ms += (time.perf_counter() - t) * 1000
            total_pages += 1
            body = r.json()
            if not body.get("pagination", {}).get("has_more"):
                break
            offset = body["pagination"]["next_offset"]
        results.append(
            {
                "name": "pull paginated (walk all)",
                "ms": paginated_ms,
                "json_bytes": 0,
                "meta": f"{total_pages} pages x {page_size}",
            }
        )

        # ── sync/pull: delta via `since` ──────────────────────────────────────
        t = time.perf_counter()
        r = client.post("/api/v1/sync/pull", params={"since": since_iso}, headers=headers)
        delta = r.json()
        results.append(
            {
                "name": "pull delta (since 12h)",
                "ms": (time.perf_counter() - t) * 1000,
                "json_bytes": len(r.content),
                "meta": f"{len(delta['products'])}p/{len(delta['stores'])}s/{len(delta['stock_balances'])}b",  # noqa: E501
            }
        )

        # ── transactions list (store-scoped) ──────────────────────────────────
        t = time.perf_counter()
        r = client.get(
            "/api/v1/transactions",
            params={"store_id": store_id, "limit": 50},
            headers=headers,
        )
        results.append(
            {
                "name": "transactions list (store p.1)",
                "ms": (time.perf_counter() - t) * 1000,
                "json_bytes": len(r.content),
                "meta": f"status={r.status_code}",
            }
        )

        # ── dashboard endpoints ───────────────────────────────────────────────
        dash_params = {
            "store_id": store_id,
            "start_date": (datetime.now(UTC) - timedelta(days=30)).date().isoformat(),
            "end_date": datetime.now(UTC).date().isoformat(),
        }
        for name, path, params in [
            ("dashboard/metrics", "/api/v1/dashboard/metrics", dash_params),
            ("dashboard/stock-trend", "/api/v1/dashboard/stock-trend", dash_params),
            ("dashboard/operations-summary", "/api/v1/dashboard/operations-summary", dash_params),
            (
                "dashboard/most-sold-extended",
                "/api/v1/dashboard/most-sold-extended",
                {**dash_params, "limit": 10},
            ),
        ]:
            t = time.perf_counter()
            r = client.get(path, params=params, headers=headers)
            results.append(
                {
                    "name": name,
                    "ms": (time.perf_counter() - t) * 1000,
                    "json_bytes": len(r.content),
                    "meta": f"status={r.status_code}",
                }
            )

        await _close(engine)
        return results

    return asyncio.run(_main())


def main() -> None:
    parser = argparse.ArgumentParser(description="API performance benchmark (dev-only)")
    parser.add_argument("--products", type=int, default=5000)
    parser.add_argument("--stores", type=int, default=5)
    parser.add_argument("--transactions", type=int, default=50000)
    parser.add_argument("--json", action="store_true", help="Emit JSON result array")
    args = parser.parse_args()

    results = _run_benchmark(args.products, args.stores, args.transactions)

    if args.json:
        print(json.dumps(results, indent=2))
        return

    print("\n=== BENCHMARK RESULTS ===")
    print(f"{'endpoint':<40}{'time':>12}  detail")
    print("-" * 80)
    for r in results:
        print(f"{r['name']:<40}{r['ms']:>10.1f} ms  {r['meta']}")


if __name__ == "__main__":
    main()
