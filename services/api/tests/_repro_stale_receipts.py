"""
Standalone reproduction simulating the user's log scenario:

Three events pre-seeded in sync_receipts with STALE rejections:
  TX-ADJ  -> "Unexpected error: ...DatatypeMismatchError...sqlalchemy..."
  TX-RECP -> "Unexpected error: ...DatatypeMismatchError...sqlalchemy..."
  TX-SALE -> "Insufficient stock: current 0, would result in -4"

Expected: on a re-push, all three are ingested successfully with a final
stock balance of 100 (ADJ) + 15 (RECEIPT) - 4 (SALE) = 111.

Run with:
    .venv/bin/python services/api/tests/_repro_stale_receipts.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime

# Ensure the package is importable when run as a script
sys.path.insert(0, "services/api")

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import Base, build_engine
from app.models.inventory_transaction import InventoryTransaction
from app.models.stock_balance import StockBalance
from app.models.sync_receipt import SyncReceipt
from app.services.ingestion import (
    TransactionPayload,
    ingest_batch,
)

TX_ADJ = "TX-ADJ-18D21B62A1B09112"
TX_REC = "TX-18D21A5DD6816CAD"
TX_SAL = "TX-18D21A674583B734"

STALE_SERVER_ERR = (
    "Unexpected error: (raised as a result of Query-invoked autoflush; "
    "consider using a session.no_autoflush block if this flush is occurring "
    "prematurely) (sqlalchemy.dialects.postgresql.asyncpg.ProgrammingError) "
    "<class 'asyncpg.exceptions.DatatypeMismatchError'>: column \"user_id\" is "
    "of type integer but expression is of type character varying "
    "(Background on this error at: `https://sqlalche.me/e/20/f405)`"
)


async def main() -> None:
    # Use an in-memory sqlite async database (same as the test harness)
    db_url = "sqlite+aiosqlite:///:memory:?cache=shared"
    engine = build_engine(database_url=db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)

    async with Session() as db:
        # ---- Pre-seed stale rejected receipts (the buggy original run) -----
        now_seed = datetime(2026, 9, 4, 15, 29, 10, tzinfo=UTC)
        db.add_all(
            [
                SyncReceipt(
                    transaction_id=TX_ADJ,
                    accepted=False,
                    rejection_reason=STALE_SERVER_ERR,
                    received_at=now_seed,
                    processed_at=now_seed,
                ),
                SyncReceipt(
                    transaction_id=TX_REC,
                    accepted=False,
                    rejection_reason=STALE_SERVER_ERR,
                    received_at=now_seed,
                    processed_at=now_seed,
                ),
                SyncReceipt(
                    transaction_id=TX_SAL,
                    accepted=False,
                    rejection_reason="Insufficient stock: current 0, would result in -4",
                    received_at=now_seed,
                    processed_at=now_seed,
                ),
            ]
        )
        await db.commit()

    # Now push the batch again (same order as user's log: ADJ, RECEIPT, SALE)
    ts_old = datetime(2026, 9, 4, 11, 41, 52, tzinfo=UTC)
    ts_new = datetime(2026, 9, 4, 16, 13, 39, tzinfo=UTC)
    payloads = [
        TransactionPayload(
            transaction_id=TX_ADJ,
            store_id="STORE-MAIN",
            product_id="PROD-18D21504B139D321",
            movement_type="ADJUSTMENT",
            quantity_delta=100,
            occurred_at=ts_old,
            user_id=1,
            device_id="SINGLE-USER-DEVICE",
            stock_bucket="AVAILABLE",
            reference_number="COUNT-STORE-MAIN-PROD-18D21504B139D321-1788522112398",
            reason_code="new",
        ),
        TransactionPayload(
            transaction_id=TX_REC,
            store_id="STORE-MAIN",
            product_id="PROD-18D21504B139D321",
            movement_type="RECEIPT",
            quantity_delta=15,
            occurred_at=ts_new,
            user_id=1,
            device_id="SINGLE-USER-DEVICE",
            stock_bucket="AVAILABLE",
        ),
        TransactionPayload(
            transaction_id=TX_SAL,
            store_id="STORE-MAIN",
            product_id="PROD-18D21504B139D321",
            movement_type="SALE",
            quantity_delta=-4,
            occurred_at=ts_new,
            user_id=1,
            device_id="SINGLE-USER-DEVICE",
            stock_bucket="AVAILABLE",
        ),
    ]

    async with Session() as db:
        receipts = await ingest_batch(payloads, db)
        await db.commit()

    receipt_map = {r.transaction_id: r for r in receipts}
    print("=== receipts ===")
    for tid in (TX_ADJ, TX_REC, TX_SAL):
        r = receipt_map[tid]
        status = "ACCEPTED" if r.accepted else f"REJECTED: {r.rejection_reason}"
        print(f"  {tid}: {status}")

    async with Session() as db:
        # Confirm ledger rows now exist
        ledger_count = sum(
            (await db.get(InventoryTransaction, tid)) is not None
            for tid in (TX_ADJ, TX_REC, TX_SAL)
        )
        # Read balance
        from sqlalchemy import select

        sb = (
            await db.execute(
                select(StockBalance).where(
                    StockBalance.store_id == "STORE-MAIN",
                    StockBalance.product_id == "PROD-18D21504B139D321",
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
        ).scalar_one_or_none()
        print(f"\nledger rows inserted: {ledger_count}/3")
        print(f"balance: {sb.quantity if sb else 'NONE'} (expected 111)")

    ok = (
        all(r.accepted for r in receipts)
        and ledger_count == 3
        and sb is not None
        and sb.quantity == 111
    )
    if not ok:
        raise SystemExit("REPRO FAILED")
    print("\nREPRO PASSED: stale receipts re-evaluated successfully, final balance correct.")


if __name__ == "__main__":
    asyncio.run(main())
