/**
 * Analytics Dashboard — mockup-accurate redesign (Images 1 & 2).
 *
 * One dynamic view that covers both base and per-store states:
 *  - store tabs appear when >1 store, scrolling pill design
 *  - greeting subtitle switches: "with your inventory today." vs "across your stores."
 *  - tile row is exactly 5 KPIs (Total Products, Stock Units, Active Stores/ Low Stock, Units Sold, Last Sync)
 *  - charts: Stock Trend (left, wider) + Categories donut + Quick Actions (right)
 *  - panels: Most Sold + Low Stock side by side; Recent Activity full width
 *  - Recent Activity uses rich circular badges per spec Image 2 standard
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Boxes,
  Clock,
  Layers,
  Package,
  Store,
  ShoppingCart,
  TrendingUp,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { EmptyState, Skeleton, SkeletonCard } from '@invenTory/ui';
import {
  getCategoryDistribution,
  getDashboardMetrics,
  getKPIDeltas,
  getRecentActivity,
  getStockTrend,
  getMostSoldExtended,
  getOperationsSummary,
  listStores,
} from '../services/dashboardService';
import { useQuery, useQueries } from '@tanstack/react-query';
import type {
  DashboardMetrics,
  KPIDelta,
  KPIDeltasResponse,
  MostSoldExtendedResponse,
  OperationsSummaryResponse,
  RecentActivityResponse,
  StockTrendResponse,
  CategoryDistributionResponse,
} from '../types/dashboard';
import { DashboardTile } from '../components/DashboardTile';
import { RecentActivityList } from '../components/RecentActivityList';
import { StockTrendChart } from '../components/StockTrendChart';
import { CategoryDonutChart } from '../components/CategoryDonutChart';

type StoreListEntry = Awaited<ReturnType<typeof listStores>>[number];

const DATE_RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

const MOST_SOLD_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;

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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

interface Props {
  me?: { full_name: string | null; username: string } | null;
  storeMeta?: Array<{ id: string; code: string; name: string }>;
  topSearch?: string;
}

export function AnalyticsDashboardView({
  me,
  storeMeta: propStores,
  topSearch: _topSearch,
}: Props): React.ReactElement {
  const [dateRange, setDateRange] = useState<{ days: number; label: string }>({
    days: 7,
    label: 'Last 7 days',
  });
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);

  const dateRangeParams = useMemo(() => computeDateRange(dateRange.days), [dateRange.days]);

  // Coordinate all dashboard queries using useQueries for batched fetching (P2)
  // This ensures all queries are dispatched together and we can track combined loading state
  const queries = useQueries({
    queries: [
      {
        queryKey: ['dashboardMetrics', activeStoreId],
        queryFn: () => getDashboardMetrics(activeStoreId),
      },
      {
        queryKey: ['stockTrend', dateRangeParams.start, dateRangeParams.end, activeStoreId],
        queryFn: () => getStockTrend(dateRangeParams.start, dateRangeParams.end, activeStoreId),
      },
      {
        queryKey: ['categoryDistribution', activeStoreId],
        queryFn: () => getCategoryDistribution(activeStoreId),
      },
      {
        queryKey: [
          'mostSoldExtended',
          dateRangeParams.start,
          dateRangeParams.end,
          MOST_SOLD_LIMIT,
          activeStoreId,
        ],
        queryFn: () =>
          getMostSoldExtended(
            dateRangeParams.start,
            dateRangeParams.end,
            MOST_SOLD_LIMIT,
            activeStoreId,
          ),
      },
      {
        queryKey: ['recentActivity', RECENT_ACTIVITY_LIMIT, activeStoreId],
        queryFn: () => getRecentActivity(RECENT_ACTIVITY_LIMIT, activeStoreId),
      },
      {
        queryKey: ['kpiDeltas', dateRangeParams.start, dateRangeParams.end, activeStoreId],
        queryFn: () => getKPIDeltas(dateRangeParams.start, dateRangeParams.end, activeStoreId),
      },
      {
        queryKey: ['listStores'],
        queryFn: () => listStores(),
      },
      {
        queryKey: ['operationsSummary', dateRangeParams.start, dateRangeParams.end, activeStoreId],
        queryFn: () =>
          getOperationsSummary(dateRangeParams.start, dateRangeParams.end, activeStoreId),
      },
    ],
  });

  const [
    metricsQuery,
    stockTrendQuery,
    categoryDistQuery,
    mostSoldQuery,
    recentActivityQuery,
    kpiDeltasQuery,
    storesQuery,
    opsSummaryQuery,
  ] = queries;

  // Combined loading state — true if ANY critical query is pending
  const isAnyPending = queries.some((q) => q.isPending);
  const isInitialLoad = isAnyPending && !metricsQuery.data;

  const metrics = metricsQuery.data;
  const stockTrend = stockTrendQuery.data?.data ?? [];
  const categoryDist = categoryDistQuery.data?.data ?? [];
  const categoryTotalProducts = categoryDistQuery.data?.total_products;
  const mostSoldExtended = mostSoldQuery.data?.data ?? [];
  const recentActivityRaw = useMemo(
    () => recentActivityQuery.data?.data ?? [],
    [recentActivityQuery.data],
  );

  const m: DashboardMetrics = metrics ?? {
    total_products: 0,
    total_stock_units: 0,
    last_sync_at: null,
    most_sold: [],
    low_stock: [],
    cross_store: { products_in_multiple_stores: 0, stores_with_stock: 0, combined_quantity: 0 },
    receipt_linked_sales: [],
  };

  const deltasMap = useMemo(() => {
    const map: Record<string, KPIDelta | undefined> = {};
    for (const d of kpiDeltasQuery.data?.deltas ?? []) map[d.metric] = d;
    return map;
  }, [kpiDeltasQuery.data]);

  const getDelta = (metric: string): KPIDelta | undefined => deltasMap[metric];
  // normalize propStores shape
  const normalizedStores: StoreListEntry[] = useMemo(() => {
    if (propStores && propStores.length) {
      return propStores.map(
        (s) => ({ id: s.id, code: s.code, name: s.name, is_active: true }) as StoreListEntry,
      );
    }
    return (storesQuery.data ?? []) as StoreListEntry[];
  }, [propStores, storesQuery.data]);

  const activeStoreCount = normalizedStores.filter(
    (s) => (s as StoreListEntry & { is_active?: boolean }).is_active !== false,
  ).length;
  const inactiveStoreCount = normalizedStores.length - activeStoreCount;
  const unitsSoldDelta = getDelta('Units Sold');
  const unitsSoldValue = unitsSoldDelta ? unitsSoldDelta.current_value : null;
  const lowStockCount = m.low_stock.length;
  const lowStockLoading = metricsQuery.isPending && !metrics;

  // Filter recent activity when store tab active (client-side)
  const recentActivity = useMemo(() => {
    if (!activeStoreId) return recentActivityRaw;
    const activeStoreName = normalizedStores.find((s) => s.id === activeStoreId)?.name;
    if (!activeStoreName) return recentActivityRaw.filter((a) => a.store_id === activeStoreId);
    return recentActivityRaw.filter(
      (a) => a.store_id === activeStoreId || a.store_name === activeStoreName,
    );
  }, [recentActivityRaw, activeStoreId, normalizedStores]);

  const activeStore = activeStoreId ? normalizedStores.find((s) => s.id === activeStoreId) : null;
  const scopeSuffix = activeStore ? ` (${activeStore.code || activeStore.name})` : '';
  const subtitle = activeStore
    ? `Here's what's happening at ${activeStore.name}.`
    : normalizedStores.length > 1
      ? "Here's what's happening across your stores."
      : "Here's what's happening with your inventory today.";

  const displayName = me?.full_name || me?.username || 'Isaac';
  const greeting = getGreeting();

  const loading = isInitialLoad;

  const pageError =
    [
      metricsQuery.error?.message,
      stockTrendQuery.error?.message,
      categoryDistQuery.error?.message,
      mostSoldQuery.error?.message,
      recentActivityQuery.error?.message,
      kpiDeltasQuery.error?.message,
    ].filter(Boolean)[0] ?? null;

  if (loading && !metrics) {
    return (
      <div className="web-analytics-view" data-testid="analytics-dashboard">
        <div
          style={{
            padding: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px',
          }}
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
      {/* Greeting header */}
      <div className="dash-greeting">
        <div>
          <h2 className="dash-greeting__title">
            {greeting}, {displayName} 👋
          </h2>
          <p className="dash-greeting__subtitle">{subtitle}</p>
        </div>
        <div className="dash-date-select" data-testid="dashboard-date-range-wrap">
          <Calendar size={14} aria-hidden="true" />
          <select
            value={dateRange.days}
            onChange={(e): void => {
              const days = Number(e.target.value);
              setDateRange({ days, label: dateRangeLabel(days) });
            }}
            aria-label="Date range"
            data-testid="dashboard-date-range"
            style={{ border: 'none', background: 'transparent' }}
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Store tabs — real tab semantics when >1 store */}
      {normalizedStores.length > 1 && (
        <div
          className="store-tabs"
          role="tablist"
          aria-label="Store filter"
          data-testid="store-tabs"
        >
          {normalizedStores.map((s) => {
            const active = activeStoreId === s.id;
            const shortCode = (s.code || s.name || 'S').charAt(0).toUpperCase();
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={active}
                aria-controls="dashboard-store-panel"
                className={`store-tab ${active ? 'store-tab--active' : ''}`}
                data-testid={`store-tab-${s.id}`}
                onClick={() => setActiveStoreId((prev) => (prev === s.id ? null : s.id))}
              >
                <span
                  className="store-tab__code"
                  style={{ background: active ? 'rgba(255,255,255,0.24)' : undefined }}
                >
                  {active ? (
                    <Store size={12} color="#fff" />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{shortCode}</span>
                  )}
                </span>
                <span className="store-tab__label">
                  <span style={{ fontWeight: 700, marginRight: 4 }}>{s.code || shortCode}</span>
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI Tiles — exactly 5 per spec (artifact: label → value → delta) */}
      <div className="web-dashboard-tiles dash-tiles" data-testid="analytics-tiles">
        <DashboardTile
          title="Total Products"
          numericValue={m.total_products}
          icon={Package}
          accent="var(--it-green)"
          animDelay={0}
          loading={loading}
          delta={
            getDelta('Total Products')
              ? {
                  label: `${getDelta('Total Products')!.delta_absolute >= 0 ? '+' : ''}${getDelta('Total Products')!.delta_absolute} vs prior period`,
                  positive: (getDelta('Total Products')!.delta_absolute ?? 0) >= 0,
                  neutral: (getDelta('Total Products')!.delta_absolute ?? 0) === 0,
                }
              : { label: '0 vs prior period', neutral: true }
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
          title="Stock Units"
          numericValue={m.total_stock_units}
          icon={Boxes}
          accent="var(--it-blue)"
          animDelay={40}
          loading={loading}
          delta={
            getDelta('Total Stock Units')
              ? {
                  label: `${(getDelta('Total Stock Units')!.delta_absolute ?? 0) >= 0 ? '+' : ''}${getDelta('Total Stock Units')!.delta_absolute} vs prior period`,
                  positive: (getDelta('Total Stock Units')!.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={<span>{`Updated ${dateRange.label.toLowerCase()}`}</span>}
          testId="tile-total-stock-units"
        />

        {/* Third tile switches per spec: Active Stores globally, Low Stock when store tab active */}
        {activeStoreId ? (
          <DashboardTile
            title="Low Stock Items"
            numericValue={lowStockLoading ? undefined : lowStockCount}
            icon={AlertTriangle}
            accent="var(--it-red)"
            animDelay={80}
            loading={lowStockLoading}
            delta={
              getDelta('Low Stock Items') // may not exist, fallback
                ? { label: getDelta('Low Stock Items')!.period_label, positive: false }
                : undefined
            }
            footer={
              <span style={{ color: 'var(--it-red-text)' }}>
                {lowStockLoading
                  ? 'Loading...'
                  : lowStockCount > 0
                    ? `${lowStockCount} need attention`
                    : 'All good'}
              </span>
            }
            testId="tile-low-stock"
          />
        ) : (
          <DashboardTile
            title="Active Stores"
            numericValue={normalizedStores.length ? activeStoreCount : 2}
            icon={Store}
            accent="var(--it-purple)"
            animDelay={80}
            loading={loading || storesQuery.isPending}
            footer={
              <span>
                {storesQuery.error?.message
                  ? 'Store list unavailable'
                  : inactiveStoreCount > 0
                    ? `${inactiveStoreCount} inactive`
                    : 'All stores active'}
              </span>
            }
            testId="tile-active-stores"
          />
        )}

        <DashboardTile
          title="Units Sold"
          value={unitsSoldValue === null ? '—' : undefined}
          numericValue={unitsSoldValue ?? undefined}
          icon={ShoppingCart}
          accent="var(--it-orange)"
          animDelay={120}
          loading={loading}
          variant="accent"
          delta={
            unitsSoldDelta
              ? {
                  label: `${unitsSoldDelta.delta_percentage !== null ? `${unitsSoldDelta.delta_percentage >= 0 ? '+' : ''}${unitsSoldDelta.delta_percentage}%` : `${unitsSoldDelta.delta_absolute >= 0 ? '+' : ''}${unitsSoldDelta.delta_absolute}`} vs prior period`,
                  positive: (unitsSoldDelta.delta_absolute ?? 0) >= 0,
                }
              : undefined
          }
          footer={
            <span>
              {opsSummaryQuery.data
                ? `${opsSummaryQuery.data.total_transactions} transactions`
                : `Updated ${dateRange.label.toLowerCase()}`}
            </span>
          }
          testId="tile-units-sold"
        />

        <DashboardTile
          title="Last Sync"
          value={_formatLastSync(m.last_sync_at)}
          icon={Clock}
          accent="var(--it-teal)"
          animDelay={160}
          loading={loading}
          footer={
            <span>
              {m.last_sync_at ? new Date(m.last_sync_at).toLocaleString() : 'No sync recorded yet'}
            </span>
          }
          testId="tile-last-sync"
        />
      </div>

      {/* Charts row: Stock Trend (wider) + Product Categories */}
      <div
        className="dash-charts"
        data-testid="dashboard-charts"
        id="dashboard-store-panel"
        role="tabpanel"
      >
        <div className="dash-panel web-dashboard-chart-panel" data-testid="stock-trend-chart">
          <div className="dash-panel__header">
            <div>
              <h3 className="dash-panel__title">
                <TrendingUp size={16} aria-hidden="true" />
                Stock Trend
              </h3>
              <p className="dash-panel__subtitle">
                Total stock units on hand{activeStore ? `, ${activeStore.name}` : ''}
              </p>
            </div>
            <span className="dash-date-select" style={{ height: 28, fontSize: 11 }}>
              <select
                value={dateRange.days}
                onChange={(e): void => {
                  const days = Number(e.target.value);
                  setDateRange({ days, label: dateRangeLabel(days) });
                }}
                aria-label="Stock trend range"
                style={{ border: 'none', background: 'transparent', fontSize: 11 }}
              >
                {DATE_RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
          {stockTrendQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load stock trend"
              body={stockTrendQuery.error?.message}
            />
          ) : stockTrendQuery.isPending ? (
            <Skeleton height={210} />
          ) : (
            <StockTrendChart data={stockTrend} height={210} testId="stock-trend-chart-canvas" />
          )}
        </div>

        <div
          className="dash-panel web-dashboard-chart-panel"
          data-testid="category-distribution-chart"
        >
          <div>
            <h3 className="dash-panel__title">
              <Layers size={16} aria-hidden="true" />
              Product Categories
            </h3>
            <p className="dash-panel__subtitle">Distribution across the catalogue</p>
          </div>
          {categoryDistQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load categories"
              body={categoryDistQuery.error?.message}
            />
          ) : categoryDistQuery.isPending ? (
            <Skeleton height={210} />
          ) : (
            <CategoryDonutChart
              data={categoryDist}
              totalProducts={categoryTotalProducts}
              testId="category-donut-chart-canvas"
            />
          )}
        </div>
      </div>

      {/* Tables row: Most Sold + Low Stock */}
      <div className="dash-tables web-dashboard-tables-row" data-testid="dashboard-tables">
        <div className="dash-panel web-dashboard-table-panel" data-testid="most-sold-table">
          <div className="web-dashboard-table-header">
            <div>
              <h3 className="web-dashboard-table-title">Most Sold Products{scopeSuffix}</h3>
              <p className="dash-panel__subtitle">
                Ranked by units sold, {dateRange.label.toLowerCase()}
              </p>
            </div>
          </div>
          {mostSoldQuery.error ? (
            <EmptyState
              variant="error"
              heading="Failed to load most-sold"
              body={mostSoldQuery.error?.message}
            />
          ) : mostSoldExtended.length > 0 ? (
            <table className="dash-table" data-testid="most-sold-table-content">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Units Sold</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {mostSoldExtended.map((p, idx) => (
                  <tr key={p.product_id}>
                    <td className="web-cell-mono">{idx + 1}</td>
                    <td>{p.product_name}</td>
                    <td>{p.category}</td>
                    <td className="web-cell-mono">{p.units_sold.toLocaleString()}</td>
                    <td>
                      {p.trend_direction === 'up' ? (
                        <span className="web-cell-delta web-cell-delta--pos">
                          <ArrowUp size={12} aria-hidden="true" />{' '}
                          {p.trend_percentage !== null ? `+${p.trend_percentage}%` : 'New'}
                        </span>
                      ) : p.trend_direction === 'down' ? (
                        <span className="web-cell-delta web-cell-delta--neg">
                          <ArrowDown size={12} aria-hidden="true" />{' '}
                          {p.trend_percentage !== null ? `${p.trend_percentage}%` : '—'}
                        </span>
                      ) : (
                        <span className="web-cell-delta web-cell-delta--neutral">
                          <Activity size={12} aria-hidden="true" /> —
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

        <div className="dash-panel web-dashboard-table-panel" data-testid="low-stock-table">
          <div className="web-dashboard-table-header">
            <div>
              <h3 className="web-dashboard-table-title">Low-Stock Alerts{scopeSuffix}</h3>
              <p className="dash-panel__subtitle">Below reorder threshold</p>
            </div>
          </div>
          {lowStockLoading ? (
            <div className="dash-empty" data-testid="low-stock-loading">
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 0,
                  background: 'var(--it-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Package size={18} color="var(--it-text-disabled)" />
              </div>
              <div style={{ fontWeight: 700, color: 'var(--it-text-primary)' }}>Loading...</div>
              <div style={{ fontSize: 12 }}>Fetching low stock data...</div>
            </div>
          ) : m.low_stock.length > 0 ? (
            <table className="dash-table" data-testid="low-stock-table-content">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {m.low_stock.slice(0, 5).map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.product_name}</td>
                    <td className="web-cell-mono">{p.quantity}</td>
                    <td className="web-cell-mono">{p.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dash-empty" data-testid="low-stock-empty">
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 0,
                  background: 'var(--it-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Package size={18} color="var(--it-text-disabled)" />
              </div>
              <div style={{ fontWeight: 700, color: 'var(--it-text-primary)' }}>No low stock</div>
              <div style={{ fontSize: 12 }}>All products are above their thresholds.</div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity — full width */}
      <div className="dash-panel web-dashboard-preview" data-testid="recent-activity-preview">
        <div className="web-dashboard-preview-header">
          <div>
            <h3 className="web-dashboard-preview-title">
              <Activity size={16} aria-hidden="true" />
              Recent Activity{scopeSuffix}
            </h3>
            <p className="dash-panel__subtitle">Latest stock movements across all stores</p>
          </div>
        </div>
        {recentActivityQuery.error ? (
          <EmptyState
            variant="error"
            heading="Failed to load activity"
            body={recentActivityQuery.error?.message}
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
