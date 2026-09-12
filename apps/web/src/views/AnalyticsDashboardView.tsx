/**
 * Analytics Dashboard — Phase 4 redesign + v1.1 polish pass.
 *
 * Layout:
 *   - Header with title, subtitle, date-range filter, and store-scope hint
 *   - 2 full rows of 5 KPI tiles (pure single-number KPIs only — list-style
 *     content lives in the detailed cards further down, Task C)
 *   - Stock Trend line chart + Category Distribution donut (side by side on desktop)
 *   - Stock Status stacked bar chart
 *   - Most-Sold Products table + Low-Stock Alerts table (side by side on desktop)
 *   - Recent Activity condensed preview panel
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  Boxes,
  Clock,
  Layers,
  Package,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react';
import { EmptyState, Spinner } from '@invenTory/ui';
import {
  getCategoryDistribution,
  getDashboardMetrics,
  getKPIDeltas,
  getRecentActivity,
  getStockStatusByCategory,
  getStockTrend,
  getMostSoldExtended,
  getOperationsSummary,
  listStores,
} from '../services/dashboardService';
import { useResistantQuery } from '../hooks/useResistantQuery';
import type {
  DashboardMetrics,
  KPIDelta,
  KPIDeltasResponse,
  MostSoldExtendedResponse,
  OperationsSummaryResponse,
  RecentActivityResponse,
  ReceiptSalesDayMetric,
  StockStatusByCategoryResponse,
  StockTrendResponse,
  CategoryDistributionResponse,
} from '../types/dashboard';
import { DashboardTile } from '../components/DashboardTile';
import { RecentActivityList } from '../components/RecentActivityList';
import { Sparkline } from '../components/Sparkline';
import { StockTrendChart } from '../components/StockTrendChart';
import { CategoryDonutChart } from '../components/CategoryDonutChart';
import { StockStatusStackedBarChart } from '../components/StockStatusStackedBarChart';

type StoreListEntry = Awaited<ReturnType<typeof listStores>>[number];

const DATE_RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
];

const MOST_SOLD_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 5;
const LOW_STOCK_LIMIT = 5;

function _formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function _receiptSummary(days: ReceiptSalesDayMetric[]): {
  totalReceipts: number;
  totalItems: number;
  avgPerReceipt: number;
} {
  const totalReceipts = days.reduce((sum, d) => sum + d.receipt_count, 0);
  const totalItems = days.reduce((sum, d) => sum + d.items_sold, 0);
  const avgPerReceipt = totalReceipts > 0 ? totalItems / totalReceipts : 0;
  return { totalReceipts, totalItems, avgPerReceipt };
}

interface DateRangeState {
  days: number;
  label: string;
}

function dateRangeLabel(days: number): string {
  return DATE_RANGE_OPTIONS.find((o) => o.value === days)?.label ?? `Last ${days} days`;
}

function computeDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function AnalyticsDashboardView(): React.ReactElement {
  const [dateRange, setDateRange] = useState<DateRangeState>({ days: 7, label: 'Last 7 days' });

  const dateRangeParams = useMemo(() => computeDateRange(dateRange.days), [dateRange.days]);

  const metricsQuery = useResistantQuery<DashboardMetrics>(getDashboardMetrics, []);
  const stockTrendQuery = useResistantQuery<StockTrendResponse>(
    () => getStockTrend(dateRangeParams.start, dateRangeParams.end),
    [dateRangeParams],
  );
  const categoryDistQuery = useResistantQuery<CategoryDistributionResponse>(
    getCategoryDistribution,
    [],
  );
  const stockStatusQuery = useResistantQuery<StockStatusByCategoryResponse>(
    getStockStatusByCategory,
    [],
  );
  const mostSoldQuery = useResistantQuery<MostSoldExtendedResponse>(
    () => getMostSoldExtended(dateRangeParams.start, dateRangeParams.end, MOST_SOLD_LIMIT),
    [dateRangeParams],
  );
  const recentActivityQuery = useResistantQuery<RecentActivityResponse>(
    () => getRecentActivity(RECENT_ACTIVITY_LIMIT),
    [],
  );
  const kpiDeltasQuery = useResistantQuery<KPIDeltasResponse>(
    () => getKPIDeltas(dateRangeParams.start, dateRangeParams.end),
    [dateRangeParams],
  );
  const storesQuery = useResistantQuery<StoreListEntry[]>(listStores, []);
  const opsSummaryQuery = useResistantQuery<OperationsSummaryResponse>(
    () => getOperationsSummary(dateRangeParams.start, dateRangeParams.end),
    [dateRangeParams],
  );

  const metrics = metricsQuery.data;
  const stockTrend = stockTrendQuery.data?.data ?? [];
  const categoryDist = categoryDistQuery.data?.data ?? [];
  const categoryTotalProducts = categoryDistQuery.data?.total_products;
  const stockStatus = stockStatusQuery.data?.data ?? [];
  const mostSoldExtended = mostSoldQuery.data?.data ?? [];
  const recentActivity = recentActivityQuery.data?.data ?? [];

  const m: DashboardMetrics = metrics ?? {
    total_products: 0,
    total_stock_units: 0,
    last_sync_at: null,
    most_sold: [],
    low_stock: [],
    cross_store: { products_in_multiple_stores: 0, stores_with_stock: 0, combined_quantity: 0 },
    receipt_linked_sales: [],
  };

  const receipt = _receiptSummary(m.receipt_linked_sales);
  const last7Days = m.receipt_linked_sales.slice(-7);

  const deltasMap = useMemo(() => {
    const map: Record<string, KPIDelta | undefined> = {};
    for (const d of kpiDeltasQuery.data?.deltas ?? []) map[d.metric] = d;
    return map;
  }, [kpiDeltasQuery.data]);

  const getDelta = (metric: string): KPIDelta | undefined => deltasMap[metric];

  // ── New-tile derived data (Task C) ──────────────────────────────────────
  const stores = storesQuery.data ?? [];
  const activeStoreCount = stores.filter((s) => s.is_active).length;
  const inactiveStoreCount = stores.length - activeStoreCount;
  const ops = opsSummaryQuery.data;
  const unitsSoldDelta = getDelta('Units Sold');
  const unitsSoldValue = unitsSoldDelta ? unitsSoldDelta.current_value : null;
  const topSeller = mostSoldExtended[0]?.product_name ?? null;
  const opsFooter = ops?.by_type.length
    ? ops.by_type
        .slice(0, 3)
        .map((t) => `${t.count} ${t.movement_type.toLowerCase()}`)
        .join(' · ')
    : 'No movements in range';

  /** Entrance-animation stagger helper (Task E). */
  const stagger = (ms: number): React.CSSProperties => ({ animationDelay: `${ms}ms` });

  const loading = metricsQuery.loading;
  const pageError =
    [
      metricsQuery.error,
      stockTrendQuery.error,
      categoryDistQuery.error,
      stockStatusQuery.error,
      mostSoldQuery.error,
      recentActivityQuery.error,
      kpiDeltasQuery.error,
    ].filter(Boolean)[0] ?? null;

  if (loading && !metrics) {
    return (
      <div className="web-analytics-view" data-testid="analytics-dashboard">
        <div className="web-center-spinner" data-testid="analytics-loading">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="web-analytics-view" data-testid="analytics-dashboard">
        <EmptyState
          variant="error"
          heading="Failed to load analytics"
          body={pageError}
          data-testid="analytics-error"
        />
      </div>
    );
  }

  return (
    <div className="web-analytics-view" data-testid="analytics-dashboard">
      <div className="web-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart3 size={22} color="var(--it-green)" aria-hidden="true" />
          <div>
            <h2 className="web-view-title">Dashboard</h2>
            <p className="web-view-subtitle">Catalogue analytics across all stores</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={14} color="var(--it-text-secondary)" aria-hidden="true" />
          <select
            className="web-daterange-select"
            data-testid="dashboard-date-range"
            value={dateRange.days}
            onChange={(e): void => {
              const days = Number(e.target.value);
              setDateRange({ days, label: dateRangeLabel(days) });
            }}
            aria-label="Date range"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Tiles with deltas — 2 full rows of 5 at desktop width (Task C) */}
      <div className="web-dashboard-tiles" data-testid="analytics-tiles">
        <DashboardTile
          title="Total Products"
          numericValue={m.total_products}
          icon={Package}
          animDelay={0}
          loading={loading}
          delta={
            getDelta('Total Products')
              ? {
                  label: getDelta('Total Products')!.period_label,
                  positive: (getDelta('Total Products')!.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={
            <span>
              {categoryDist.length > 0
                ? `Across ${categoryDist.length} categories`
                : 'Catalogue is empty'}
            </span>
          }
          testId="tile-total-products"
        />

        <DashboardTile
          title="Total Stock Units"
          numericValue={m.total_stock_units}
          icon={Boxes}
          accent="var(--it-blue, #3b82f6)"
          animDelay={40}
          loading={loading}
          delta={
            getDelta('Total Stock Units')
              ? {
                  label: getDelta('Total Stock Units')!.period_label,
                  positive: (getDelta('Total Stock Units')!.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={
            stockTrend.length >= 2 ? (
              <Sparkline
                data={stockTrend.map((p) => p.total_stock_units)}
                stroke="var(--it-blue, #3b82f6)"
                height={34}
                testId="stock-units-sparkline"
              />
            ) : (
              <span>Trend appears as data accumulates</span>
            )
          }
          testId="tile-total-stock-units"
        />

        <DashboardTile
          title="Last Sync"
          value={_formatLastSync(m.last_sync_at)}
          icon={Clock}
          accent="var(--it-amber, #f59e0b)"
          animDelay={80}
          loading={loading}
          footer={
            <span>
              {m.last_sync_at ? new Date(m.last_sync_at).toLocaleString() : 'No sync recorded yet'}
            </span>
          }
          testId="tile-last-sync"
        />

        <DashboardTile
          title="Cross-Store Products"
          numericValue={m.cross_store.products_in_multiple_stores}
          icon={Layers}
          accent="var(--it-purple, #8b5cf6)"
          animDelay={120}
          loading={loading}
          delta={
            getDelta('Cross-Store Products')
              ? {
                  label: getDelta('Cross-Store Products')!.period_label,
                  positive: (getDelta('Cross-Store Products')!.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={
            <span>
              {m.cross_store.stores_with_stock} store
              {m.cross_store.stores_with_stock === 1 ? '' : 's'} with stock ·{' '}
              {m.cross_store.combined_quantity.toLocaleString()} combined units
            </span>
          }
          testId="tile-cross-store"
        />

        <DashboardTile
          title="Receipt-Linked Sales"
          numericValue={receipt.totalReceipts}
          icon={ReceiptText}
          accent="var(--it-teal, #14b8a6)"
          animDelay={160}
          loading={loading}
          delta={
            getDelta('Receipts')
              ? {
                  label: getDelta('Receipts')!.period_label,
                  positive: (getDelta('Receipts')!.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={
            <>
              {last7Days.length > 0 ? (
                <span className="web-mini-bars" data-testid="receipt-bars">
                  {last7Days.map((d) => (
                    <span
                      key={d.date}
                      className="web-mini-bar"
                      title={`${d.date}: ${d.receipt_count} receipts, ${d.items_sold} items`}
                      style={{ height: `${Math.max(4, Math.min(28, d.receipt_count * 4))}px` }}
                    />
                  ))}
                </span>
              ) : (
                <span>No receipt-linked sales in the last 7 days</span>
              )}
              <span>
                {receipt.totalItems.toLocaleString()} items sold · avg{' '}
                {receipt.avgPerReceipt.toFixed(1)} items/receipt
              </span>
            </>
          }
          testId="tile-receipt-sales"
        />

        <DashboardTile
          title="Total Stores"
          value={storesQuery.error ? '—' : undefined}
          numericValue={storesQuery.error ? undefined : activeStoreCount}
          icon={Store}
          animDelay={200}
          loading={loading || storesQuery.loading}
          footer={
            <span>
              {storesQuery.error
                ? 'Store list unavailable'
                : inactiveStoreCount > 0
                  ? `${inactiveStoreCount} inactive`
                  : 'All stores active'}
            </span>
          }
          testId="tile-total-stores"
        />

        <DashboardTile
          title="Units Sold"
          value={unitsSoldValue === null ? '—' : undefined}
          numericValue={unitsSoldValue ?? undefined}
          icon={ShoppingCart}
          accent="var(--it-blue, #3b82f6)"
          animDelay={240}
          loading={loading}
          delta={
            unitsSoldDelta
              ? {
                  label: unitsSoldDelta.period_label,
                  positive: (unitsSoldDelta.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={<span>{topSeller ? `Top: ${topSeller}` : 'No sales in this period'}</span>}
          testId="tile-units-sold"
        />

        <DashboardTile
          title="Transactions"
          value={opsSummaryQuery.error ? '—' : undefined}
          numericValue={opsSummaryQuery.error ? undefined : (ops?.total_transactions ?? 0)}
          icon={ArrowLeftRight}
          accent="var(--it-purple, #8b5cf6)"
          animDelay={280}
          loading={loading || opsSummaryQuery.loading}
          footer={<span>{opsSummaryQuery.error ? 'Operations unavailable' : opsFooter}</span>}
          testId="tile-transactions"
        />

        <DashboardTile
          title="Returns"
          value={opsSummaryQuery.error ? '—' : undefined}
          numericValue={opsSummaryQuery.error ? undefined : (ops?.returns_count ?? 0)}
          icon={RotateCcw}
          accent="var(--it-teal, #14b8a6)"
          animDelay={320}
          loading={loading || opsSummaryQuery.loading}
          footer={
            <span>
              {opsSummaryQuery.error
                ? 'Operations unavailable'
                : ops && ops.returns_count > 0
                  ? `${ops.returns_units.toLocaleString()} units returned`
                  : 'No returns in range'}
            </span>
          }
          testId="tile-returns"
        />

        <DashboardTile
          title="Damage & Quarantine"
          value={opsSummaryQuery.error ? '—' : undefined}
          numericValue={opsSummaryQuery.error ? undefined : (ops?.damage_units ?? 0)}
          icon={ShieldAlert}
          accent="var(--it-red, #ef4444)"
          animDelay={360}
          loading={loading || opsSummaryQuery.loading}
          footer={
            <span>
              {opsSummaryQuery.error
                ? 'Operations unavailable'
                : ops && ops.damage_count > 0
                  ? `${ops.damage_count} damage operation${ops.damage_count === 1 ? '' : 's'}`
                  : 'No damage in range'}
            </span>
          }
          testId="tile-damage"
        />
      </div>

      {/* Charts row: Stock Trend + Category Distribution */}
      <div className="web-dashboard-charts-row" data-testid="dashboard-charts">
        <div
          className="web-dashboard-chart-panel web-anim-card"
          data-testid="stock-trend-chart"
          style={stagger(400)}
        >
          <h3 className="web-dashboard-chart-title">
            <TrendingUp size={16} aria-hidden="true" />
            Stock Trend
          </h3>
          {stockTrendQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load stock trend"
              body={stockTrendQuery.error}
            />
          ) : stockTrendQuery.loading ? (
            <Spinner size="sm" />
          ) : (
            <StockTrendChart data={stockTrend} testId="stock-trend-chart-canvas" />
          )}
        </div>
        <div
          className="web-dashboard-chart-panel web-anim-card"
          data-testid="category-distribution-chart"
          style={stagger(460)}
        >
          <h3 className="web-dashboard-chart-title">
            <Layers size={16} aria-hidden="true" />
            Product Categories
          </h3>
          {categoryDistQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load categories"
              body={categoryDistQuery.error}
            />
          ) : categoryDistQuery.loading ? (
            <Spinner size="sm" />
          ) : (
            <CategoryDonutChart
              data={categoryDist}
              totalProducts={categoryTotalProducts}
              testId="category-donut-chart-canvas"
            />
          )}
        </div>
      </div>

      {/* Stock Status chart */}
      <div
        className="web-dashboard-chart-panel web-anim-card"
        data-testid="stock-status-chart"
        style={stagger(520)}
      >
        <h3 className="web-dashboard-chart-title">
          <Boxes size={16} aria-hidden="true" />
          Stock Status by Category
        </h3>
        {stockStatusQuery.error ? (
          <EmptyState
            variant="error"
            heading="Failed to load stock status"
            body={stockStatusQuery.error}
          />
        ) : stockStatusQuery.loading ? (
          <Spinner size="sm" />
        ) : (
          <StockStatusStackedBarChart data={stockStatus} testId="stock-status-chart-canvas" />
        )}
      </div>

      {/* Tables row: Most-Sold + Low-Stock */}
      <div className="web-dashboard-tables-row" data-testid="dashboard-tables">
        <div
          className="web-dashboard-table-panel web-anim-card"
          data-testid="most-sold-table"
          style={stagger(580)}
        >
          <div className="web-dashboard-table-header">
            <h3 className="web-dashboard-table-title">Most-Sold Products</h3>
            <a href="/products" className="web-dashboard-table-link">
              View all products
            </a>
          </div>
          {mostSoldQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load most-sold"
              body={mostSoldQuery.error}
            />
          ) : mostSoldExtended.length > 0 ? (
            <table className="web-dashboard-table" data-testid="most-sold-table-content">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Units Sold</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {mostSoldExtended.map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.product_name}</td>
                    <td>{p.category}</td>
                    <td className="web-cell-mono">{p.units_sold.toLocaleString()}</td>
                    <td>
                      {p.trend_direction === 'up' ? (
                        <span className="web-cell-delta web-cell-delta--pos">
                          <ArrowUp size={12} aria-hidden="true" />
                          {p.trend_percentage !== null ? `+${p.trend_percentage}%` : 'New'}
                        </span>
                      ) : p.trend_direction === 'down' ? (
                        <span className="web-cell-delta web-cell-delta--neg">
                          <ArrowDown size={12} aria-hidden="true" />
                          {p.trend_percentage !== null ? `${p.trend_percentage}%` : '—'}
                        </span>
                      ) : (
                        <span className="web-cell-delta web-cell-delta--neutral">
                          <Activity size={12} aria-hidden="true" />—
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              variant="default"
              heading="No sales data"
              body="Sales activity will appear here."
            />
          )}
        </div>

        <div
          className="web-dashboard-table-panel web-anim-card"
          data-testid="low-stock-table"
          style={stagger(640)}
        >
          <div className="web-dashboard-table-header">
            <h3 className="web-dashboard-table-title">Low-Stock Alerts</h3>
            <a href="/products" className="web-dashboard-table-link">
              View all low stock items
            </a>
          </div>
          {m.low_stock.length > 0 ? (
            <table className="web-dashboard-table" data-testid="low-stock-table-content">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {m.low_stock.slice(0, LOW_STOCK_LIMIT).map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.product_name}</td>
                    <td className="web-cell-mono">{p.quantity}</td>
                    <td className="web-cell-mono">{p.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              variant="default"
              heading="No low stock"
              body="All products are above their thresholds."
            />
          )}
        </div>
      </div>

      {/* Recent Activity preview */}
      <div
        className="web-dashboard-preview web-anim-card"
        data-testid="recent-activity-preview"
        style={stagger(700)}
      >
        <div className="web-dashboard-preview-header">
          <h3 className="web-dashboard-preview-title">
            <Activity size={16} aria-hidden="true" />
            Recent Activity
          </h3>
          <a href="/recent-activity" className="web-dashboard-table-link">
            View all activities
          </a>
        </div>
        {recentActivityQuery.error ? (
          <EmptyState
            variant="error"
            heading="Failed to load activity"
            body={recentActivityQuery.error}
          />
        ) : recentActivity.length > 0 ? (
          <RecentActivityList items={recentActivity} />
        ) : (
          <EmptyState
            variant="default"
            heading="No recent activity"
            body="Stock movements will appear here."
          />
        )}
      </div>
    </div>
  );
}
