"""
Store inventory endpoint — Issue 16.

GET /api/v1/stores/{store_id}/inventory
    Full product inventory snapshot for a single store.
    Returns every product that has at least one stock_balance row for this
    store, along with per-bucket quantities, the time of the most recent
    sync event, and the computed freshness classification per Section 14.4.

Freshness thresholds (Section 14.4):
    FRESH       — last sync within 30 minutes
    RECENT      — last sync within 6 hours
    STALE       — last sync within 24 hours
    VERY_STALE  — last sync older than 24 hours (or never synced)

AT-007 groundwork: a disconnected store is classified STALE / VERY_STALE
based on the most recent server_accepted_at timestamp in inventory_transactions
for devices belonging to that store.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_permission
from app.core.permissions import Permission
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stores", tags=["stores"])

# ---------------------------------------------------------------------------
# Freshness thresholds (Section 14.4)
# ---------------------------------------------------------------------------
_FRESH_THRESHOLD = timedelta(minutes=30)
_RECENT_THRESHOLD = timedelta(hours=6)
_STALE_THRESHOLD = timedelta(hours=24)


def compute_freshness(last_sync_at: datetime | None) -> str:
    """
    Classify a store's sync freshness per SRS Section 14.4.

    Returns one of: 'FRESH', 'RECENT', 'STALE', 'VERY_STALE'.
    A store that has never synced (last_sync_at is None) is VERY_STALE.

    SQLite (used in tests) returns naive datetimes from aggregate functions
    even when the column is declared timezone-aware.  We normalise by
    attaching UTC when the tzinfo is absent before computing the age.
    """
    if last_sync_at is None:
        return "VERY_STALE"
    # Normalise naive datetimes from SQLite aggregate results
    if last_sync_at.tzinfo is None:
        last_sync_at = last_sync_at.replace(tzinfo=UTC)
    age = datetime.now(UTC) - last_sync_at
    if age <= _FRESH_THRESHOLD:
        return "FRESH"
    if age <= _RECENT_THRESHOLD:
        return "RECENT"
    if age <= _STALE_THRESHOLD:
        return "STALE"
    return "VERY_STALE"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class StoreListItem(BaseModel):
    id: str
    code: str
    name: str
    address: str | None
    is_active: bool


class CreateStoreRequest(BaseModel):
    code: str
    name: str
    address: str | None = None


class UpdateStoreRequest(BaseModel):
    name: str
    address: str | None = None


class ToggleStoreActiveRequest(BaseModel):
    is_active: bool


class StoreProductRow(BaseModel):
    product_id: str
    product_sku: str
    product_name: str
    category: str
    unit: str
    stock_bucket: str
    quantity: int
    balance_updated_at: datetime


class StoreInventoryResponse(BaseModel):
    store_id: str
    store_code: str
    store_name: str
    is_active: bool
    last_sync_at: datetime | None
    freshness: str  # FRESH | RECENT | STALE | VERY_STALE
    products: list[StoreProductRow]
    total_products: int
    total_quantity: int


# ---------------------------------------------------------------------------
# GET /api/v1/stores
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[StoreListItem],
    status_code=status.HTTP_200_OK,
    summary="List all stores (Issue 16)",
)
async def list_stores(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> list[StoreListItem]:
    """
    Return a list of all stores with basic information.
    Requires authentication.
    """
    stmt = select(Store).order_by(Store.code)
    result = await db.execute(stmt)
    stores = result.scalars().all()

    return [
        StoreListItem(
            id=store.id,
            code=store.code,
            name=store.name,
            address=store.address,
            is_active=bool(store.is_active),
        )
        for store in stores
    ]


@router.post(
    "",
    response_model=StoreListItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new store",
)
async def create_store(
    request: CreateStoreRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.STORE_ADMIN)),  # noqa: B008
) -> StoreListItem:
    """
    Create a new store with the given code, name, and optional address.
    Validates that the code is unique (409 on duplicate).
    """
    # Check for duplicate code
    existing = await db.execute(select(Store).where(Store.code == request.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Store with code '{request.code}' already exists",
        )

    import uuid

    store = Store(
        id=str(uuid.uuid4()),
        code=request.code,
        name=request.name,
        address=request.address,
        is_active=True,
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)

    return StoreListItem(
        id=store.id,
        code=store.code,
        name=store.name,
        address=store.address,
        is_active=bool(store.is_active),
    )


@router.put(
    "/{store_id}",
    response_model=StoreListItem,
    status_code=status.HTTP_200_OK,
    summary="Update store name and address",
)
async def update_store(
    store_id: str,
    request: UpdateStoreRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.STORE_ADMIN)),  # noqa: B008
) -> StoreListItem:
    """
    Update a store's name and address. Code and ID are immutable.
    """
    store = await db.get(Store, store_id)
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    store.name = request.name
    store.address = request.address
    await db.commit()
    await db.refresh(store)

    return StoreListItem(
        id=store.id,
        code=store.code,
        name=store.name,
        address=store.address,
        is_active=bool(store.is_active),
    )


@router.patch(
    "/{store_id}/toggle-active",
    response_model=StoreListItem,
    status_code=status.HTTP_200_OK,
    summary="Toggle store active status",
)
async def toggle_store_active(
    store_id: str,
    request: ToggleStoreActiveRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.STORE_ADMIN)),  # noqa: B008
) -> StoreListItem:
    """
    Activate or deactivate a store.
    """
    store = await db.get(Store, store_id)
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    store.is_active = request.is_active
    await db.commit()
    await db.refresh(store)

    return StoreListItem(
        id=store.id,
        code=store.code,
        name=store.name,
        address=store.address,
        is_active=bool(store.is_active),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/stores/{store_id}/inventory
# ---------------------------------------------------------------------------


@router.get(
    "/{store_id}/inventory",
    response_model=StoreInventoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Full product inventory snapshot for a store (Section 14.1)",
)
async def get_store_inventory(
    store_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> StoreInventoryResponse:
    """
    Return all products with stock at this store, plus sync freshness.

    Freshness is computed from the most recent server_accepted_at timestamp
    in inventory_transactions for this store (AT-007: disconnected stores
    are classified STALE or VERY_STALE).

    Section 14.1 mockup "VIEW" drill-down target.
    """
    store = await db.get(Store, store_id)
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    # Determine last sync timestamp — most recent server_accepted_at for this store
    last_sync_stmt = select(func.max(InventoryTransaction.server_accepted_at)).where(
        InventoryTransaction.store_id == store_id,
        InventoryTransaction.sync_status == "ACCEPTED",
    )
    last_sync_result = await db.execute(last_sync_stmt)
    last_sync_at: datetime | None = last_sync_result.scalar()

    freshness = compute_freshness(last_sync_at)

    # Fetch all stock balances for this store joined with product info
    stmt = (
        select(StockBalance, Product)
        .join(Product, StockBalance.product_id == Product.id)
        .where(StockBalance.store_id == store_id)
        .order_by(Product.name, StockBalance.stock_bucket)
    )
    result = await db.execute(stmt)
    rows = result.all()

    product_rows: list[StoreProductRow] = []
    total_quantity = 0
    seen_product_ids: set[str] = set()

    for balance, product in rows:
        product_rows.append(
            StoreProductRow(
                product_id=product.id,
                product_sku=product.sku,
                product_name=product.name,
                category=product.category,
                unit=product.unit or "pcs",
                stock_bucket=balance.stock_bucket,
                quantity=balance.quantity,
                balance_updated_at=balance.updated_at,
            )
        )
        total_quantity += balance.quantity
        seen_product_ids.add(product.id)

    logger.info(
        "STORE_INVENTORY store_id=%s freshness=%s products=%d user_id=%s",
        store_id,
        freshness,
        len(seen_product_ids),
        _user.id,
    )

    return StoreInventoryResponse(
        store_id=store.id,
        store_code=store.code,
        store_name=store.name,
        is_active=bool(store.is_active),
        last_sync_at=last_sync_at,
        freshness=freshness,
        products=product_rows,
        total_products=len(seen_product_ids),
        total_quantity=total_quantity,
    )
