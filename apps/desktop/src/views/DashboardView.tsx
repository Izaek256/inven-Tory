import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store } from '../types/store';
import { getDashboardAnalytics } from '../services/tauriDashboardService';
import { getLastSyncTimestamp, triggerSync } from '../services/tauriSyncService';
import { Button, StatCard, DataTable, EmptyState, ColumnDef } from '@invenTory/ui';
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  FileText,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Pencil,
  RefreshCw,
  Calendar,
  Clock,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
} from 'lucide-react';
import { StockTrendChart } from '../components/StockTrendChart';
import { CategoryDonutChart } from '../components/CategoryDonutChart';
import { StockStatusStackedBarChart } from '../components/StockStatusStackedBarChart';
import type {
  StockTrendPoint,
  CategoryDistributionPoint,
  StockStatusCategoryRow,
  KPIDelta,
  MostSoldProduct,
  RecentActivityItem,
  ActivityType,
  DateRange,
  DashboardAnalytics,
  DashboardKPIs,
  LowStockAlert,
} from '../types/dashboard';
import { useActiveStore } from '../context/StoreContext';

interface DashboardViewProps {
  stores: Store[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  userRole?: string;
}

const DEFAULT_DATE_RANGE: DateRange = ((): DateRange => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
})();

/** KPI shape used before analytics arrive (avoids null-guarding every tile). */
const EMPTY_KPIS: DashboardKPIs = {
  total_products_current: 0,
  total_products_prior: 0,
  total_stock_units: 0,
  stock_delta_current: 0,
  stock_delta_prior: 0,
  products_in_multiple_stores: 0,
  receipt_linked_sales_current: 0,
  receipt_linked_sales_prior: 0,
};

const ACTIVITY_ICON_MAP: Record<ActivityType, React.ReactElement> = {
  stock_added: <ArrowDownCircle size={16} color="var(--it-green)" />,
  stock_sold: <ArrowUpCircle size={16} color="var(--it-red)" />,
  transfer_completed: <ArrowLeftRight size={16} color="var(--it-blue)" />,
  receipt_linked: <FileText size={16} color="var(--it-purple)" />,
  stock_removed: <Trash2 size={16} color="var(--it-orange)" />,
  adjustment: <Pencil size={16} color="var(--it-amber)" />,
  damage: <AlertTriangle size={16} color="var(--it-red)" />,
  return: <RotateCcw size={16} color="var(--it-teal)" />,
};

function _formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Fallback name for deleted/unknown products surfaced in activity feeds. */
function _displayProductName(item: RecentActivityItem): string {
  return item.product_name || `Unknown Product (${item.product_id})`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  loading,
  error,
  onRetry,
  userRole = 'ADMIN',
}) => {
  const { activeStoreId } = useActiveStore();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const isAuthorized =
    userRole === 'GLOBAL_ADMIN' ||
    userRole === 'ADMIN' ||
    userRole === 'INVENTORY_MANAGER' ||
    userRole === 'STORE_MANAGER';

  // The aggregation now happens in SQLite (get_dashboard_analytics), so the
  // view makes a single bounded IPC round-trip instead of shipping the whole
  // product + ledger catalogues to JS. Refetches whenever the date range or
  // active store changes.
  const loadAnalytics = useCallback(async (): Promise<void> => {
    setDataLoading(true);
    setSyncError(null);
    const [analyticsSettled, syncSettled] = await Promise.allSettled([
      getDashboardAnalytics(activeStoreId, dateRange.start, dateRange.end),
      getLastSyncTimestamp(),
    ]);
    try {
      let firstError: string | null = null;
      if (analyticsSettled.status === 'fulfilled') {
        setAnalytics(analyticsSettled.value);
      } else {
        setAnalytics(null);
        firstError =
          analyticsSettled.reason instanceof Error
            ? analyticsSettled.reason.message
            : String(analyticsSettled.reason);
      }
      setLastSyncAt(syncSettled.status === 'fulfilled' ? syncSettled.value : null);
      if (firstError) setSyncError(firstError);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setDataLoading(false);
    }
  }, [activeStoreId, dateRange.start, dateRange.end]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const handler = (): void => {
      void loadAnalytics();
    };
    window.addEventListener('inventory-sync-complete', handler);
    return (): void => {
      window.removeEventListener('inventory-sync-complete', handler);
    };
  }, [loadAnalytics]);

  const handleSyncNow = useCallback(async (): Promise<void> => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const envBaseUrl =
        typeof import.meta !== 'undefined'
          ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
          : undefined;
      const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
      await triggerSync({ apiBaseUrl, force: true });
      void loadAnalytics();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  }, [loadAnalytics]);

  const kpis = analytics?.kpis ?? EMPTY_KPIS;

  const kpiDeltas = useMemo((): KPIDelta[] => {
    // Percentages match the previous view's math exactly; the raw values now
    // come from SQLite aggregation (which also fixed the productsCreatedPrior
    // bug — it used to count prior-range transactions instead of products).
    const productsCreatedCurrent = kpis.total_products_current;
    const productsCreatedPrior = kpis.total_products_prior;
    const stockDeltaCurrent = kpis.stock_delta_current;
    const stockDeltaPrior = kpis.stock_delta_prior;
    const stockValue = kpis.total_stock_units;

    return [
      {
        metric: 'Total Products',
        current_value: productsCreatedCurrent,
        prior_value: productsCreatedPrior,
        delta_absolute: productsCreatedCurrent - productsCreatedPrior,
        delta_percentage:
          productsCreatedPrior > 0
            ? Math.round(
                ((productsCreatedCurrent - productsCreatedPrior) / productsCreatedPrior) * 1000,
              ) / 10
            : null,
        period_label: 'last 7 days',
      },
      {
        metric: 'Total Stock Units',
        current_value: stockValue,
        prior_value: stockValue - stockDeltaCurrent,
        delta_absolute: stockDeltaCurrent,
        delta_percentage:
          stockDeltaPrior !== 0
            ? Math.round((stockDeltaCurrent / Math.abs(stockDeltaPrior)) * 1000) / 10
            : null,
        period_label: 'last 7 days',
      },
      {
        metric: 'Cross-Store Distribution',
        current_value: kpis.products_in_multiple_stores,
        prior_value: 0,
        delta_absolute: kpis.products_in_multiple_stores,
        delta_percentage: null,
        period_label: 'last 7 days',
      },
      {
        metric: 'Receipt-Linked Sales',
        current_value: kpis.receipt_linked_sales_current,
        prior_value: kpis.receipt_linked_sales_prior,
        delta_absolute: kpis.receipt_linked_sales_current - kpis.receipt_linked_sales_prior,
        delta_percentage:
          kpis.receipt_linked_sales_prior > 0
            ? Math.round(
                ((kpis.receipt_linked_sales_current - kpis.receipt_linked_sales_prior) /
                  kpis.receipt_linked_sales_prior) *
                  1000,
              ) / 10
            : null,
        period_label: 'last 7 days',
      },
    ];
  }, [kpis]);

  const stockTrendData = useMemo(
    (): StockTrendPoint[] => analytics?.stock_trend ?? [],
    [analytics],
  );
  const categoryDistribution = useMemo(
    (): CategoryDistributionPoint[] => analytics?.category_distribution ?? [],
    [analytics],
  );
  const stockStatusByCategory = useMemo(
    (): StockStatusCategoryRow[] => analytics?.stock_status_by_category ?? [],
    [analytics],
  );
  const mostSoldProducts = useMemo(
    (): MostSoldProduct[] => analytics?.most_sold_products ?? [],
    [analytics],
  );
  const lowStockAlerts = useMemo(
    (): LowStockAlert[] => analytics?.low_stock_alerts ?? [],
    [analytics],
  );
  const recentActivity = useMemo(
    (): RecentActivityItem[] => analytics?.recent_activity ?? [],
    [analytics],
  );

  const lastSyncTimeStr = lastSyncAt ? _formatRelativeTime(lastSyncAt) : 'Never';
  const activeStore = activeStoreId ? stores.find((s) => s.id === activeStoreId) : undefined;

  const kpiTiles = useMemo(() => {
    const fmtDelta = (
      d: (typeof kpiDeltas)[0],
    ): { absolute: string; percentage: string | null } => ({
      absolute: d.delta_absolute > 0 ? `+${d.delta_absolute}` : `${d.delta_absolute}`,
      percentage: d.delta_percentage != null ? `${d.delta_percentage}% vs last week` : null,
    });
    // Scoped view swaps the meaningless single-store Cross-Store tile for
    // Low Stock Items (web dashboard parity).
    const scopeTile = activeStoreId
      ? {
          key: 'low-stock',
          label: 'Low Stock Items',
          value: dataLoading ? '...' : String(lowStockAlerts.length),
          delta: null,
          dataTestId: 'kpi-low-stock',
        }
      : {
          key: 'cross-store',
          label: 'Cross-Store Distribution',
          value: dataLoading ? '...' : String(kpis.products_in_multiple_stores),
          delta: fmtDelta(kpiDeltas[2]),
          dataTestId: 'kpi-cross-store',
        };
    return [
      {
        key: 'total-products',
        label: 'Total Products',
        value: dataLoading ? '...' : String(kpis.total_products_current),
        delta: fmtDelta(kpiDeltas[0]),
        dataTestId: 'kpi-total-products',
      },
      {
        key: 'total-stock',
        label: 'Total Stock Units',
        value: dataLoading ? '...' : String(kpis.total_stock_units),
        delta: fmtDelta(kpiDeltas[1]),
        dataTestId: 'kpi-total-stock',
      },
      {
        key: 'last-sync',
        label: 'Last Sync',
        value: dataLoading ? '...' : lastSyncTimeStr,
        delta: null,
        dataTestId: 'kpi-last-sync',
      },
      scopeTile,
      {
        key: 'receipt-sales',
        label: 'Receipt-Linked Sales',
        value: dataLoading ? '...' : String(kpis.receipt_linked_sales_current),
        delta: fmtDelta(kpiDeltas[3]),
        dataTestId: 'kpi-receipt-sales',
      },
    ];
  }, [dataLoading, kpis, lastSyncTimeStr, kpiDeltas, activeStoreId, lowStockAlerts]);

  const mostSoldColumns: ColumnDef<MostSoldProduct>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (m) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={14} color="var(--it-text-secondary)" />
          <span style={{ fontWeight: 500 }}>{m.product_name}</span>
        </span>
      ),
      accessor: (m) => m.product_name,
    },
    {
      key: 'category',
      header: 'Category',
      render: (m) => <span style={{ color: 'var(--it-text-secondary)' }}>{m.category || '—'}</span>,
      accessor: (m) => m.category,
    },
    {
      key: 'units_sold',
      header: 'Units Sold',
      numeric: true,
      render: (m) => m.units_sold,
      accessor: (m) => m.units_sold,
    },
    {
      key: 'trend',
      header: 'Trend',
      render: (m): React.ReactNode => {
        if (m.trend_direction === 'up') {
          return (
            <span
              style={{
                color: 'var(--it-green-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <TrendingUp size={14} />
              {m.trend_percentage != null ? `+${m.trend_percentage}%` : '+'}
            </span>
          );
        }
        if (m.trend_direction === 'down') {
          return (
            <span
              style={{
                color: 'var(--it-red-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <TrendingDown size={14} />
              {m.trend_percentage != null ? `${m.trend_percentage}%` : '-'}
            </span>
          );
        }
        return (
          <span
            style={{
              color: 'var(--it-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Minus size={14} />
            0%
          </span>
        );
      },
      accessor: (m) => m.trend_direction,
    },
  ];

  const lowStockColumns: ColumnDef<{
    product_name: string;
    current_stock: number;
    threshold: number | null;
  }>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={14} color="var(--it-text-secondary)" />
          <span style={{ fontWeight: 500 }}>{row.product_name}</span>
        </span>
      ),
      accessor: (row) => row.product_name,
    },
    {
      key: 'current_stock',
      header: 'Current Stock',
      numeric: true,
      render: (row) => (
        <span
          style={{
            color:
              row.current_stock <= (row.threshold ?? 0)
                ? 'var(--it-red-text)'
                : 'var(--it-text-primary)',
          }}
        >
          {row.current_stock}
        </span>
      ),
      accessor: (row) => row.current_stock,
    },
    {
      key: 'threshold',
      header: 'Threshold',
      numeric: true,
      render: (row) => row.threshold ?? '—',
      accessor: (row) => row.threshold,
    },
  ];

  return (
    <div className="dashboard-view" data-testid="dashboard-view">
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LayoutDashboard size={24} color="var(--it-green)" />
          <div>
            <h2 className="view-title">Analytics Dashboard</h2>
            <p className="view-subtitle">
              {activeStore
                ? `Live overview of ${activeStore.name}`
                : 'Live overview of your stock, sales and stores'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} color="var(--it-text-secondary)" />
            <input
              type="date"
              data-testid="date-range-start"
              value={dateRange.start}
              onChange={(e) => {
                if (e.target.value) {
                  setDateRange((prev) => ({ ...prev, start: e.target.value }));
                }
              }}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '13px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
              }}
              aria-label="Start date"
            />
            <span style={{ color: 'var(--it-text-secondary)', fontSize: '13px' }}>to</span>
            <input
              type="date"
              data-testid="date-range-end"
              value={dateRange.end}
              onChange={(e) => {
                if (e.target.value) {
                  setDateRange((prev) => ({ ...prev, end: e.target.value }));
                }
              }}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '13px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
              }}
              aria-label="End date"
            />
          </div>
          {isAuthorized && (
            <Button
              variant="primary"
              onClick={handleSyncNow}
              disabled={isSyncing}
              data-testid="sync-now-btn"
            >
              <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
              <span>Sync Now</span>
            </Button>
          )}
        </div>
      </div>

      {syncError && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="sync-error"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{syncError}</span>
        </div>
      )}

      {error && !syncError && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="dashboard-action-error"
        >
          <div
            data-testid="error-state"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}
          >
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
            <Button variant="primary" onClick={onRetry} size="sm">
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* KPI Tiles — responsive grid (Task C parity with web) */}
      <div className="desktop-kpi-grid" data-testid="desktop-kpi-grid">
        {kpiTiles.map((tile) => (
          <div key={tile.key} data-testid={tile.dataTestId}>
            <StatCard label={tile.label} value={tile.value} />
            {tile.delta && (
              <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--it-green-text)' }}>
                {tile.delta.absolute}
                {tile.delta.percentage && <span> — {tile.delta.percentage}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Data Status */}
      {(dataLoading || loading) && !error && (
        <EmptyState
          variant="loading"
          heading="Loading analytics"
          body="Loading your inventory data..."
          data-testid="dashboard-loading"
        />
      )}

      {/* Stock Trend Chart */}
      <div
        className="it-summary-card"
        style={{
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          backgroundColor: 'var(--it-card)',
          overflow: 'hidden',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--it-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color="var(--it-green)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
              Stock Trend
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
            Total stock units over time
          </span>
        </div>
        {!dataLoading && (
          <div style={{ padding: '16px 20px' }}>
            <StockTrendChart data={stockTrendData} height={260} testId="stock-trend-chart" />
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          className="it-summary-card"
          style={{
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            backgroundColor: 'var(--it-card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--it-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={20} color="var(--it-blue)" />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Product Categories
              </h3>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
              Distribution
            </span>
          </div>
          {!dataLoading && (
            <div style={{ padding: '16px 20px' }}>
              <CategoryDonutChart
                data={categoryDistribution}
                height={240}
                testId="category-donut-chart"
              />
            </div>
          )}
        </div>

        <div
          className="it-summary-card"
          style={{
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            backgroundColor: 'var(--it-card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--it-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} color="var(--it-amber)" />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Stock Status by Category
              </h3>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
              In / Low / Out
            </span>
          </div>
          {!dataLoading && (
            <div style={{ padding: '16px 20px' }}>
              <StockStatusStackedBarChart
                data={stockStatusByCategory}
                height={240}
                testId="stock-status-chart"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tables Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        {/* Most-Sold Products */}
        <div
          className="it-summary-card"
          style={{
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            backgroundColor: 'var(--it-card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--it-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} color="var(--it-green)" />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Most-Sold Products
              </h3>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
              Revenue column deferred — no price data in Product model
            </span>
          </div>
          {!dataLoading ? (
            mostSoldProducts.length > 0 ? (
              <DataTable
                columns={mostSoldColumns}
                rows={mostSoldProducts}
                rowKey={(m) => m.product_id}
                data-testid="most-sold-table"
              />
            ) : (
              <EmptyState
                heading="No sales data"
                body="No sales transactions in the selected date range."
                data-testid="most-sold-empty"
              />
            )
          ) : (
            <EmptyState
              variant="loading"
              heading="Loading..."
              body="Reading local database..."
              data-testid="most-sold-loading"
            />
          )}
        </div>

        {/* Low-Stock Alerts */}
        <div
          className="it-summary-card"
          style={{
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            backgroundColor: 'var(--it-card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--it-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} color="var(--it-red)" />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Low-Stock Alerts
              </h3>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>Top 5</span>
          </div>
          {!dataLoading ? (
            lowStockAlerts.length > 0 ? (
              <>
                <DataTable
                  columns={lowStockColumns}
                  rows={lowStockAlerts}
                  rowKey={(row) => row.product_name}
                  data-testid="low-stock-table"
                />
                <div style={{ padding: '12px 20px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('inven-tory:navigate', { detail: 'products' }),
                      )
                    }
                    data-testid="view-all-low-stock"
                  >
                    View all low stock items <ChevronRight size={14} />
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                heading="No low stock"
                body="All products are above their low-stock thresholds."
                data-testid="low-stock-empty"
              />
            )
          ) : (
            <EmptyState
              variant="loading"
              heading="Loading..."
              body="Reading local database..."
              data-testid="low-stock-loading"
            />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div
        className="it-summary-card"
        style={{
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          backgroundColor: 'var(--it-card)',
          overflow: 'hidden',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--it-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} color="var(--it-green)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
              Recent Activity
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('inven-tory:navigate', { detail: 'transactions' }),
              )
            }
            data-testid="view-all-activities"
          >
            View all activities <ChevronRight size={14} />
          </Button>
        </div>
        {!dataLoading && recentActivity.length > 0 ? (
          <div data-testid="recent-activity-list">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--it-border)',
                }}
                data-testid={`activity-item-${item.id}`}
              >
                {ACTIVITY_ICON_MAP[item.type]}
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: '14px', fontWeight: 500, color: 'var(--it-text-primary)' }}
                  >
                    {_displayProductName(item)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
                    {item.type.replace(/_/g, ' ')} · {item.store_name} ·{' '}
                    {item.quantity > 0 ? '+' : ''}
                    {item.quantity} units
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--it-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {_formatRelativeTime(item.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        ) : dataLoading ? (
          <EmptyState
            variant="loading"
            heading="Loading..."
            body="Reading local database..."
            data-testid="activity-loading"
          />
        ) : (
          <EmptyState
            heading="No recent activity"
            body="No transactions in the selected date range."
            data-testid="activity-empty"
          />
        )}
      </div>
    </div>
  );
};
