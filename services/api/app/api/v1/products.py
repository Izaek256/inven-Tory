"""
Product search and inventory endpoints — Issue 16 (FR-SRCH-001–005).

GET /api/v1/products/search?q=<query>[&limit=<n>]
    Full-text substring search across name, SKU, barcode, brand, model
    and alternate_names.  Returns matching products with no stock data
    (stock detail lives in /products/{id}/inventory).

GET /api/v1/products/{product_id}/inventory
    Per-store stock breakdown for a single product (FR-SRCH-002/003).
    Returns one row per store that has a stock_balance entry, plus the
    global total across all stores and buckets.

GET /api/v1/products/{product_id}/history
    Movement history for a single product (FR-SRCH-004).
    Returns the 100 most recent InventoryTransaction rows newest-first,
    scoped to the product and optionally filtered by store.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["products"])

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ProductSearchResult(BaseModel):
    id: str
    sku: str
    name: str
    brand: str | None
    model: str | None
    category: str
    unit: str
    barcode: str | None
    is_active: bool
    low_stock_threshold: int | None


class ProductSearchResponse(BaseModel):
    results: list[ProductSearchResult]
    total: int
    query: str


class StoreInventoryRow(BaseModel):
    store_id: str
    store_code: str
    store_name: str
    stock_bucket: str
    quantity: int
    updated_at: datetime


class ProductInventoryResponse(BaseModel):
    product_id: str
    product_name: str
    product_sku: str
    stores: list[StoreInventoryRow]
    total_quantity: int


class MovementHistoryRow(BaseModel):
    transaction_id: str
    store_id: str
    store_code: str
    store_name: str
    movement_type: str
    stock_bucket: str
    quantity_delta: int
    occurred_at: datetime
    reference_number: str | None
    reason_code: str | None


class ProductHistoryResponse(BaseModel):
    product_id: str
    product_name: str
    product_sku: str
    rows: list[MovementHistoryRow]
    total_rows: int


# ---------------------------------------------------------------------------
# GET /api/v1/products/search
# ---------------------------------------------------------------------------


@router.get(
    "/search",
    response_model=ProductSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Global product search (FR-SRCH-001)",
)
async def search_products(
    q: str = Query(..., min_length=1, max_length=200, description="Search term"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum results to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> ProductSearchResponse:
    """
    Substring search across product name, SKU, barcode, brand, model
    and alternate_names.  Case-insensitive.

    Requires INVENTORY_READ permission (all authenticated roles qualify).
    """
    term = f"%{q.lower()}%"
    stmt = (
        select(Product)
        .where(
            or_(
                func.lower(Product.name).like(term),
                func.lower(Product.sku).like(term),
                func.lower(Product.brand).like(term),
                func.lower(Product.model).like(term),
                func.lower(Product.barcode).like(term),
                func.lower(Product.alternate_names).like(term),
            )
        )
        .order_by(Product.name)
        .limit(limit)
    )

    result = await db.execute(stmt)
    products: list[Product] = list(result.scalars().all())

    logger.info("PRODUCT_SEARCH q=%r results=%d user_id=%s", q, len(products), _user.id)

    return ProductSearchResponse(
        results=[
            ProductSearchResult(
                id=p.id,
                sku=p.sku,
                name=p.name,
                brand=p.brand,
                model=p.model,
                category=p.category,
                unit=p.unit or "pcs",
                barcode=p.barcode,
                is_active=bool(p.is_active),
                low_stock_threshold=p.low_stock_threshold,
            )
            for p in products
        ],
        total=len(products),
        query=q,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/products/{product_id}/inventory
# ---------------------------------------------------------------------------


@router.get(
    "/{product_id}/inventory",
    response_model=ProductInventoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Per-store inventory breakdown for a product (FR-SRCH-002/003)",
)
async def get_product_inventory(
    product_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> ProductInventoryResponse:
    """
    Return current stock quantities for a product, broken down by store
    and stock bucket.  Also computes the global total across all stores.

    FR-SRCH-002: quantity by store.
    FR-SRCH-003: total global quantity.
    """
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    # Fetch all balance rows for this product, joined with store info
    stmt = (
        select(StockBalance, Store)
        .join(Store, StockBalance.store_id == Store.id)
        .where(StockBalance.product_id == product_id)
        .order_by(Store.name, StockBalance.stock_bucket)
    )
    result = await db.execute(stmt)
    rows = result.all()

    store_rows: list[StoreInventoryRow] = []
    total_quantity = 0

    for balance, store in rows:
        store_rows.append(
            StoreInventoryRow(
                store_id=store.id,
                store_code=store.code,
                store_name=store.name,
                stock_bucket=balance.stock_bucket,
                quantity=balance.quantity,
                updated_at=balance.updated_at,
            )
        )
        total_quantity += balance.quantity

    return ProductInventoryResponse(
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        stores=store_rows,
        total_quantity=total_quantity,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/products/{product_id}/history
# ---------------------------------------------------------------------------


@router.get(
    "/{product_id}/history",
    response_model=ProductHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Movement history for a product (FR-SRCH-004)",
)
async def get_product_history(
    product_id: str,
    store_id: str | None = Query(default=None, description="Filter by store"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum rows to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> ProductHistoryResponse:
    """
    Return movement history for a product (FR-SRCH-004).

    Newest events first.  Optionally scoped to a single store.
    Limited to 100 rows by default (max 500).
    """
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    stmt = (
        select(InventoryTransaction, Store)
        .join(Store, InventoryTransaction.store_id == Store.id)
        .where(InventoryTransaction.product_id == product_id)
    )

    if store_id is not None:
        stmt = stmt.where(InventoryTransaction.store_id == store_id)

    stmt = stmt.order_by(InventoryTransaction.occurred_at.desc()).limit(limit)

    result = await db.execute(stmt)
    tx_rows = result.all()

    now = datetime.now(UTC)
    logger.info(
        "PRODUCT_HISTORY product_id=%s store_id=%s rows=%d user_id=%s at=%s",
        product_id,
        store_id,
        len(tx_rows),
        _user.id,
        now,
    )

    return ProductHistoryResponse(
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        rows=[
            MovementHistoryRow(
                transaction_id=tx.transaction_id,
                store_id=store.id,
                store_code=store.code,
                store_name=store.name,
                movement_type=tx.movement_type,
                stock_bucket=tx.stock_bucket,
                quantity_delta=tx.quantity_delta,
                occurred_at=tx.occurred_at,
                reference_number=tx.reference_number,
                reason_code=tx.reason_code,
            )
            for tx, store in tx_rows
        ],
        total_rows=len(tx_rows),
    )
