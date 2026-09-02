"""
Tests for the idempotent ingestion service (Issue 14).

Coverage:
- AT-004 groundwork: same transaction_id submitted twice → exactly one ledger
  row and one idempotent acknowledgement on the second call.
- AT-010 groundwork: integrity check flags a deliberately corrupted balance.
- Partial-batch acceptance: individual events accepted / rejected independently
  (SYNC-012).
- Validation rejection: missing/zero-delta payloads produce rejected receipts.
- Stock balance: balance is incremented on first ingest, unchanged on retry.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.user import User
from app.services.ingestion import (
    TransactionPayload,
    check_integrity,
    ingest_batch,
    ingest_transaction,
)

# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _uid() -> str:
    return str(uuid.uuid4())


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


async def _seed_user(db: AsyncSession) -> User:
    from app.core.security import hash_password

    username = f"u_{uuid.uuid4().hex[:8]}"
    user = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password=hash_password("pw"),
        role="STORE_MANAGER",
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
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(product)
    await db.flush()
    return product


async def _seed_base(
    db: AsyncSession,
) -> tuple[Store, User, Device, Product]:
    """Create one of each required FK entity."""
    store = await _seed_store(db)
    user = await _seed_user(db)
    device = await _seed_device(db, store.id, user.id)
    product = await _seed_product(db)
    return store, user, device, product


def _payload(
    store_id: str,
    product_id: str,
    user_id: int | str,
    device_id: str,
    *,
    transaction_id: str | None = None,
    quantity_delta: int = 10,
    movement_type: str = "RECEIPT",
    stock_bucket: str = "AVAILABLE",
) -> TransactionPayload:
    return TransactionPayload(
        transaction_id=transaction_id or _uid(),
        store_id=store_id,
        product_id=product_id,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        occurred_at=datetime.now(UTC),
        user_id=str(user_id),
        device_id=device_id,
        stock_bucket=stock_bucket,
    )


# ---------------------------------------------------------------------------
# AT-004 groundwork: duplicate transaction_id
# ---------------------------------------------------------------------------


async def test_duplicate_transaction_id_returns_idempotent_receipt(
    db_session: AsyncSession,
) -> None:
    """
    Submitting the same transaction_id twice must:
    - Store exactly one InventoryTransaction row.
    - Return the original SyncReceipt on the second call without modification.
    """
    store, user, device, product = await _seed_base(db_session)
    tid = _uid()

    p = _payload(store.id, product.id, user.id, device.id, transaction_id=tid)

    # First submission
    receipt1 = await ingest_transaction(p, db_session)
    assert receipt1.accepted is True
    assert receipt1.transaction_id == tid

    # Second submission — same payload
    receipt2 = await ingest_transaction(p, db_session)
    assert receipt2.transaction_id == tid
    assert receipt2.accepted is True

    # Exactly one ledger row
    tx_rows = (
        (
            await db_session.execute(
                select(InventoryTransaction).where(InventoryTransaction.transaction_id == tid)
            )
        )
        .scalars()
        .all()
    )
    assert len(tx_rows) == 1

    # Exactly one receipt row
    receipt_rows = (
        (await db_session.execute(select(SyncReceipt).where(SyncReceipt.transaction_id == tid)))
        .scalars()
        .all()
    )
    assert len(receipt_rows) == 1


async def test_duplicate_does_not_double_count_balance(
    db_session: AsyncSession,
) -> None:
    """
    SYNC-003: retrying the same transaction_id must not change the stock balance.
    Balance after first ingest == balance after second ingest.
    """
    store, user, device, product = await _seed_base(db_session)
    tid = _uid()
    p = _payload(store.id, product.id, user.id, device.id, transaction_id=tid, quantity_delta=5)

    await ingest_transaction(p, db_session)

    # Read balance after first ingest
    balance_row = (
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
    assert balance_row is not None
    qty_after_first = balance_row.quantity
    assert qty_after_first == 5

    # Re-ingest same transaction
    await ingest_transaction(p, db_session)

    await db_session.refresh(balance_row)
    assert balance_row.quantity == qty_after_first  # unchanged


# ---------------------------------------------------------------------------
# Successful single ingest
# ---------------------------------------------------------------------------


async def test_ingest_transaction_creates_ledger_row(db_session: AsyncSession) -> None:
    store, user, device, product = await _seed_base(db_session)
    p = _payload(store.id, product.id, user.id, device.id, quantity_delta=7)

    receipt = await ingest_transaction(p, db_session)

    assert receipt.accepted is True
    assert receipt.rejection_reason is None

    tx = await db_session.get(InventoryTransaction, p.transaction_id)
    assert tx is not None
    assert tx.quantity_delta == 7
    assert tx.sync_status == "ACCEPTED"
    assert tx.server_accepted_at is not None


async def test_ingest_updates_stock_balance(db_session: AsyncSession) -> None:
    store, user, device, product = await _seed_base(db_session)
    p = _payload(store.id, product.id, user.id, device.id, quantity_delta=20)

    await ingest_transaction(p, db_session)

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
    assert balance.quantity == 20


async def test_ingest_accumulates_balance_across_transactions(
    db_session: AsyncSession,
) -> None:
    """Two distinct transactions for the same key should sum their deltas."""
    store, user, device, product = await _seed_base(db_session)

    p1 = _payload(store.id, product.id, user.id, device.id, quantity_delta=10)
    p2 = _payload(store.id, product.id, user.id, device.id, quantity_delta=3)

    await ingest_transaction(p1, db_session)
    await ingest_transaction(p2, db_session)

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
    assert balance.quantity == 13


# ---------------------------------------------------------------------------
# Validation rejections
# ---------------------------------------------------------------------------


async def test_ingest_rejects_zero_quantity_delta(db_session: AsyncSession) -> None:
    store, user, device, product = await _seed_base(db_session)
    p = _payload(store.id, product.id, user.id, device.id, quantity_delta=0)

    receipt = await ingest_transaction(p, db_session)

    assert receipt.accepted is False
    assert receipt.rejection_reason is not None
    assert "quantity_delta" in receipt.rejection_reason.lower()

    # No ledger row created
    tx = await db_session.get(InventoryTransaction, p.transaction_id)
    assert tx is None


async def test_ingest_rejects_missing_store_id(db_session: AsyncSession) -> None:
    _, user, device, product = await _seed_base(db_session)
    p = TransactionPayload(
        transaction_id=_uid(),
        store_id="",
        product_id=product.id,
        movement_type="RECEIPT",
        quantity_delta=5,
        occurred_at=datetime.now(UTC),
        user_id=str(user.id),
        device_id=device.id,
    )

    receipt = await ingest_transaction(p, db_session)

    assert receipt.accepted is False
    assert "store_id" in (receipt.rejection_reason or "").lower()


# ---------------------------------------------------------------------------
# Partial-batch acceptance (SYNC-012)
# ---------------------------------------------------------------------------


async def test_ingest_batch_partial_acceptance(db_session: AsyncSession) -> None:
    """
    A batch with one valid and one invalid transaction must:
    - Accept the valid one.
    - Reject the invalid one.
    - Not roll back the valid one.
    """
    store, user, device, product = await _seed_base(db_session)

    good = _payload(store.id, product.id, user.id, device.id, quantity_delta=15)
    bad = _payload(store.id, product.id, user.id, device.id, quantity_delta=0)  # zero delta

    receipts = await ingest_batch([good, bad], db_session)

    assert len(receipts) == 2

    good_receipt = next(r for r in receipts if r.transaction_id == good.transaction_id)
    bad_receipt = next(r for r in receipts if r.transaction_id == bad.transaction_id)

    assert good_receipt.accepted is True
    assert bad_receipt.accepted is False

    # Good transaction is in the ledger
    tx = await db_session.get(InventoryTransaction, good.transaction_id)
    assert tx is not None


async def test_ingest_batch_all_accepted(db_session: AsyncSession) -> None:
    store, user, device, product = await _seed_base(db_session)

    payloads = [
        _payload(store.id, product.id, user.id, device.id, quantity_delta=i) for i in range(1, 4)
    ]

    receipts = await ingest_batch(payloads, db_session)

    assert all(r.accepted for r in receipts)

    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 1 + 2 + 3


async def test_ingest_batch_duplicate_in_batch(db_session: AsyncSession) -> None:
    """
    The same transaction_id appearing twice in one batch:
    - First occurrence: accepted, ledger row written.
    - Second occurrence: idempotent, same receipt returned, no double-count.
    """
    store, user, device, product = await _seed_base(db_session)
    tid = _uid()

    p1 = _payload(store.id, product.id, user.id, device.id, transaction_id=tid, quantity_delta=8)
    p2 = _payload(store.id, product.id, user.id, device.id, transaction_id=tid, quantity_delta=8)

    receipts = await ingest_batch([p1, p2], db_session)

    assert len(receipts) == 2
    assert all(r.accepted for r in receipts)
    assert receipts[0].transaction_id == receipts[1].transaction_id == tid

    # Balance must be 8, not 16
    balance = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                )
            )
        )
        .scalars()
        .first()
    )
    assert balance is not None
    assert balance.quantity == 8


# ---------------------------------------------------------------------------
# AT-010 groundwork: integrity check
# ---------------------------------------------------------------------------


async def test_integrity_check_ok(db_session: AsyncSession) -> None:
    """
    After a clean ingest the materialised balance matches the ledger sum,
    so the integrity check should report ok=True.
    """
    store, user, device, product = await _seed_base(db_session)
    p = _payload(store.id, product.id, user.id, device.id, quantity_delta=12)
    await ingest_transaction(p, db_session)

    result = await check_integrity(
        store_id=store.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        expected_quantity=12,  # what the materialised balance holds
        db=db_session,
    )

    assert result.ok is True
    assert result.delta == 0
    assert result.computed_quantity == 12
    assert result.stored_quantity == 12


async def test_integrity_check_flags_corrupted_balance(db_session: AsyncSession) -> None:
    """
    AT-010: deliberately pass a wrong expected_quantity; the check must flag it.
    The computed projection from the ledger is 12 but the caller claims 99.
    """
    store, user, device, product = await _seed_base(db_session)
    p = _payload(store.id, product.id, user.id, device.id, quantity_delta=12)
    await ingest_transaction(p, db_session)

    result = await check_integrity(
        store_id=store.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        expected_quantity=99,  # wrong — simulates a corrupted balance row
        db=db_session,
    )

    assert result.ok is False
    assert result.computed_quantity == 12
    assert result.stored_quantity == 99
    assert result.delta == 12 - 99  # -87


async def test_integrity_check_no_transactions(db_session: AsyncSession) -> None:
    """
    No transactions → ledger sum is 0.  Passing expected_quantity=0 is ok;
    passing non-zero is flagged.
    """
    store, _, _, product = await _seed_base(db_session)

    ok_result = await check_integrity(
        store_id=store.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        expected_quantity=0,
        db=db_session,
    )
    assert ok_result.ok is True

    bad_result = await check_integrity(
        store_id=store.id,
        product_id=product.id,
        stock_bucket="AVAILABLE",
        expected_quantity=5,
        db=db_session,
    )
    assert bad_result.ok is False


# ---------------------------------------------------------------------------
# Different stock buckets are tracked independently
# ---------------------------------------------------------------------------


async def test_ingest_different_buckets_tracked_independently(
    db_session: AsyncSession,
) -> None:
    store, user, device, product = await _seed_base(db_session)

    p_avail = _payload(
        store.id, product.id, user.id, device.id, quantity_delta=10, stock_bucket="AVAILABLE"
    )
    p_damaged = _payload(
        store.id, product.id, user.id, device.id, quantity_delta=2, stock_bucket="DAMAGED"
    )

    await ingest_transaction(p_avail, db_session)
    await ingest_transaction(p_damaged, db_session)

    balances = (
        (
            await db_session.execute(
                select(StockBalance).where(
                    StockBalance.store_id == store.id,
                    StockBalance.product_id == product.id,
                )
            )
        )
        .scalars()
        .all()
    )

    by_bucket = {b.stock_bucket: b.quantity for b in balances}
    assert by_bucket.get("AVAILABLE") == 10
    assert by_bucket.get("DAMAGED") == 2
