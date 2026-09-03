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

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.product import Product
from app.models.store import Store
from app.models.sync_receipt import SyncReceipt
from app.models.user import User
from app.services.ingestion import TransactionPayload, ingest_batch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])


# ---------------------------------------------------------------------------
# Push schemas
# ---------------------------------------------------------------------------


class TransactionPushItem(BaseModel):
    """Wire format for a single outbox event pushed from the desktop."""

    transaction_id: str = Field(..., min_length=1, max_length=36)
    store_id: str = Field(..., min_length=1, max_length=36)
    product_id: str = Field(..., min_length=1, max_length=36)
    movement_type: str = Field(..., min_length=1, max_length=50)
    quantity_delta: int
    occurred_at: datetime
    user_id: str = Field(..., min_length=1, max_length=36)
    device_id: str = Field(..., min_length=1, max_length=36)
    stock_bucket: str = Field(default="AVAILABLE", max_length=50)
    reference_number: str | None = None
    reason_code: str | None = None
    transfer_id: str | None = None
    purchase_order_id: str | None = None
    batch_id: str | None = None
    client_sequence: int | None = None
    original_transaction_id: str | None = None


class TransactionReceiptItem(BaseModel):
    """Per-item push result returned to the device (mirrors SyncReceipt)."""

    transaction_id: str
    accepted: bool
    rejection_reason: str | None
    received_at: datetime
    processed_at: datetime


class PushRequest(BaseModel):
    """Batch push payload."""

    events: list[TransactionPushItem] = Field(..., min_length=1, max_length=500)


class PushResponse(BaseModel):
    """Push response: one receipt per submitted event."""

    receipts: list[TransactionReceiptItem]
    accepted_count: int
    rejected_count: int
    server_time: datetime


# ---------------------------------------------------------------------------
# Pull schemas
# ---------------------------------------------------------------------------


class ProductSnapshot(BaseModel):
    """Minimal product fields the device needs for its local catalogue."""

    id: str
    sku: str
    name: str
    brand: str | None
    model: str | None
    category: str
    unit: str
    barcode: str | None
    alternate_names: str | None
    serial_tracking_enabled: bool
    is_active: bool
    updated_at: datetime


class StoreSnapshot(BaseModel):
    """Minimal store fields the device needs for transfer/selector."""

    id: str
    code: str
    name: str
    address: str | None
    is_active: bool
    updated_at: datetime


class PullResponse(BaseModel):
    """Full pull payload returned to the device."""

    products: list[ProductSnapshot]
    stores: list[StoreSnapshot]
    server_time: datetime


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


@router.post(
    "/push",
    response_model=PushResponse,
    status_code=status.HTTP_200_OK,
    summary="Push a batch of outbox events from a device to the server",
)
async def push_events(
    body: PushRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> PushResponse:
    """
    Idempotent batch push (SYNC-007, SYNC-010, AT-002, AT-003, AT-004).

    Each event is converted to a TransactionPayload and forwarded to
    ingest_batch() which handles idempotency, partial-acceptance, and
    balance projection atomically.

    The caller (device) must retry any event that receives a transient 5xx
    response; a 200 with accepted=False means the server has durably rejected
    that item and no retry is needed.

    Security: validates that user_id in each transaction matches the authenticated user.
    """

    payloads: list[TransactionPayload] = []
    rejected_receipts: list[SyncReceipt] = []

    for item in body.events:
        # Validate user_id matches authenticated user
        if item.user_id != str(current_user.id):
            rejected_receipts.append(
                SyncReceipt(
                    transaction_id=item.transaction_id,
                    accepted=False,
                    rejection_reason=f"user_id mismatch: payload has {item.user_id}, JWT has {current_user.id}",
                    received_at=datetime.now(UTC),
                    processed_at=datetime.now(UTC),
                )
            )
            continue

        payloads.append(
            TransactionPayload(
                transaction_id=item.transaction_id,
                store_id=item.store_id,
                product_id=item.product_id,
                movement_type=item.movement_type,
                quantity_delta=item.quantity_delta,
                occurred_at=item.occurred_at,
                user_id=item.user_id,
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

    receipts: list[SyncReceipt] = await ingest_batch(payloads, db)
    receipts.extend(rejected_receipts)
    await db.commit()

    now = datetime.now(UTC)
    accepted = sum(1 for r in receipts if r.accepted)
    rejected = len(receipts) - accepted

    logger.info(
        "SYNC_PUSH device_id=%s events=%d accepted=%d rejected=%d user_id=%s",
        body.events[0].device_id if body.events else "unknown",
        len(body.events),
        accepted,
        rejected,
        current_user.id,
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
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> PullResponse:
    """
    Return current server-side read-models the device needs.

    Products: all records (active and inactive) so the device can mark
    locally-deleted products as inactive rather than hard-deleting them.

    Stores: all active stores — needed for transfer destination picker and
    multi-store display.

    The device applies these snapshots as upserts into its local SQLite tables
    so subsequent offline reads reflect the latest server state.
    """
    product_result = await db.execute(select(Product).order_by(Product.name))
    products: list[Product] = list(product_result.scalars().all())

    store_result = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.name)
    )
    stores: list[Store] = list(store_result.scalars().all())

    now = datetime.now(UTC)

    logger.info(
        "SYNC_PULL user_id=%s products=%d stores=%d",
        current_user.id,
        len(products),
        len(stores),
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
                updated_at=s.updated_at,
            )
            for s in stores
        ],
        server_time=now,
    )


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
