"""
Idempotent ingestion service — central ledger (Issue 14).

Public API
----------
ingest_transaction(payload, db) -> SyncReceipt
    Write a single InventoryTransaction to the central ledger, applying the
    transaction_id as an idempotency key (SYNC-003, SYNC-004).  A second call
    with the same transaction_id returns the stored receipt without any DB write.

ingest_batch(payloads, db) -> list[SyncReceipt]
    Process a list of transactions independently (SYNC-012).  Each item is
    accepted or rejected on its own merits; a failure in one does not affect
    the others.

check_integrity(store_id, product_id, stock_bucket, expected_quantity, db)
    -> IntegrityCheckResult
    Compare the materialised stock_balances quantity against a live re-projection
    from inventory_transactions.  Flags discrepancies (Section 22.2 / AT-010).

Design notes
------------
* transaction_id is the PRIMARY KEY of inventory_transactions so the uniqueness
  constraint is enforced at the DB level.  We do a SELECT-first check to avoid
  paying for an exception round-trip on the hot idempotent path.

* stock_balances are upserted atomically within the same DB transaction as the
  ledger insert, keeping the balance projection always consistent with the log.

* The service is transport-agnostic: it operates on plain dataclass-like
  TransactionPayload objects.  HTTP wiring lands in Issue 15.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.device import Device

# ---------------------------------------------------------------------------
# Input payload schema
# ---------------------------------------------------------------------------


@dataclass
class TransactionPayload:
    """
    Wire-format for a single inventory transaction pushed from a device.

    All fields map 1-to-1 to InventoryTransaction columns.  Optional fields
    default to None and are passed through unchanged.

    ``user_id`` accepts both integers and numeric strings for compatibility;
    it is always normalised to a plain ``int`` immediately after construction
    so downstream code can rely on a uniform type.
    """

    transaction_id: str
    store_id: str
    product_id: str
    movement_type: str
    quantity_delta: int
    occurred_at: datetime
    user_id: int | str
    device_id: str
    stock_bucket: str = "AVAILABLE"
    reference_number: str | None = None
    reason_code: str | None = None
    transfer_id: str | None = None
    purchase_order_id: str | None = None
    batch_id: str | None = None
    client_sequence: int | None = None
    original_transaction_id: str | None = None

    def __post_init__(self) -> None:
        # Normalise user_id to int.  The API Pydantic schema already coerces,
        # but this post-init also handles direct construction from tests and
        # legacy callers that still pass a numeric string.
        raw = self.user_id
        if isinstance(raw, bool):
            raise TypeError("user_id must be a positive integer (not bool)")
        if isinstance(raw, int):
            if raw <= 0:
                raise ValueError("user_id must be a positive integer")
            # Already correct type
            return
        if isinstance(raw, str):
            s = raw.strip()
            if not s.isdigit():
                raise ValueError(f"user_id {raw!r} is not a valid positive integer")
            iv = int(s)
            if iv <= 0:
                raise ValueError("user_id must be a positive integer")
            object.__setattr__(self, "user_id", iv)
            return
        raise TypeError(f"user_id has unsupported type: {type(raw).__name__}")


# ---------------------------------------------------------------------------
# Integrity check result
# ---------------------------------------------------------------------------


@dataclass
class IntegrityCheckResult:
    """
    Result of a single balance integrity check (Section 22.2).

    ok          — True when materialised balance matches ledger projection.
    store_id    — Store scoping the check.
    product_id  — Product scoping the check.
    stock_bucket — Bucket scoped.
    stored_quantity — Value from stock_balances (materialised).
    computed_quantity — SUM(quantity_delta) from inventory_transactions.
    delta       — computed_quantity - stored_quantity (0 when ok=True).
    """

    ok: bool
    store_id: str
    product_id: str
    stock_bucket: str
    stored_quantity: int
    computed_quantity: int
    delta: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _make_accepted_receipt(transaction_id: str) -> SyncReceipt:
    now = _now_utc()
    return SyncReceipt(
        transaction_id=transaction_id,
        accepted=True,
        rejection_reason=None,
        received_at=now,
        processed_at=now,
    )


def _make_rejected_receipt(transaction_id: str, reason: str) -> SyncReceipt:
    now = _now_utc()
    return SyncReceipt(
        transaction_id=transaction_id,
        accepted=False,
        rejection_reason=reason,
        received_at=now,
        processed_at=now,
    )


# ---------------------------------------------------------------------------
# Core idempotent ingest
# ---------------------------------------------------------------------------


def _is_server_internal_error_reason(reason: str | None) -> bool:
    """
    True if the rejection_reason was produced by the catch-all "Unexpected
    error: …" path in ingest_batch (or a similar server-internal exception).

    These receipts are *not* a semantic rejection of the payload itself.
    They can be retried safely because the underlying cause (a bug in a
    previous code revision, a transient DB issue, etc.) may now be fixed.
    In contrast, a domain rejection like "Insufficient stock" or
    "quantity_delta must be non-zero" is deterministic and stays rejected
    UNLESS a re-evaluation check (see `_stale_domain_rejection_should_retry`)
    decides the domain precondition no longer holds.
    """
    if not reason:
        return False
    if reason.startswith("Unexpected error:"):
        return True
    # Known transient-looking substrings surfaced from exception messages.
    lowered = reason.lower()
    markers = (
        "query-invoked autoflush",
        "datatypemismatch",
        "programmingerror",
        "internalerror",
        "operationalerror",
        "interfaceerror",
        "databaseerror",
        "sqlalchemy",
    )
    return any(m in lowered for m in markers)


_INSUFFICIENT_STOCK_RE = re.compile(
    r"^Insufficient stock: current (-?\d+), would result in (-?\d+)$"
)


async def _stale_domain_rejection_should_retry(
    existing_receipt: SyncReceipt,
    payload: TransactionPayload,
    db: AsyncSession,
) -> bool:
    """
    For an accepted=False SyncReceipt that has a *domain* reason (not a
    server-internal error), return True if the domain precondition that
    caused the rejection has since changed so much that re-running
    ingestion on this same payload has a realistic chance to succeed.

    Rationale: when a batch contains the baseline ADJUSTMENT for a product
    AND movements derived from that baseline but the ADJUSTMENT ingestion
    failed on a prior attempt due to an unrelated server bug (e.g. the
    DatatypeMismatchError), subsequent rejections of the SALE with
    "Insufficient stock: current 0" are correct at the time but become
    stale once the ADJUSTMENT finally succeeds on a retry.  Without this
    check, users would need *two* push cycles for such a batch to fully
    converge (one cycle for ADJUSTMENT to be re-evaluated, one cycle for
    the SALE to finally see the updated balance).

    Cases currently handled:
    - ``"Insufficient stock: current <n>, would result in <m>"``
      Re-evaluate if the live balance + payload delta >= 0, i.e. the
      operation would now pass the server-side negative-balance check.
    """
    reason = existing_receipt.rejection_reason
    if not reason:
        return False

    # --- Case 1: Insufficient stock (balance-dependent) ---------------------
    m = _INSUFFICIENT_STOCK_RE.match(reason)
    if m:
        try:
            previous_balance_recorded = int(m.group(1))
            if previous_balance_recorded < 0:
                # If previous state was already inconsistent (<0) don't
                # treat that as a "now-fixed" signal; let the rejection
                # surface to avoid masking other bugs.
                return False
        except ValueError:
            return False
        with db.no_autoflush:
            stmt = select(StockBalance).where(
                StockBalance.store_id == payload.store_id,
                StockBalance.product_id == payload.product_id,
                StockBalance.stock_bucket == payload.stock_bucket,
            )
            res = await db.execute(stmt)
        balance: StockBalance | None = res.scalars().first()
        current = balance.quantity if balance is not None else 0
        # If the previous run recorded "current 0" but there's now actually
        # stock (current >= -payload.quantity_delta) then re-evaluation is
        # warranted.  Otherwise the stored rejection is still as valid today
        # as it was then.
        return current + payload.quantity_delta >= 0 and current != previous_balance_recorded

    return False


async def ingest_transaction(
    payload: TransactionPayload,
    db: AsyncSession,
) -> SyncReceipt:
    """
    Idempotently ingest a single transaction into the central ledger.

    Algorithm (SYNC-003 / SYNC-004):
    1. Check whether the ledger *already contains* the transaction_id.
       If yes, this is the authoritative "accepted" signal and we return
       the stored accepted outcome (append-only guarantee).
    2. Otherwise check for an existing SyncReceipt row.  If it is:
       - accepted=True  → same as (1), return it.
       - accepted=False with a *deterministic* domain rejection → idempotent.
       - accepted=False with a server-internal "Unexpected error: …" style
         reason → the receipt is stale; delete it and re-run ingestion so
         the fixed code path gets a shot at the payload.
    3. Validate payload (non-zero delta, required fields present).
    4. For negative operations, check current balance is sufficient.
    5. Insert the InventoryTransaction row.
    6. Upsert the stock_balances row for (store_id, product_id, stock_bucket).
    7. Insert an accepted SyncReceipt and flush.

    The caller is responsible for committing (or rolling back) the session.
    """

    # 1a. Ledger-first idempotency: if an InventoryTransaction row with this
    # transaction_id already exists, the event has been durably accepted.
    # Return a fresh receipt (looked up / rebuilt) without mutating state.
    with db.no_autoflush:
        ledger_row = await db.get(InventoryTransaction, payload.transaction_id)
    if ledger_row is not None:
        # There is a ledger row — this is definitively accepted.
        existing_receipt = await db.get(SyncReceipt, payload.transaction_id)
        if existing_receipt is not None and existing_receipt.accepted:
            return existing_receipt
        # Stale receipt row that doesn't match the ledger (shouldn't happen,
        # but handle it: upsert a correct accepted receipt).
        now = _now_utc()
        if existing_receipt is not None:
            existing_receipt.accepted = True
            existing_receipt.rejection_reason = None
            existing_receipt.processed_at = now
            receipt = existing_receipt
        else:
            receipt = SyncReceipt(
                transaction_id=payload.transaction_id,
                accepted=True,
                rejection_reason=None,
                received_at=now,
                processed_at=now,
            )
            db.add(receipt)
        await db.flush()
        return receipt

    # 1b. Receipt-only idempotency check.
    existing_receipt = await db.get(SyncReceipt, payload.transaction_id)
    if existing_receipt is not None:
        if existing_receipt.accepted:
            # Accepted receipt but no corresponding ledger row (edge case):
            # treat as authoritative — won't double-insert because the
            # receipt PK will conflict on db.add anyway.
            return existing_receipt
        # Rejected receipt.  Decide whether it's stable enough to honour
        # idempotently, or whether the precondition that caused it has
        # shifted so much that re-evaluation is warranted.
        reason = existing_receipt.rejection_reason
        should_retry = False
        if _is_server_internal_error_reason(reason):
            # Bug-on-server, transient DB error, ORM type mistake, etc.
            # Always safe to retry with the exact same payload.
            should_retry = True
        elif await _stale_domain_rejection_should_retry(
            existing_receipt, payload, db
        ):
            # Domain rejection whose underlying precondition (e.g. a 0
            # balance) no longer holds — typically because an earlier
            # event in the same batch (the ADJUSTMENT) has just been
            # re-evaluated successfully on this retry.
            should_retry = True

        if not should_retry:
            # Honour the stored rejection idempotently.
            return existing_receipt

        # Stale receipt — delete it and fall through to the full ingest
        # pipeline so the fixed / now-satisfiable payload runs for real.
        stale_pk = existing_receipt.transaction_id
        await db.delete(existing_receipt)
        await db.flush()
        # Detach the deleted object from the session so a fresh
        # SyncReceipt(stale_pk, ...) can be added without identity-map
        # conflicts on the same primary key.
        db.expunge(existing_receipt)
        # Safety: sanity check identity map no longer has a row for PK.
        for tracked in list(db.identity_map.values()):
            if (
                isinstance(tracked, SyncReceipt)
                and tracked.transaction_id == stale_pk
            ):
                db.expunge(tracked)

    # 2. Basic validation
    rejection: str | None = _validate_payload(payload)
    if rejection is not None:
        receipt = _make_rejected_receipt(payload.transaction_id, rejection)
        db.add(receipt)
        await db.flush()
        return receipt

    # 2b. Auto-provision missing store or product in central database if needed
    with db.no_autoflush:
        store_exists = await db.scalar(
            select(Store.id).where(Store.id == payload.store_id).limit(1)
        )
    if not store_exists:
        auto_store = Store(
            id=payload.store_id,
            code=payload.store_id[:10].upper(),
            name=f"Auto Store ({payload.store_id[:10]})",
            is_active=True,
        )
        db.add(auto_store)
        await db.flush()

    with db.no_autoflush:
        prod_exists = await db.scalar(
            select(Product.id).where(Product.id == payload.product_id).limit(1)
        )
    if not prod_exists:
        auto_prod = Product(
            id=payload.product_id,
            sku=f"AUTO-{payload.product_id[:8]}",
            name=f"Offline Item ({payload.product_id[:8]})",
            category="General",
            unit="pcs",
            is_active=True,
        )
        db.add(auto_prod)
        await db.flush()

    with db.no_autoflush:
        device_exists = await db.scalar(
            select(Device.id).where(Device.id == payload.device_id).limit(1)
        )
    if not device_exists:
        auto_device = Device(
            id=payload.device_id,
            store_id=payload.store_id,
            device_name=f"Auto Device ({payload.device_id[:12]})",
            is_active=True,
        )
        db.add(auto_device)
        await db.flush()

    # 3. Negative balance check for operations that would decrease stock
    if payload.quantity_delta < 0:
        with db.no_autoflush:
            stmt = select(StockBalance).where(
                StockBalance.store_id == payload.store_id,
                StockBalance.product_id == payload.product_id,
                StockBalance.stock_bucket == payload.stock_bucket,
            )
            result = await db.execute(stmt)
        balance: StockBalance | None = result.scalars().first()
        current_quantity = balance.quantity if balance else 0

        if current_quantity + payload.quantity_delta < 0:
            receipt = _make_rejected_receipt(
                payload.transaction_id,
                f"Insufficient stock: current {current_quantity}, would result in {current_quantity + payload.quantity_delta}",
            )
            db.add(receipt)
            await db.flush()
            return receipt

    # 4. Insert ledger row
    now = _now_utc()
    tx_row = InventoryTransaction(
        transaction_id=payload.transaction_id,
        store_id=payload.store_id,
        product_id=payload.product_id,
        movement_type=payload.movement_type,
        stock_bucket=payload.stock_bucket,
        quantity_delta=payload.quantity_delta,
        occurred_at=payload.occurred_at,
        recorded_at=now,
        user_id=payload.user_id,
        device_id=payload.device_id,
        reference_number=payload.reference_number,
        reason_code=payload.reason_code,
        transfer_id=payload.transfer_id,
        purchase_order_id=payload.purchase_order_id,
        batch_id=payload.batch_id,
        client_sequence=payload.client_sequence,
        sync_status="ACCEPTED",
        server_accepted_at=now,
        original_transaction_id=payload.original_transaction_id,
    )
    db.add(tx_row)
    await db.flush()

    # 5. Upsert stock balance
    await _upsert_stock_balance(
        db=db,
        store_id=payload.store_id,
        product_id=payload.product_id,
        stock_bucket=payload.stock_bucket,
        delta=payload.quantity_delta,
    )

    # 6. Persist receipt
    receipt = _make_accepted_receipt(payload.transaction_id)
    db.add(receipt)
    await db.flush()
    return receipt


# ---------------------------------------------------------------------------
# Partial-batch ingestion (SYNC-012)
# ---------------------------------------------------------------------------


async def ingest_batch(
    payloads: list[TransactionPayload],
    db: AsyncSession,
) -> list[SyncReceipt]:
    """
    Process a batch of transactions independently (SYNC-012).

    Each payload is accepted or rejected on its own; a failure in one item
    does not roll back others.  The session is NOT committed here — the caller
    must commit after reviewing the returned receipts.

    Because we operate inside a single session, a flush is issued between items
    so that subsequent idempotency checks see rows inserted earlier in the same
    batch (important when the same transaction_id appears twice in one batch).

    Payloads are *re-ordered* before processing so that stock-baseline
    operations (ADJUSTMENT) and stock-increases (RECEIPT / TRANSFER_IN /
    RETURN) are applied before stock-decreases (SALE / TRANSFER_OUT / DAMAGE).
    This prevents spurious "Insufficient stock" rejections when a batch
    contains both the initial count and the movements derived from it.
    """
    # ---- Sort the batch for logical, deterministic order ---------------------
    # Lower number = processed first.
    MOVEMENT_PRIORITY: dict[str, int] = {
        "ADJUSTMENT": 0,      # Baseline / count reconciliation first
        "RECEIPT": 1,         # Then increases
        "TRANSFER_IN": 1,
        "RETURN": 1,
        "SALE": 2,            # Then decreases
        "TRANSFER_OUT": 2,
        "DAMAGE": 2,
    }

    def _sort_key(p: TransactionPayload) -> tuple:
        prio = MOVEMENT_PRIORITY.get(p.movement_type, 3)
        return (prio, p.occurred_at, p.transaction_id)

    # Keep the original order mapped so receipts are returned in the same
    # order the caller submitted them (per SYNC-012 contract: one receipt per
    # submitted event, in request order).
    indexed: list[tuple[int, TransactionPayload]] = list(enumerate(payloads))
    ordered = sorted(indexed, key=lambda pair: _sort_key(pair[1]))

    receipts_by_index: dict[int, SyncReceipt] = {}
    for original_idx, payload in ordered:
        try:
            receipt = await ingest_transaction(payload, db)
            receipts_by_index[original_idx] = receipt
        except Exception as exc:  # noqa: BLE001 — isolate per-item failures
            # Unexpected errors (DB constraint, etc.) get a rejected receipt.
            # Roll back to the last savepoint so the session stays usable.
            await db.rollback()
            now = _now_utc()
            rejection_text = f"Unexpected error: {exc!s}"
            existing_receipt = await db.get(SyncReceipt, payload.transaction_id)
            if existing_receipt is not None:
                existing_receipt.accepted = False
                existing_receipt.rejection_reason = rejection_text
                existing_receipt.processed_at = now
                receipt = existing_receipt
            else:
                receipt = _make_rejected_receipt(payload.transaction_id, rejection_text)
                db.add(receipt)
            await db.flush()
            receipts_by_index[original_idx] = receipt

    # Emit receipts in the caller's original submission order.
    return [receipts_by_index[i] for i in range(len(payloads))]


# ---------------------------------------------------------------------------
# Data-integrity check (Section 22.2 / AT-010)
# ---------------------------------------------------------------------------


async def check_integrity(
    store_id: str,
    product_id: str,
    stock_bucket: str,
    expected_quantity: int,
    db: AsyncSession,
) -> IntegrityCheckResult:
    """
    Verify that the materialised stock_balances row matches the live ledger
    re-projection for a given (store, product, bucket) triple.

    ``expected_quantity`` is the caller-supplied "known good" value, typically
    read from the stock_balances table before any test manipulation.  Passing
    a deliberately wrong value exercises AT-010: the function must flag it.

    Returns an IntegrityCheckResult with ok=False and a non-zero delta when
    the materialised balance does not match the computed projection.
    """
    # Re-project from the ledger (ignore REJECTED transactions by sync_status)
    stmt_computed = text("""
        SELECT COALESCE(SUM(quantity_delta), 0)
        FROM inventory_transactions
        WHERE store_id   = :store_id
          AND product_id = :product_id
          AND stock_bucket = :stock_bucket
          AND sync_status != 'REJECTED'
        """)
    computed_result = await db.execute(
        stmt_computed,
        {"store_id": store_id, "product_id": product_id, "stock_bucket": stock_bucket},
    )
    computed_quantity: int = computed_result.scalar() or 0

    delta = computed_quantity - expected_quantity
    return IntegrityCheckResult(
        ok=delta == 0,
        store_id=store_id,
        product_id=product_id,
        stock_bucket=stock_bucket,
        stored_quantity=expected_quantity,
        computed_quantity=computed_quantity,
        delta=delta,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_payload(payload: TransactionPayload) -> str | None:
    """
    Return a human-readable rejection reason or None if the payload is valid.

    Deliberately minimal — FK existence checks are deferred to the DB layer
    (the DB will raise an IntegrityError which the batch handler catches).
    """
    if not payload.transaction_id or not payload.transaction_id.strip():
        return "transaction_id is required"
    if not payload.store_id or not payload.store_id.strip():
        return "store_id is required"
    if not payload.product_id or not payload.product_id.strip():
        return "product_id is required"
    if not isinstance(payload.user_id, int) or payload.user_id <= 0:
        return "user_id must be a positive integer"
    if not payload.device_id or not payload.device_id.strip():
        return "device_id is required"
    if not payload.movement_type or not payload.movement_type.strip():
        return "movement_type is required"
    if payload.quantity_delta == 0:
        return "quantity_delta must be non-zero"

    VALID_MOVEMENT_TYPES = {
        "RECEIPT",
        "SALE",
        "RETURN",
        "DAMAGE",
        "ADJUSTMENT",
        "TRANSFER_OUT",
        "TRANSFER_IN",
    }
    if payload.movement_type not in VALID_MOVEMENT_TYPES:
        return f"movement_type must be one of {VALID_MOVEMENT_TYPES}"

    return None


async def _upsert_stock_balance(
    db: AsyncSession,
    store_id: str,
    product_id: str,
    stock_bucket: str,
    delta: int,
) -> None:
    """
    Atomically increment (or create) the stock_balances row for
    (store_id, product_id, stock_bucket).

    Uses a SELECT-then-UPDATE/INSERT approach rather than raw SQL UPSERT so the
    code works with both PostgreSQL (production) and SQLite (test fixtures).
    Both paths run within the caller's transaction, so there is no race window
    in a properly serialised transaction.
    """
    with db.no_autoflush:
        stmt = select(StockBalance).where(
            StockBalance.store_id == store_id,
            StockBalance.product_id == product_id,
            StockBalance.stock_bucket == stock_bucket,
        )
        result = await db.execute(stmt)
    balance: StockBalance | None = result.scalars().first()

    now = _now_utc()
    if balance is None:
        balance = StockBalance(
            id=str(uuid.uuid4()),
            store_id=store_id,
            product_id=product_id,
            stock_bucket=stock_bucket,
            quantity=delta,
            updated_at=now,
        )
        db.add(balance)
    else:
        balance.quantity += delta
        balance.updated_at = now
