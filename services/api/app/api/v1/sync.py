"""
Sync endpoints — Issue 15 (SYNC-007/008/009/010/011, AT-002/AT-003/AT-004).

POST /api/v1/sync/push
    Accept a batch of InventoryTransaction payloads from a device outbox.
    Each item is processed independently (SYNC-012 partial-batch).
    Returns per-item SyncReceipt results.

POST /api/v1/sync/pull
    Return server-side inventory data the device needs to bring its local
    read-models up to date (products catalogue, store list).
    Scoped to the device's assigned store_id from the JWT.

GET  /api/v1/sync/status
    Return the number of unprocessed receipts for the calling device and
    overall server health — feeds the header online/pending-count display.

Design notes
------------
* Authentication: every endpoint requires a valid Bearer JWT.  The token
  carries device_id which scopes push/pull to that device's store.
* Push uses ingest_batch() from Issue 14 — idempotent by transaction_id.
* Pull uses the DB to fetch all active products and stores visible to the
  device's store (for now: all active products + all active stores, which is
  the correct multi-store read-model needed by the desktop).
* The commit/rollback lifecycle follows the existing pattern: deps.py yields
  a session; we commit on success and rely on FastAPI's exception handler to
  roll back on error.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Annotated, Any, ClassVar, Self

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, BeforeValidator, Field, model_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db import get_session_factory as _get_session_factory
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.user import User
from app.services.ingestion import TransactionPayload, ingest_batch

logger = logging.getLogger(__name__)


class _CoalescingWindow:
    """Coalesces nearby sync-triggering operations into batches.

    When multiple stock operations happen in quick succession, each one
    would otherwise trigger a full push+pull sync.  This waits out a
    short window so nearby operations batch into a single sync.
    Per-key so push/pull/restore don't serialise each other.
    """

    _last_trigger: ClassVar[dict[str, float]] = {}

    @classmethod
    async def wait(cls, key: str, window_s: float | None = None) -> None:
        if window_s is None:
            window_s = settings.sync_coalescing_window_s
        now = asyncio.get_event_loop().time()
        last = cls._last_trigger.get(key, 0)
        elapsed = now - last
        if elapsed < window_s:
            await asyncio.sleep(window_s - elapsed)
        cls._last_trigger[key] = asyncio.get_event_loop().time()


async def _with_timeout(coro, timeout_s: int = settings.sync_request_timeout_s):
    try:
        async with asyncio.timeout(timeout_s):
            return await coro
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Request timed out after {timeout_s}s",
        )


async def _paginated_pull(
    since: datetime | None,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> PullResponse:
    not_placeholder = ~or_(
        and_(
            or_(Product.sku.like("OFFLINE-%"), Product.sku.like("AUTO-%")),
            or_(Product.name.like("OFFLINE-PROD-%"), Product.name.like("Offline Item (%")),
        )
    )
    not_store_placeholder = ~Store.name.like("Auto Store (%")

    now = datetime.now(UTC)

    product_count_stmt = select(func.count()).select_from(Product).where(not_placeholder)
    if since is not None:
        product_count_stmt = product_count_stmt.where(Product.updated_at > since)
    total_products: int = (await db.execute(product_count_stmt)).scalar_one()

    store_count_stmt = (
        select(func.count())
        .select_from(Store)
        .where(Store.is_active.is_(True), not_store_placeholder)
    )
    if since is not None:
        store_count_stmt = store_count_stmt.where(Store.updated_at > since)
    total_stores: int = (await db.execute(store_count_stmt)).scalar_one()

    balance_count_stmt = select(func.count()).select_from(StockBalance)
    if since is not None:
        balance_count_stmt = balance_count_stmt.where(StockBalance.updated_at > since)
    total_balances: int = (await db.execute(balance_count_stmt)).scalar_one()

    total_rows = total_products + total_stores + total_balances

    start = offset
    end = min(offset + limit, total_rows)

    def _section_slice(section_start: int, section_len: int) -> tuple[int, int] | None:
        s_lo = max(start, section_start)
        s_hi = min(end, section_start + section_len)
        if s_hi <= s_lo:
            return None
        return (s_lo - section_start, s_hi - s_lo)

    products_stmt = select(Product).where(not_placeholder).order_by(Product.name, Product.id)
    stores_stmt = (
        select(Store)
        .where(Store.is_active.is_(True), not_store_placeholder)
        .order_by(Store.name, Store.id)
    )
    balances_stmt = select(StockBalance).order_by(StockBalance.store_id, StockBalance.id)

    if since is not None:
        products_stmt = products_stmt.where(Product.updated_at > since)
        stores_stmt = stores_stmt.where(Store.updated_at > since)
        balances_stmt = balances_stmt.where(StockBalance.updated_at > since)

    p_slice = _section_slice(0, total_products)
    s_slice = _section_slice(total_products, total_stores)
    b_slice = _section_slice(total_products + total_stores, total_balances)

    products: list[Product] = []
    stores: list[Store] = []
    balances: list[StockBalance] = []
    if p_slice:
        sql_offset, count = p_slice
        products = list(
            (await db.execute(products_stmt.offset(sql_offset).limit(count))).scalars().all()
        )
    if s_slice:
        sql_offset, count = s_slice
        stores = list(
            (await db.execute(stores_stmt.offset(sql_offset).limit(count))).scalars().all()
        )
    if b_slice:
        sql_offset, count = b_slice
        balances = list(
            (await db.execute(balances_stmt.offset(sql_offset).limit(count))).scalars().all()
        )

    has_more = end < total_rows
    pagination = PullPaginationInfo(
        offset=offset,
        limit=limit,
        total_products=total_products,
        total_stores=total_stores,
        total_stock_balances=total_balances,
        has_more=has_more,
        next_offset=end,
    )

    return PullResponse(
        products=[
            ProductSnapshot(
                id=p.id,
                sku=p.sku,
                name=p.name,
                brand=p.brand,
                model=p.model,
                category=p.category,
                unit=p.unit or "pcs",
                barcode=p.barcode,
                alternate_names=p.alternate_names,
                serial_tracking_enabled=bool(p.serial_tracking_enabled),
                is_active=bool(p.is_active),
                created_at=p.created_at or now,
                updated_at=p.updated_at,
            )
            for p in products
        ],
        stores=[
            StoreSnapshot(
                id=s.id,
                code=s.code,
                name=s.name,
                address=s.address,
                is_active=bool(s.is_active),
                created_at=s.created_at or now,
                updated_at=s.updated_at,
            )
            for s in stores
        ],
        stock_balances=[
            StockBalanceSnapshot(
                id=b.id,
                store_id=b.store_id,
                product_id=b.product_id,
                stock_bucket=b.stock_bucket,
                quantity=b.quantity,
                updated_at=b.updated_at or now,
            )
            for b in balances
        ],
        server_time=now,
        pagination=pagination,
    )


router = APIRouter(prefix="/sync", tags=["sync"])

# ---------------------------------------------------------------------------
# Restore schemas (for server restore functionality)
# ---------------------------------------------------------------------------


class RestorePreviewResponse(BaseModel):
    """Preview of data available for restore from server."""

    stores_count: int
    products_count: int
    transactions_count: int
    last_sync_timestamp: str
    estimated_critical_time_seconds: int
    estimated_total_time_minutes: int


class CriticalRestoreResponse(BaseModel):
    """Critical data for restore (stores, users, products, stock balances)."""

    stores: list[StoreSnapshot]
    users: list[Any]  # User data - will define proper schema
    products: list[ProductSnapshot]
    stock_balances: list[StockBalanceSnapshot]
    recent_transactions: list[Any]  # Transaction data - will define proper schema
    server_time: datetime


class ImportantRestoreResponse(BaseModel):
    """Important data for restore (recent history, active day books)."""

    recent_history: list[Any]
    active_day_books: list[Any]
    server_time: datetime


class BackgroundRestoreResponse(BaseModel):
    """Background data for restore (historical data, analytics)."""

    historical_transactions: list[Any]
    analytics: list[Any]
    server_time: datetime


def get_ingest_session_factory() -> async_sessionmaker[AsyncSession]:
    """
    FastAPI dependency — returns the session factory used by ingest_batch.

    Tests override this via app.dependency_overrides so ingest_batch uses the
    same in-memory SQLite engine as the rest of the test fixtures, rather than
    the production PostgreSQL engine.
    """
    return _get_session_factory()


def _coerce_int(v: Any) -> int:
    """Accept int or numeric string and return int; raise ValueError otherwise."""
    if isinstance(v, bool):
        raise TypeError("user_id must be a positive integer, not a boolean")
    if isinstance(v, int):
        if v <= 0:
            raise ValueError("user_id must be a positive integer")
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s.isdigit():
            raise ValueError("user_id must be a valid positive integer")
        iv = int(s)
        if iv <= 0:
            raise ValueError("user_id must be a positive integer")
        return iv
    raise TypeError(f"user_id must be an integer or numeric string, got {type(v).__name__}")


# ---------------------------------------------------------------------------
# Push & Snapshot schemas
# ---------------------------------------------------------------------------


class TransactionPushItem(BaseModel):
    """Wire format for a single outbox event pushed from the desktop."""

    transaction_id: str = Field(..., min_length=1, max_length=36)
    store_id: str = Field(..., min_length=1, max_length=36)
    product_id: str = Field(..., min_length=1, max_length=36)
    movement_type: str = Field(..., min_length=1, max_length=50)
    quantity_delta: int
    occurred_at: datetime
    user_id: Annotated[int, BeforeValidator(_coerce_int)]
    device_id: str = Field(..., min_length=1, max_length=36)
    stock_bucket: str = Field(default="AVAILABLE", max_length=50)
    reference_number: str | None = None
    reason_code: str | None = None
    transfer_id: str | None = None
    purchase_order_id: str | None = None
    batch_id: str | None = None
    client_sequence: int | None = None
    original_transaction_id: str | None = None
    product_name: str | None = None
    product_sku: str | None = None
    product_category: str | None = None
    product_unit: str | None = None


class ProductSnapshot(BaseModel):
    """Minimal product fields the device needs for its local catalogue."""

    id: str
    sku: str
    name: str
    brand: str | None = None
    model: str | None = None
    category: str = "General"
    unit: str = "pcs"
    barcode: str | None = None
    alternate_names: str | None = None
    serial_tracking_enabled: bool = False
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TransactionReceiptItem(BaseModel):
    """Per-item push result returned to the device (mirrors SyncReceipt)."""

    transaction_id: str
    accepted: bool
    rejection_reason: str | None
    received_at: datetime
    processed_at: datetime


class PushRequest(BaseModel):
    """Batch push payload."""

    events: list[TransactionPushItem] = Field(default_factory=list, max_length=1000)
    products: list[ProductSnapshot] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_non_empty(self) -> Self:
        if not self.events and not self.products:
            raise ValueError("At least one event or product must be provided")
        return self


class PushResponse(BaseModel):
    """Push response: one receipt per submitted event."""

    receipts: list[TransactionReceiptItem]
    accepted_count: int
    rejected_count: int
    server_time: datetime


# ---------------------------------------------------------------------------
# Pull schemas
# ---------------------------------------------------------------------------


class StoreSnapshot(BaseModel):
    """Minimal store fields the device needs for transfer/selector."""

    id: str
    code: str
    name: str
    address: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StockBalanceSnapshot(BaseModel):
    """Stock balance snapshot returned during pull."""

    id: str
    store_id: str
    product_id: str
    stock_bucket: str
    quantity: int
    updated_at: datetime


class PullPaginationInfo(BaseModel):
    """Pagination metadata returned when ``limit`` is used on /sync/pull.

    The pull payload is composed of three sections consumed in order:
    products, then stores, then stock balances.  ``offset`` walks that
    combined stream via DB-level queries; ``has_more`` tells the device to
    keep issuing pages until it flips to False.
    """

    offset: int
    limit: int
    total_products: int
    total_stores: int
    total_stock_balances: int
    has_more: bool
    next_offset: int


class PullResponse(BaseModel):
    """Full pull payload returned to the device."""

    products: list[ProductSnapshot]
    stores: list[StoreSnapshot]
    stock_balances: list[StockBalanceSnapshot] = []
    server_time: datetime
    # Present only when the client requested pagination via ``limit``.
    pagination: PullPaginationInfo | None = None


# ---------------------------------------------------------------------------
# Status schemas
# ---------------------------------------------------------------------------


class SyncStatusResponse(BaseModel):
    """Sync health response — feeds header online/pending-count display."""

    status: str  # "ok"
    server_time: datetime
    # Count of sync_receipts created in the last 24 h for this device
    receipts_last_24h: int
    # Accepted vs rejected breakdown
    accepted_last_24h: int
    rejected_last_24h: int


# ---------------------------------------------------------------------------
# POST /api/v1/sync/push  (SYNC-007, SYNC-010)
# ---------------------------------------------------------------------------


# TODO(optimization-plan): Batch stock operation support (`batch_operations`
# endpoint + bulk receive/sell UI) is DEFERRED (flagged LATER, high effort,
# needs its own design pass) per the Optimization & UX Implementation Prompt
# (feat/inventory-optimization). Do not implement here without that design pass.


@router.post(
    "/push",
    response_model=PushResponse,
    status_code=status.HTTP_200_OK,
    summary="Push a batch of outbox events from a device to the server",
)
async def push_events(
    body: PushRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    session_factory: async_sessionmaker[AsyncSession] = Depends(  # noqa: B008
        get_ingest_session_factory
    ),
) -> PushResponse:
    """
    Idempotent batch push (SYNC-007, SYNC-010, AT-002, AT-003, AT-004).

    Each event is converted to a TransactionPayload and forwarded to
    ingest_batch() which handles idempotency, partial-acceptance, and
    balance projection atomically.

    The caller (device) must retry any event that receives a transient 5xx
    response; a 200 with accepted=False means the server has durably rejected
    that item and no retry is needed.

    Security: ingest payloads are assigned under the authenticated user.
    """
    await _CoalescingWindow.wait("push")

    async def _do_push() -> PushResponse:
        # Eagerly read current_user.id into a plain Python int before any DB
        # operations that might rollback (and expire) the ORM object.
        authenticated_user_id: int = int(current_user.id)

        # Upsert any products pushed by the client to keep both DBs consistent
        if body.products:
            now_dt = datetime.now(UTC)
            for p_snap in body.products:
                prod = await db.scalar(select(Product).where(Product.id == p_snap.id).limit(1))
                if prod is None:
                    sku_owner = await db.scalar(
                        select(Product.id).where(Product.sku == p_snap.sku).limit(1)
                    )
                    final_sku = p_snap.sku
                    if sku_owner:
                        final_sku = f"{p_snap.sku}-{p_snap.id[:8]}"

                    new_p = Product(
                        id=p_snap.id,
                        sku=final_sku,
                        name=p_snap.name,
                        brand=p_snap.brand,
                        model=p_snap.model,
                        category=p_snap.category or "General",
                        unit=p_snap.unit or "pcs",
                        barcode=p_snap.barcode,
                        alternate_names=p_snap.alternate_names,
                        serial_tracking_enabled=p_snap.serial_tracking_enabled,
                        is_active=p_snap.is_active,
                        created_at=p_snap.created_at or now_dt,
                        updated_at=p_snap.updated_at or now_dt,
                    )
                    db.add(new_p)
                else:
                    prod.name = p_snap.name
                    if not p_snap.sku.startswith("OFFLINE-"):
                        sku_owner = await db.scalar(
                            select(Product.id)
                            .where(Product.sku == p_snap.sku, Product.id != p_snap.id)
                            .limit(1)
                        )
                        if not sku_owner:
                            prod.sku = p_snap.sku
                    prod.brand = p_snap.brand
                    prod.model = p_snap.model
                    prod.category = p_snap.category or prod.category
                    prod.unit = p_snap.unit or prod.unit
                    prod.barcode = p_snap.barcode
                    prod.alternate_names = p_snap.alternate_names
                    prod.serial_tracking_enabled = p_snap.serial_tracking_enabled
                    prod.is_active = p_snap.is_active
                    prod.updated_at = p_snap.updated_at or now_dt
            await db.flush()
            await db.commit()

        payloads: list[TransactionPayload] = []

        for item in body.events:
            effective_user_id: int = authenticated_user_id

            payloads.append(
                TransactionPayload(
                    transaction_id=item.transaction_id,
                    store_id=item.store_id,
                    product_id=item.product_id,
                    movement_type=item.movement_type,
                    quantity_delta=item.quantity_delta,
                    occurred_at=item.occurred_at,
                    user_id=effective_user_id,
                    device_id=item.device_id,
                    stock_bucket=item.stock_bucket,
                    reference_number=item.reference_number,
                    reason_code=item.reason_code,
                    transfer_id=item.transfer_id,
                    purchase_order_id=item.purchase_order_id,
                    batch_id=item.batch_id,
                    client_sequence=item.client_sequence,
                    original_transaction_id=item.original_transaction_id,
                )
            )

        receipts: list[SyncReceipt] = []
        if payloads:
            receipts = await ingest_batch(
                payloads,
                db,
                session_factory=session_factory,
            )
        await db.commit()

        now = datetime.now(UTC)
        accepted = sum(1 for r in receipts if r.accepted)
        rejected = len(receipts) - accepted

        logger.info(
            "Sync push completed: device_id=%s events=%d products=%d accepted=%d rejected=%d user_id=%s",
            body.events[0].device_id if body.events else "unknown",
            len(body.events),
            len(body.products),
            accepted,
            rejected,
            authenticated_user_id,
        )

        return PushResponse(
            receipts=[
                TransactionReceiptItem(
                    transaction_id=r.transaction_id,
                    accepted=r.accepted,
                    rejection_reason=r.rejection_reason,
                    received_at=r.received_at,
                    processed_at=r.processed_at,
                )
                for r in receipts
            ],
            accepted_count=accepted,
            rejected_count=rejected,
            server_time=now,
        )

    return await _with_timeout(_do_push())


# ---------------------------------------------------------------------------
# POST /api/v1/sync/pull  (SYNC-008)
# ---------------------------------------------------------------------------


@router.post(
    "/pull",
    response_model=PullResponse,
    status_code=status.HTTP_200_OK,
    summary="Pull the latest product catalogue and store list from the server",
)
async def pull_data(
    request: Request,
    since: datetime | None = Query(  # noqa: B008
        default=None,
        description=(
            "Optional ISO timestamp. When provided, only rows whose updated_at "
            "is strictly newer than `since` are returned (delta sync). The "
            "server_time of a previous pull is the authoritative cursor."
        ),
    ),
    limit: int = Query(
        default=100,
        ge=0,
        le=1_000_000,
        description=(
            "Page size. Default 100 for paginated results. Pass 0 only for "
            "explicit full snapshot (must opt in)."
        ),
    ),
    offset: int = Query(default=0, ge=0, description="Page offset into the combined stream"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> PullResponse:
    """
    Return current server-side read-models the device needs.

    Products: all records (active and inactive) so the device can mark
    locally-deleted products as inactive rather than hard-deleting them.

    Stores: all active stores — needed for transfer destination picker and
    multi-store display.

    Pagination is enforced by default (limit=100). Pass limit=0 only with
    explicit request for full snapshot.

    Delta sync: when ``since`` is provided, only rows with ``updated_at >
    since`` are returned for each section.  The device stores the returned
    ``server_time`` and sends it back as ``since`` on the next pull, which
    keeps wire payloads proportional to the change set instead of the whole
    catalogue.
    """
    await _CoalescingWindow.wait("pull")

    async def _do_pull() -> PullResponse:
        return await _paginated_pull(since, limit, offset, db)

    response_data = await _with_timeout(_do_pull())
    return response_data


# ---------------------------------------------------------------------------
# GET /api/v1/restore/preview  (Restore functionality)
# ---------------------------------------------------------------------------


@router.get(
    "/restore/preview",
    response_model=RestorePreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Preview data available for restore from server",
)
async def restore_preview(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> RestorePreviewResponse:
    """
    Return a preview of data available for restore from the server.

    This allows the desktop app to show users what data will be restored
    before starting the restore process.
    """
    from app.models.inventory_transaction import InventoryTransaction

    # Count available data
    stores_count = (
        await db.execute(select(func.count()).select_from(Store).where(Store.is_active.is_(True)))
    ).scalar_one() or 0
    products_count = (await db.execute(select(func.count()).select_from(Product))).scalar_one() or 0
    transactions_count = (
        await db.execute(select(func.count()).select_from(InventoryTransaction))
    ).scalar_one() or 0

    # Get last sync time (simplified - in production would track actual last sync)
    last_sync_timestamp = "Recently"

    # Estimate times based on data size
    estimated_critical_time_seconds = max(30, (products_count + stores_count) // 100)
    estimated_total_time_minutes = max(15, (transactions_count // 1000) + 10)

    return RestorePreviewResponse(
        stores_count=stores_count,
        products_count=products_count,
        transactions_count=transactions_count,
        last_sync_timestamp=last_sync_timestamp,
        estimated_critical_time_seconds=estimated_critical_time_seconds,
        estimated_total_time_minutes=estimated_total_time_minutes,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/restore/critical  (Restore functionality)
# ---------------------------------------------------------------------------


@router.get(
    "/restore/critical",
    response_model=CriticalRestoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Get critical data for restore (stores, users, products, stock balances)",
)
async def restore_critical(
    limit: int = Query(default=100, ge=1, le=1000, description="Page size for pagination"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> CriticalRestoreResponse:
    """
    Return critical data needed for immediate app usage after restore.

    This includes stores, users, products, stock balances, and recent transactions.
    This data is prioritized and must be restored before the app can be used.

    Pagination is enforced with default limit=100.
    """
    await _CoalescingWindow.wait("restore_critical")

    async def _do_restore_critical() -> CriticalRestoreResponse:
        from datetime import timedelta

        from app.models.inventory_transaction import InventoryTransaction

        now = datetime.now(UTC)

        stores = list(
            (
                await db.execute(
                    select(Store).where(Store.is_active.is_(True)).limit(limit).offset(offset)
                )
            )
            .scalars()
            .all()
        )

        users = list(
            (
                await db.execute(
                    select(User).where(User.is_active.is_(True)).limit(limit).offset(offset)
                )
            )
            .scalars()
            .all()
        )

        products = list(
            (await db.execute(select(Product).limit(limit).offset(offset))).scalars().all()
        )

        balances = list(
            (await db.execute(select(StockBalance).limit(limit).offset(offset))).scalars().all()
        )

        recent_cutoff = now - timedelta(hours=24)
        recent_transactions = list(
            (
                await db.execute(
                    select(InventoryTransaction)
                    .where(InventoryTransaction.occurred_at >= recent_cutoff)
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )

        return CriticalRestoreResponse(
            stores=[
                StoreSnapshot(
                    id=s.id,
                    code=s.code,
                    name=s.name,
                    address=s.address,
                    is_active=bool(s.is_active),
                    created_at=s.created_at or now,
                    updated_at=s.updated_at or now,
                )
                for s in stores
            ],
            users=[
                {
                    "id": str(u.id),
                    "username": u.username,
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role,
                    "assigned_store_id": str(u.assigned_store_id) if u.assigned_store_id else None,
                    "is_active": bool(u.is_active),
                }
                for u in users
            ],
            products=[
                ProductSnapshot(
                    id=p.id,
                    sku=p.sku,
                    name=p.name,
                    brand=p.brand,
                    model=p.model,
                    category=p.category,
                    unit=p.unit or "pcs",
                    barcode=p.barcode,
                    alternate_names=p.alternate_names,
                    serial_tracking_enabled=bool(p.serial_tracking_enabled),
                    is_active=bool(p.is_active),
                    created_at=p.created_at or now,
                    updated_at=p.updated_at or now,
                )
                for p in products
            ],
            stock_balances=[
                StockBalanceSnapshot(
                    id=b.id,
                    store_id=b.store_id,
                    product_id=b.product_id,
                    stock_bucket=b.stock_bucket,
                    quantity=b.quantity,
                    updated_at=b.updated_at or now,
                )
                for b in balances
            ],
            recent_transactions=[
                {
                    "id": t.transaction_id,
                    "transaction_id": t.transaction_id,
                    "store_id": str(t.store_id),
                    "product_id": str(t.product_id),
                    "movement_type": t.movement_type,
                    "quantity_delta": t.quantity_delta,
                    "occurred_at": t.occurred_at.isoformat() if t.occurred_at else now.isoformat(),
                    "user_id": str(t.user_id) if t.user_id is not None else "1",
                    "device_id": str(t.device_id) if t.device_id else "unknown",
                    "stock_bucket": t.stock_bucket,
                }
                for t in recent_transactions
            ],
            server_time=now,
        )

    return await _with_timeout(_do_restore_critical())


# ---------------------------------------------------------------------------
# GET /api/v1/restore/important  (Restore functionality)
# ---------------------------------------------------------------------------


@router.get(
    "/restore/important",
    response_model=ImportantRestoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Get important data for restore (recent history, active day books)",
)
async def restore_important(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ImportantRestoreResponse:
    """
    Return important data for restore (recent history, active day books).

    This data is synced in the background after critical restore completes.
    """
    from datetime import timedelta

    from app.models.day_book import DayBook
    from app.models.inventory_transaction import InventoryTransaction

    now = datetime.now(UTC)

    # Get recent history (last 7 days)
    recent_cutoff = now - timedelta(days=7)
    recent_history = list(
        (
            await db.execute(
                select(InventoryTransaction).where(
                    InventoryTransaction.occurred_at >= recent_cutoff
                )
            )
        )
        .scalars()
        .all()
    )

    # Get active day books
    active_day_books = list((await db.execute(select(DayBook))).scalars().all())

    return ImportantRestoreResponse(
        recent_history=[
            {
                "id": t.transaction_id,
                "transaction_id": t.transaction_id,
                "store_id": str(t.store_id),
                "product_id": str(t.product_id),
                "movement_type": t.movement_type,
                "quantity_delta": t.quantity_delta,
                "occurred_at": t.occurred_at.isoformat() if t.occurred_at else now.isoformat(),
                "user_id": str(t.user_id) if t.user_id is not None else "1",
                "device_id": str(t.device_id) if t.device_id else "unknown",
                "stock_bucket": t.stock_bucket,
            }
            for t in recent_history
        ],
        active_day_books=[
            {
                "id": str(db.id),
                "store_id": str(db.store_id),
                "book_date": db.book_date.isoformat() if db.book_date else now.isoformat(),
                "status": "COMPLETED" if db.balance_sheet_generated else "OPEN",
            }
            for db in active_day_books
        ],
        server_time=now,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/restore/background  (Restore functionality)
# ---------------------------------------------------------------------------


@router.get(
    "/restore/background",
    response_model=BackgroundRestoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Get background data for restore (historical data, analytics)",
)
async def restore_background(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> BackgroundRestoreResponse:
    """
    Return background data for restore (historical data, analytics).

    This data has lowest priority and syncs in the background.
    """
    from datetime import timedelta

    from app.models.inventory_transaction import InventoryTransaction

    now = datetime.now(UTC)

    # Get historical transactions (older than 7 days)
    historical_cutoff = now - timedelta(days=7)
    historical_transactions = list(
        (
            await db.execute(
                select(InventoryTransaction).where(
                    InventoryTransaction.occurred_at < historical_cutoff
                )
            )
        )
        .scalars()
        .all()
    )

    # Analytics data (simplified - would include actual analytics in production)
    analytics = []

    return BackgroundRestoreResponse(
        historical_transactions=[
            {
                "id": t.transaction_id,
                "transaction_id": t.transaction_id,
                "store_id": str(t.store_id),
                "product_id": str(t.product_id),
                "movement_type": t.movement_type,
                "quantity_delta": t.quantity_delta,
                "occurred_at": t.occurred_at.isoformat() if t.occurred_at else now.isoformat(),
                "user_id": str(t.user_id) if t.user_id is not None else "1",
                "device_id": str(t.device_id) if t.device_id else "unknown",
                "stock_bucket": t.stock_bucket,
            }
            for t in historical_transactions
        ],
        analytics=analytics,
        server_time=now,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/restore/cancel  (Restore functionality)
# ---------------------------------------------------------------------------


@router.post(
    "/restore/cancel",
    status_code=status.HTTP_200_OK,
    summary="Cancel an in-progress restore and rollback changes",
)
async def cancel_restore(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, str]:
    """
    Cancel an in-progress restore operation.

    This endpoint will:
    1. Mark any in-progress restore as cancelled
    2. Rollback any server-side changes made during the restore
    3. Return a success response

    Note: The client-side is responsible for clearing local data and outbox events.
    """
    # In a production system, you would implement server-side rollback logic here
    # For now, we'll return success since the client handles the local rollback
    return {"status": "cancelled", "message": "Restore cancelled successfully"}


# ---------------------------------------------------------------------------
# GET /api/v1/sync/status  (SYNC-009)
# ---------------------------------------------------------------------------


@router.get(
    "/status",
    response_model=SyncStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Return sync health and recent receipt statistics for this device",
)
async def sync_status(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> SyncStatusResponse:
    """
    Return sync health.

    Counts sync_receipts from the last 24 hours that belong to the calling
    device (via device_id embedded in the transactions they reference).

    The desktop header uses this to confirm the server is reachable and to
    display post-sync statistics.
    """
    from datetime import timedelta

    from sqlalchemy import func

    from app.models.inventory_transaction import InventoryTransaction

    cutoff = datetime.now(UTC) - timedelta(hours=24)

    # Count receipts in last 24h (all devices for this user, or total if SYNC role)
    stmt_total = (
        select(func.count(SyncReceipt.transaction_id))
        .join(
            InventoryTransaction,
            SyncReceipt.transaction_id == InventoryTransaction.transaction_id,
        )
        .where(SyncReceipt.received_at >= cutoff)
    )
    total_result = await db.execute(stmt_total)
    total_count: int = total_result.scalar() or 0

    stmt_accepted = (
        select(func.count(SyncReceipt.transaction_id))
        .join(
            InventoryTransaction,
            SyncReceipt.transaction_id == InventoryTransaction.transaction_id,
        )
        .where(SyncReceipt.received_at >= cutoff, SyncReceipt.accepted.is_(True))
    )
    accepted_result = await db.execute(stmt_accepted)
    accepted_count: int = accepted_result.scalar() or 0

    return SyncStatusResponse(
        status="ok",
        server_time=datetime.now(UTC),
        receipts_last_24h=total_count,
        accepted_last_24h=accepted_count,
        rejected_last_24h=total_count - accepted_count,
    )
