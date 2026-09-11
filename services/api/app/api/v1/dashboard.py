"""
Dashboard analytics endpoints — web Dashboard tile data (Phase 3, Task B).

GET /api/v1/dashboard/metrics
    Aggregated KPI payload consumed by the web dashboard's tile grid:

    - total_products           — products in the master catalogue
    - total_stock_units        — SUM of AVAILABLE quantity across all stores
    - last_sync_at             — most recent stock-balance update (mirrors the
                                  per-store last-sync concept globally)
    - most_sold                — top products by SALE line quantity (needs the
                                  "sold" signal: movement_type == 'SALE')
    - low_stock                — products whose AVAILABLE quantity is below
                                  product.low_stock_threshold (reuses the existing
                                  threshold field; products without a threshold
                                  are not flagged)
    - cross_store              — how many products are stocked in more than one
                                  store, plus the combined quantity
    - receipt_linked_sales     — per-day volume of receipt-linked SALE activity
                                  (count of distinct receipt/reference numbers,
                                  items sold, and average items per receipt)

The endpoint is read-only aggregation.  All quantities are derived from the
existing StockBalance / InventoryTransaction projections; nothing is mutated.

The response is intentionally shaped as a flat dict of named metrics so the
front-end tile grid can grow without schema churn.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.inventory_transaction import InventoryTransaction
from app.models.product import Product
from app.models.stock_balance import StockBalance
from app.models.store import Store
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Number of days of receipt-linked sales history to report.
RECEIPT_SALES_DAYS = 14
# Number of top sellers to return.
MOST_SOLD_LIMIT = 5

# Movement type that represents a sale in this schema.
SALE_MOVEMENT_TYPE = "SALE"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class MostSoldProduct(BaseModel):
    product_id: str
    product_name: str
    sku: str
    units_sold: int


class LowStockProduct(BaseModel):
    product_id: str
    product_name: str
    sku: str
    unit: str
    quantity: int
    threshold: int


class CrossStoreSummary(BaseModel):
    products_in_multiple_stores: int
    stores_with_stock: int
    combined_quantity: int


class ReceiptSalesDay(BaseModel):
    date: str  # YYYY-MM-DD
    receipt_count: int
    items_sold: int
    avg_items_per_receipt: float


class DashboardMetricsResponse(BaseModel):
    total_products: int
    total_stock_units: int
    last_sync_at: datetime | None
    most_sold: list[MostSoldProduct]
    low_stock: list[LowStockProduct]
    cross_store: CrossStoreSummary
    receipt_linked_sales: list[ReceiptSalesDay]


@router.get(
    "/metrics",
    response_model=DashboardMetricsResponse,
    summary="Aggregated dashboard KPI metrics",
)
async def dashboard_metrics(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> DashboardMetricsResponse:
    """Aggregate the KPI tile data for the web dashboard (read-only)."""

    total_products = int((await db.execute(select(func.count(Product.id)))).scalar_one() or 0)

    stock_stmt = select(
        func.coalesce(func.sum(StockBalance.quantity), 0),
        func.max(StockBalance.updated_at),
    ).where(StockBalance.stock_bucket == "AVAILABLE")
    total_stock_units, last_sync_at = (await db.execute(stock_stmt)).one()
    total_stock_units = int(total_stock_units or 0)

    # Most-sold products: sum |quantity_delta| for SALE lines.
    sale_stmt = (
        select(
            InventoryTransaction.product_id,
            func.sum(func.abs(InventoryTransaction.quantity_delta)).label("units_sold"),
        )
        .where(InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE)
        .group_by(InventoryTransaction.product_id)
        .order_by(func.sum(func.abs(InventoryTransaction.quantity_delta)).desc())
        .limit(MOST_SOLD_LIMIT)
    )
    sale_rows = (await db.execute(sale_stmt)).all()
    sale_product_ids = [r.product_id for r in sale_rows]
    sale_name_map: dict[str, tuple[str, str]] = {}
    if sale_product_ids:
        p_rows = (
            await db.execute(
                select(Product.id, Product.name, Product.sku).where(
                    Product.id.in_(sale_product_ids)
                )
            )
        ).all()
        sale_name_map = {prow.id: (prow.name, prow.sku) for prow in p_rows}

    most_sold: list[MostSoldProduct] = []
    for row in sale_rows:
        name, sku = sale_name_map.get(row.product_id, ("Unknown", "N/A"))
        most_sold.append(
            MostSoldProduct(
                product_id=row.product_id,
                product_name=name,
                sku=sku,
                units_sold=int(row.units_sold or 0),
            )
        )

    # Low-stock alerts: products where AVAILABLE stock < low_stock_threshold.
    low_stmt = (
        select(Product, func.coalesce(func.sum(StockBalance.quantity), 0))
        .outerjoin(
            StockBalance,
            and_(
                StockBalance.product_id == Product.id,
                StockBalance.stock_bucket == "AVAILABLE",
            ),
        )
        .where(Product.low_stock_threshold.is_not(None))
        .group_by(Product.id)
    )
    low_rows = (await db.execute(low_stmt)).all()
    low_stock: list[LowStockProduct] = []
    for product, quantity in low_rows:
        threshold = product.low_stock_threshold or 0
        quantity = int(quantity or 0)
        if quantity < threshold:
            low_stock.append(
                LowStockProduct(
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    unit=product.unit or "pcs",
                    quantity=quantity,
                    threshold=threshold,
                )
            )
    low_stock.sort(key=lambda r: (r.quantity - r.threshold))

    # Cross-store distribution: products present in more than one store.
    store_count_stmt = (
        select(StockBalance.product_id, func.count(func.distinct(StockBalance.store_id)))
        .where(StockBalance.stock_bucket == "AVAILABLE")
        .group_by(StockBalance.product_id)
        .having(func.count(func.distinct(StockBalance.store_id)) > 1)
    )
    multi_rows = (await db.execute(store_count_stmt)).all()
    multi_ids = [r[0] for r in multi_rows]

    combined_quantity = 0
    if multi_ids:
        combined_stmt = (
            select(
                Product.id,
                func.coalesce(func.sum(StockBalance.quantity), 0),
            )
            .join(StockBalance, StockBalance.product_id == Product.id)
            .where(
                and_(
                    Product.id.in_(multi_ids),
                    StockBalance.stock_bucket == "AVAILABLE",
                )
            )
            .group_by(Product.id)
        )
        for row in (await db.execute(combined_stmt)).all():
            combined_quantity += int(row[1] or 0)

    store_totals_stmt = (
        select(Store.id)
        .outerjoin(StockBalance, StockBalance.store_id == Store.id)
        .where(
            and_(
                StockBalance.stock_bucket == "AVAILABLE",
                StockBalance.quantity > 0,
            )
        )
        .group_by(Store.id)
    )
    stores_with_stock = len((await db.execute(store_totals_stmt)).all())

    cross_store = CrossStoreSummary(
        products_in_multiple_stores=len(multi_ids),
        stores_with_stock=stores_with_stock,
        combined_quantity=combined_quantity,
    )

    # Receipt-linked sales volume per day (SALE lines with a reference number).
    since = datetime.now(UTC).date() - timedelta(days=RECEIPT_SALES_DAYS - 1)
    day_map: dict[str, dict[str, int]] = {}
    for offset in range(RECEIPT_SALES_DAYS):
        d = (since + timedelta(days=offset)).isoformat()
        day_map[d] = {"receipts": 0, "items": 0}

    receipt_stmt = (
        select(
            func.date(InventoryTransaction.occurred_at).label("sale_date"),
            InventoryTransaction.reference_number,
            func.count(InventoryTransaction.transaction_id).label("line_items"),
        )
        .where(
            and_(
                InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                InventoryTransaction.reference_number.is_not(None),
                InventoryTransaction.reference_number != "",
                func.date(InventoryTransaction.occurred_at) >= since,
            )
        )
        .group_by("sale_date", InventoryTransaction.reference_number)
    )
    for row in (await db.execute(receipt_stmt)).all():
        d = row.sale_date
        if isinstance(d, (datetime, date)):
            d = d.isoformat()
        if d not in day_map:
            continue
        day_map[d]["items"] += int(row.line_items or 0)
        day_map[d]["receipts"] += 1

    receipt_linked_sales: list[ReceiptSalesDay] = []
    for d, counts in day_map.items():
        receipt_count = int(counts["receipts"])
        items = int(counts["items"])
        receipt_linked_sales.append(
            ReceiptSalesDay(
                date=d,
                receipt_count=receipt_count,
                items_sold=items,
                avg_items_per_receipt=round(items / receipt_count, 2) if receipt_count else 0.0,
            )
        )

    return DashboardMetricsResponse(
        total_products=total_products,
        total_stock_units=total_stock_units,
        last_sync_at=last_sync_at,
        most_sold=most_sold,
        low_stock=low_stock,
        cross_store=cross_store,
        receipt_linked_sales=receipt_linked_sales,
    )
