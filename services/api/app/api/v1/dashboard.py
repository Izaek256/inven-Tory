"""
Dashboard analytics endpoints — web Dashboard tile data (Phase 3, Task B) + Phase 4 analytics.

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

GET /api/v1/dashboard/stock-trend
    Daily total stock units time series over a date range.

GET /api/v1/dashboard/category-distribution
    Product count distribution by category (donut chart data).

GET /api/v1/dashboard/stock-status-by-category
    Per-category stacked bar data: In Stock / Low Stock / Out of Stock counts.

GET /api/v1/dashboard/kpi-deltas
    Period-over-period deltas for KPI tiles (current vs prior window).

GET /api/v1/dashboard/most-sold-extended
    Most-sold products with period-over-period trend indicators.

GET /api/v1/dashboard/recent-activity
    Recent activity feed with color-coded types.

GET /api/v1/dashboard/operations-summary
    Stock-moving operation counts for the selected period, grouped by
    movement type (sales, receipts, transfers, adjustments, returns,
    damage). Feeds the Transactions / Returns / Damage KPI tiles.

All endpoints are read-only aggregation.  All quantities are derived from the
existing StockBalance / InventoryTransaction projections; nothing is mutated.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
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

# Stock buckets for status classification
AVAILABLE_BUCKET = "AVAILABLE"


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


# ---------------------------------------------------------------------------
# Phase 4 Analytics Response Schemas
# ---------------------------------------------------------------------------


class StockTrendPoint(BaseModel):
    date: str  # YYYY-MM-DD
    total_stock_units: int


class StockTrendResponse(BaseModel):
    data: list[StockTrendPoint]
    date_range: dict[str, str]  # {start, end}


class CategoryDistributionPoint(BaseModel):
    category: str
    count: int
    percentage: float


class CategoryDistributionResponse(BaseModel):
    data: list[CategoryDistributionPoint]
    total_products: int


class StockStatusCategoryRow(BaseModel):
    category: str
    in_stock: int
    low_stock: int
    out_of_stock: int
    total: int


class StockStatusByCategoryResponse(BaseModel):
    data: list[StockStatusCategoryRow]


class KPIDelta(BaseModel):
    metric: str
    current_value: int | float
    prior_value: int | float
    delta_absolute: int | float
    delta_percentage: float | None
    period_label: str


class KPIDeltasResponse(BaseModel):
    deltas: list[KPIDelta]
    current_period: dict[str, str]
    prior_period: dict[str, str]


class MostSoldExtendedProduct(BaseModel):
    product_id: str
    product_name: str
    sku: str
    category: str
    units_sold: int
    trend_direction: Literal["up", "down", "neutral"]
    trend_percentage: float | None


class MostSoldExtendedResponse(BaseModel):
    data: list[MostSoldExtendedProduct]
    period: dict[str, str]


class RecentActivityItem(BaseModel):
    id: str
    type: Literal[
        "stock_added",
        "stock_sold",
        "transfer_completed",
        "receipt_linked",
        "stock_removed",
        "adjustment",
        "damage",
        "return",
    ]
    product_id: str
    product_name: str
    sku: str
    store_id: str
    store_name: str
    quantity: int
    occurred_at: datetime
    reference_number: str | None = None


class RecentActivityResponse(BaseModel):
    data: list[RecentActivityItem]
    total: int


class MovementTypeSummary(BaseModel):
    movement_type: str
    count: int
    units: int


class OperationsSummaryResponse(BaseModel):
    """Stock-moving operation counts for the selected period (read-only)."""

    total_transactions: int
    total_units_moved: int
    by_type: list[MovementTypeSummary]
    returns_count: int
    returns_units: int
    damage_count: int
    damage_units: int


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


# ---------------------------------------------------------------------------
# Phase 4 Analytics Endpoints
# ---------------------------------------------------------------------------


def _parse_date_range(
    start_date: str | None, end_date: str | None, default_days: int = 7
) -> tuple[date, date]:
    """Parse and validate date range params, defaulting to last N days."""
    today = datetime.now(UTC).date()
    if end_date:
        try:
            end = date.fromisoformat(end_date)
        except ValueError:
            end = today
    else:
        end = today

    if start_date:
        try:
            start = date.fromisoformat(start_date)
        except ValueError:
            start = end - timedelta(days=default_days - 1)
    else:
        start = end - timedelta(days=default_days - 1)

    if start > end:
        logging.getLogger(__name__).warning(
            "Date range inverted: start=%s > end=%s, swapping", start, end
        )
        start, end = end, start

    return start, end


def _prior_period(start: date, end: date) -> tuple[date, date]:
    """Calculate the prior period of equal length."""
    delta = end - start
    prior_end = start - timedelta(days=1)
    prior_start = prior_end - delta
    return prior_start, prior_end


@router.get(
    "/stock-trend",
    response_model=StockTrendResponse,
    summary="Daily total stock units time series",
)
async def stock_trend(
    start_date: str | None = Query(default=None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> StockTrendResponse:
    """
    Return daily total AVAILABLE stock units across all stores for the date range.

    Computed as: starting AVAILABLE total at range start + cumulative net
    InventoryTransaction deltas (AVAILABLE bucket) per day.  This produces a
    correct running total rather than a snapshot of rows updated on that day.
    """
    start, end = _parse_date_range(start_date, end_date, default_days=7)

    # Starting total: current AVAILABLE stock across all stores.
    stock_stmt = select(
        func.coalesce(func.sum(StockBalance.quantity), 0),
    ).where(StockBalance.stock_bucket == AVAILABLE_BUCKET)
    start_total = int((await db.execute(stock_stmt)).scalar_one() or 0)

    # Generate all dates in range (zero-filled).
    date_map: dict[str, int] = {}
    current = start
    while current <= end:
        date_map[current.isoformat()] = 0
        current += timedelta(days=1)

    # Daily net deltas from AVAILABLE-bucket transactions in range.
    delta_stmt = (
        select(
            func.date(InventoryTransaction.occurred_at).label("tx_date"),
            func.sum(InventoryTransaction.quantity_delta).label("net_delta"),
        )
        .where(
            and_(
                InventoryTransaction.stock_bucket == AVAILABLE_BUCKET,
                func.date(InventoryTransaction.occurred_at) >= start,
                func.date(InventoryTransaction.occurred_at) <= end,
            )
        )
        .group_by("tx_date")
    )
    for row in (await db.execute(delta_stmt)).all():
        d = row.tx_date
        if isinstance(d, (datetime, date)):
            d = d.isoformat()
        if d in date_map:
            date_map[d] = int(row.net_delta or 0)

    # Build running total: start_total + cumulative delta per day.
    running = start_total
    cumulative: dict[str, int] = {}
    for d in sorted(date_map.keys()):
        running += date_map[d]
        cumulative[d] = running

    data = [
        StockTrendPoint(date=d, total_stock_units=max(0, cumulative[d]))
        for d in sorted(cumulative.keys())
    ]

    return StockTrendResponse(
        data=data, date_range={"start": start.isoformat(), "end": end.isoformat()}
    )


@router.get(
    "/category-distribution",
    response_model=CategoryDistributionResponse,
    summary="Product count distribution by category",
)
async def category_distribution(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> CategoryDistributionResponse:
    """
    Return product count per category with percentage breakdown.
    Only includes active products.
    """
    stmt = (
        select(Product.category, func.count(Product.id).label("count"))
        .where(
            Product.is_active.is_(True),
            Product.category.is_not(None),
        )
        .group_by(Product.category)
        .order_by(func.count(Product.id).desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    total = sum(r.count for r in rows)
    data = [
        CategoryDistributionPoint(
            category=r.category,
            count=r.count,
            percentage=round(r.count / total * 100, 1) if total else 0.0,
        )
        for r in rows
    ]

    return CategoryDistributionResponse(data=data, total_products=total)


@router.get(
    "/stock-status-by-category",
    response_model=StockStatusByCategoryResponse,
    summary="Per-category stock status: In Stock / Low Stock / Out of Stock",
)
async def stock_status_by_category(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> StockStatusByCategoryResponse:
    """
    Return stacked bar data per category.
    Reuses the same low-stock threshold logic as the Low-Stock Alerts tile.
    """
    # Get all active products with their category, threshold, and total available quantity
    stmt = (
        select(
            Product.id,
            Product.category,
            Product.low_stock_threshold,
            func.coalesce(func.sum(StockBalance.quantity), 0).label("total_qty"),
        )
        .outerjoin(
            StockBalance,
            and_(
                StockBalance.product_id == Product.id,
                StockBalance.stock_bucket == AVAILABLE_BUCKET,
            ),
        )
        .where(
            Product.is_active.is_(True),
        )
        .group_by(Product.id, Product.category, Product.low_stock_threshold)
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Aggregate by category
    cat_map: dict[str, dict[str, int]] = {}
    for r in rows:
        cat = r.category or "Uncategorised"
        qty = int(r.total_qty) if r.total_qty is not None else 0
        threshold = r.low_stock_threshold

        if cat not in cat_map:
            cat_map[cat] = {"in_stock": 0, "low_stock": 0, "out_of_stock": 0}

        if qty == 0:
            cat_map[cat]["out_of_stock"] += 1
        elif threshold is not None and qty < threshold:
            cat_map[cat]["low_stock"] += 1
        else:
            cat_map[cat]["in_stock"] += 1

    data = [
        StockStatusCategoryRow(
            category=cat,
            in_stock=v["in_stock"],
            low_stock=v["low_stock"],
            out_of_stock=v["out_of_stock"],
            total=v["in_stock"] + v["low_stock"] + v["out_of_stock"],
        )
        for cat, v in sorted(
            cat_map.items(),
            key=lambda x: x[1]["in_stock"] + x[1]["low_stock"] + x[1]["out_of_stock"],
            reverse=True,
        )
    ]

    return StockStatusByCategoryResponse(data=data)


@router.get(
    "/kpi-deltas",
    response_model=KPIDeltasResponse,
    summary="Period-over-period deltas for KPI tiles",
)
async def kpi_deltas(
    start_date: str | None = Query(default=None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> KPIDeltasResponse:
    """
    Compute current vs prior period deltas for key metrics.
    Defaults to last 7 days vs the 7 days before that.
    """
    start, end = _parse_date_range(start_date, end_date, default_days=7)
    prior_start, prior_end = _prior_period(start, end)

    # Helper to compute metric for a given period
    async def _compute_metrics(period_start: date, period_end: date) -> dict[str, int | float]:
        # Total products (catalogue-wide, not period-dependent)
        total_products = int((await db.execute(select(func.count(Product.id)))).scalar_one() or 0)

        # Total stock units (current snapshot, not period-dependent)
        stock_stmt = select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
            StockBalance.stock_bucket == AVAILABLE_BUCKET
        )
        total_stock_units = int((await db.execute(stock_stmt)).scalar_one() or 0)

        # Most-sold units in period
        sale_stmt = select(
            func.coalesce(func.sum(func.abs(InventoryTransaction.quantity_delta)), 0)
        ).where(
            and_(
                InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                func.date(InventoryTransaction.occurred_at) >= period_start,
                func.date(InventoryTransaction.occurred_at) <= period_end,
            )
        )
        most_sold_units = int((await db.execute(sale_stmt)).scalar_one() or 0)

        # Receipt-linked sales in period
        receipt_stmt = select(
            func.count(func.distinct(InventoryTransaction.reference_number)).label("receipts"),
            func.coalesce(func.sum(func.abs(InventoryTransaction.quantity_delta)), 0).label(
                "items"
            ),
        ).where(
            and_(
                InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                InventoryTransaction.reference_number.is_not(None),
                InventoryTransaction.reference_number != "",
                func.date(InventoryTransaction.occurred_at) >= period_start,
                func.date(InventoryTransaction.occurred_at) <= period_end,
            )
        )
        receipt_row = (await db.execute(receipt_stmt)).one()
        receipt_count = int(receipt_row.receipts or 0)
        receipt_items = int(receipt_row.items or 0)

        # Cross-store products in period (products that moved in multiple stores)
        cross_stmt = (
            select(func.count(func.distinct(InventoryTransaction.product_id)))
            .where(
                and_(
                    InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                    func.date(InventoryTransaction.occurred_at) >= period_start,
                    func.date(InventoryTransaction.occurred_at) <= period_end,
                )
            )
            .group_by(InventoryTransaction.product_id)
            .having(func.count(func.distinct(InventoryTransaction.store_id)) > 1)
        )
        cross_count = len((await db.execute(cross_stmt)).all())

        return {
            "total_products": total_products,
            "total_stock_units": total_stock_units,
            "most_sold_units": most_sold_units,
            "receipt_count": receipt_count,
            "receipt_items": receipt_items,
            "cross_store_products": cross_count,
        }

    current = await _compute_metrics(start, end)
    prior = await _compute_metrics(prior_start, prior_end)

    deltas: list[KPIDelta] = []
    metric_configs = [
        ("Total Products", "total_products", "products", False),
        ("Total Stock Units", "total_stock_units", "units", False),
        ("Units Sold", "most_sold_units", "units", True),
        ("Receipts", "receipt_count", "receipts", True),
        ("Items Sold (Receipts)", "receipt_items", "items", True),
        ("Cross-Store Products", "cross_store_products", "products", True),
    ]

    for label, key, unit, is_rate in metric_configs:
        curr_val = current[key]
        prior_val = prior[key]
        delta_abs = curr_val - prior_val
        delta_pct = round((delta_abs / prior_val * 100), 1) if prior_val != 0 else None

        if is_rate and prior_val != 0:
            period_label = f"{delta_pct:+.1f}% vs prior period"
        else:
            period_label = f"{delta_abs:+d} {unit} vs prior period"

        deltas.append(
            KPIDelta(
                metric=label,
                current_value=curr_val,
                prior_value=prior_val,
                delta_absolute=delta_abs,
                delta_percentage=delta_pct,
                period_label=period_label,
            )
        )

    return KPIDeltasResponse(
        deltas=deltas,
        current_period={"start": start.isoformat(), "end": end.isoformat()},
        prior_period={"start": prior_start.isoformat(), "end": prior_end.isoformat()},
    )


@router.get(
    "/most-sold-extended",
    response_model=MostSoldExtendedResponse,
    summary="Most-sold products with period-over-period trends",
)
async def most_sold_extended(
    start_date: str | None = Query(default=None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="End date YYYY-MM-DD"),
    limit: int = Query(default=10, ge=1, le=50, description="Number of products to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> MostSoldExtendedResponse:
    """
    Return top products by units sold in the current period with trend vs prior period.
    """
    start, end = _parse_date_range(start_date, end_date, default_days=7)
    prior_start, prior_end = _prior_period(start, end)

    # Current period sales
    curr_stmt = (
        select(
            InventoryTransaction.product_id,
            func.sum(func.abs(InventoryTransaction.quantity_delta)).label("units_sold"),
        )
        .where(
            and_(
                InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                func.date(InventoryTransaction.occurred_at) >= start,
                func.date(InventoryTransaction.occurred_at) <= end,
            )
        )
        .group_by(InventoryTransaction.product_id)
        .order_by(func.sum(func.abs(InventoryTransaction.quantity_delta)).desc())
        .limit(limit)
    )
    curr_rows = (await db.execute(curr_stmt)).all()
    curr_product_ids = [r.product_id for r in curr_rows]
    curr_map = {r.product_id: int(r.units_sold or 0) for r in curr_rows}

    # Prior period sales for the same products
    prior_map: dict[str, int] = {}
    if curr_product_ids:
        prior_stmt = (
            select(
                InventoryTransaction.product_id,
                func.sum(func.abs(InventoryTransaction.quantity_delta)).label("units_sold"),
            )
            .where(
                and_(
                    InventoryTransaction.movement_type == SALE_MOVEMENT_TYPE,
                    InventoryTransaction.product_id.in_(curr_product_ids),
                    func.date(InventoryTransaction.occurred_at) >= prior_start,
                    func.date(InventoryTransaction.occurred_at) <= prior_end,
                )
            )
            .group_by(InventoryTransaction.product_id)
        )
        for row in (await db.execute(prior_stmt)).all():
            prior_map[row.product_id] = int(row.units_sold or 0)

    # Fetch product details
    product_map: dict[str, tuple[str, str, str]] = {}
    if curr_product_ids:
        p_rows = (
            await db.execute(
                select(Product.id, Product.name, Product.sku, Product.category).where(
                    Product.id.in_(curr_product_ids)
                )
            )
        ).all()
        product_map = {p.id: (p.name, p.sku, p.category) for p in p_rows}

    data: list[MostSoldExtendedProduct] = []
    for row in curr_rows:
        pid = row.product_id
        curr_sold = curr_map.get(pid, 0)
        prior_sold = prior_map.get(pid, 0)

        if prior_sold > 0:
            pct_change = round((curr_sold - prior_sold) / prior_sold * 100, 1)
            trend_dir: Literal["up", "down", "neutral"] = "up" if pct_change > 0 else "down"
        elif curr_sold > 0:
            pct_change = None
            trend_dir = "up"
        else:
            pct_change = None
            trend_dir = "neutral"

        name, sku, category = product_map.get(pid, ("Unknown", "N/A", "Uncategorized"))

        data.append(
            MostSoldExtendedProduct(
                product_id=pid,
                product_name=name,
                sku=sku,
                category=category,
                units_sold=curr_sold,
                trend_direction=trend_dir,
                trend_percentage=pct_change,
            )
        )

    return MostSoldExtendedResponse(
        data=data, period={"start": start.isoformat(), "end": end.isoformat()}
    )


@router.get(
    "/recent-activity",
    response_model=RecentActivityResponse,
    summary="Recent activity feed with color-coded types",
)
async def recent_activity(
    limit: int = Query(default=20, ge=1, le=100, description="Number of items to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> RecentActivityResponse:
    """
    Return recent inventory activity with type classification for color coding.
    Types: stock_added, stock_sold, transfer_completed, receipt_linked, stock_removed, adjustment, damage, return
    """
    stmt = (
        select(InventoryTransaction, Product, Store)
        .outerjoin(Product, InventoryTransaction.product_id == Product.id)
        .outerjoin(Store, InventoryTransaction.store_id == Store.id)
        .order_by(InventoryTransaction.occurred_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()

    def _classify_activity(tx: InventoryTransaction) -> str:
        mt = tx.movement_type.upper()
        if mt == "SALE":
            return "stock_sold" if tx.reference_number else "stock_removed"
        elif mt == "RECEIPT":
            return "stock_added"
        elif mt == "TRANSFER":
            return "transfer_completed"
        elif mt == "RETURN":
            return "return"
        elif mt == "DAMAGE":
            return "damage"
        elif mt == "ADJUSTMENT":
            return "adjustment"
        else:
            return "stock_added" if tx.quantity_delta > 0 else "stock_removed"

    data: list[RecentActivityItem] = []
    for tx, product, store in rows:
        # Skip rows where the join produced no product or store (orphaned tx)
        if product is None or store is None:
            continue
        data.append(
            RecentActivityItem(
                id=tx.transaction_id,
                type=_classify_activity(tx),
                product_id=product.id,
                product_name=product.name,
                sku=product.sku,
                store_id=store.id,
                store_name=store.name,
                quantity=abs(tx.quantity_delta),
                occurred_at=tx.occurred_at,
                reference_number=tx.reference_number,
            )
        )

    return RecentActivityResponse(data=data, total=len(data))


@router.get(
    "/operations-summary",
    response_model=OperationsSummaryResponse,
    summary="Stock-moving operation counts by movement type for a period",
)
async def operations_summary(
    start_date: str | None = Query(default=None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> OperationsSummaryResponse:
    """
    Count every stock-moving operation (sales, receipts, transfers,
    adjustments, returns, damage) in the selected date range, grouped by
    movement type.  Read-only aggregation over InventoryTransaction; units
    are the absolute quantity deltas so inflows and outflows both count.
    """
    start, end = _parse_date_range(start_date, end_date, default_days=7)

    stmt = (
        select(
            InventoryTransaction.movement_type,
            func.count(InventoryTransaction.transaction_id).label("count"),
            func.coalesce(func.sum(func.abs(InventoryTransaction.quantity_delta)), 0).label(
                "units"
            ),
        )
        .where(
            and_(
                func.date(InventoryTransaction.occurred_at) >= start,
                func.date(InventoryTransaction.occurred_at) <= end,
            )
        )
        .group_by(InventoryTransaction.movement_type)
        .order_by(func.count(InventoryTransaction.transaction_id).desc())
    )
    rows = (await db.execute(stmt)).all()

    by_type: list[MovementTypeSummary] = []
    returns_count = returns_units = damage_count = damage_units = 0
    total_transactions = 0
    total_units_moved = 0

    for row in rows:
        mt = (row.movement_type or "UNKNOWN").upper()
        count = int(row.count or 0)
        units = int(row.units or 0)
        by_type.append(MovementTypeSummary(movement_type=mt, count=count, units=units))
        total_transactions += count
        total_units_moved += units
        if mt == "RETURN":
            returns_count += count
            returns_units += units
        elif mt == "DAMAGE":
            damage_count += count
            damage_units += units

    return OperationsSummaryResponse(
        total_transactions=total_transactions,
        total_units_moved=total_units_moved,
        by_type=by_type,
        returns_count=returns_count,
        returns_units=returns_units,
        damage_count=damage_count,
        damage_units=damage_units,
    )
