import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store } from '../types/store';
import { getProducts } from '../services/tauriProductService';
import {
  getLocalTransactions,
  getStockBalancesForStore,
} from '../services/tauriTransactionService';
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
} from '../types/dashboard';
import type { InventoryTransaction } from '../types/transaction';
import type { Product } from '../types/product';

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

function _inDateRange(dateStr: string, range: DateRange): boolean {
  const d = dateStr.slice(0, 10);
  return d >= range.start && d <= range.end;
}

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

function _classifyStock(
  quantity: number,
  threshold: number | null | undefined,
): 'in' | 'low' | 'out' {
  if (quantity <= 0) return 'out';
  if (threshold != null && quantity <= threshold) return 'low';
  return 'in';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  loading,
  error,
  onRetry,
  userRole = 'ADMIN',
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [stockBalances, setStockBalances] = useState<Map<string, number>>(new Map());
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const isAuthorized =
    userRole === 'GLOBAL_ADMIN' ||
    userRole === 'ADMIN' ||
    userRole === 'INVENTORY_MANAGER' ||
    userRole === 'STORE_MANAGER';

  const loadLocalData = useCallback(async (): Promise<void> => {
    setDataLoading(true);
    setSyncError(null);
    let firstError: string | null = null;
    try {
      const prods = await getProducts().catch((err) => {
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        return [] as Product[];
      });
      const txns = await getLocalTransactions().catch((err) => {
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        return [] as InventoryTransaction[];
      });
      const syncTime = await getLastSyncTimestamp().catch(() => null as string | null);
      setProducts(prods);
      setTransactions(txns);
      setLastSyncAt(syncTime);
      if (firstError) setSyncError(firstError);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadStockBalances = useCallback(async (): Promise<void> => {
    if (!stores.length) return;
    try {
      const allBalances = new Map<string, number>();
      for (const store of stores) {
        const balances = await getStockBalancesForStore(store.id).catch(
          () => new Map<string, number>(),
        );
        for (const [pid, qty] of balances) {
          allBalances.set(pid, (allBalances.get(pid) ?? 0) + qty);
        }
      }
      setStockBalances(allBalances);
    } catch {
      // Non-fatal — analytics will use product.stock_quantity as fallback
    }
  }, [stores]);

  useEffect(() => {
    void loadLocalData();
    void loadStockBalances();
  }, [loadLocalData, loadStockBalances]);

  useEffect(() => {
    const handler = (): void => {
      void loadLocalData();
      void loadStockBalances();
    };
    window.addEventListener('inventory-sync-complete', handler);
    return (): void => {
      window.removeEventListener('inventory-sync-complete', handler);
    };
  }, [loadLocalData, loadStockBalances]);

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
      void loadLocalData();
      void loadStockBalances();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  }, [loadLocalData, loadStockBalances]);

  const productsInRange = useMemo(
    () => products.filter((p) => _inDateRange(p.created_at, dateRange)),
    [products, dateRange],
  );

  const transactionsInRange = useMemo(
    () => transactions.filter((t) => _inDateRange(t.occurred_at, dateRange)),
    [transactions, dateRange],
  );

  const transactionsPriorRange = useMemo(() => {
    const priorStart = new Date(dateRange.start);
    priorStart.setDate(priorStart.getDate() - 7);
    const priorEnd = new Date(dateRange.start);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorRange: DateRange = {
      start: priorStart.toISOString().slice(0, 10),
      end: priorEnd.toISOString().slice(0, 10),
    };
    return transactions.filter((t) => _inDateRange(t.occurred_at, priorRange));
  }, [transactions, dateRange]);

  const totalStockUnits = useMemo(
    () => products.reduce((sum, p) => sum + (p.stock_quantity ?? 0), 0),
    [products],
  );

  const productsInMultipleStores = useMemo(() => {
    const productStores = new Map<string, Set<string>>();
    for (const store of stores) {
      for (const p of products) {
        if ((p.stock_quantity ?? 0) > 0 || stockBalances.has(p.id)) {
          if (!productStores.has(p.id)) productStores.set(p.id, new Set());
          productStores.get(p.id)!.add(store.id);
        }
      }
    }
    let count = 0;
    for (const [, storeIds] of productStores) {
      if (storeIds.size > 1) count++;
    }
    return count;
  }, [products, stores, stockBalances]);

  const receiptLinkedSales = useMemo(() => {
    return transactionsInRange.filter(
      (t) => t.movement_type === 'SALE' && (t.purchase_order_id || t.reference_number),
    ).length;
  }, [transactionsInRange]);

  const receiptLinkedSalesPrior = useMemo(() => {
    return transactionsPriorRange.filter(
      (t) => t.movement_type === 'SALE' && (t.purchase_order_id || t.reference_number),
    ).length;
  }, [transactionsPriorRange]);

  const kpiDeltas = useMemo((): KPIDelta[] => {
    const productsCreatedCurrent = productsInRange.length;
    const productsCreatedPrior = transactionsPriorRange.length;
    const stockDeltaCurrent = transactionsInRange.reduce((sum, t) => sum + t.quantity_delta, 0);
    const stockDeltaPrior = transactionsPriorRange.reduce((sum, t) => sum + t.quantity_delta, 0);

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
        current_value: totalStockUnits,
        prior_value: totalStockUnits - stockDeltaCurrent,
        delta_absolute: stockDeltaCurrent,
        delta_percentage:
          stockDeltaPrior !== 0
            ? Math.round((stockDeltaCurrent / Math.abs(stockDeltaPrior)) * 1000) / 10
            : null,
        period_label: 'last 7 days',
      },
      {
        metric: 'Cross-Store Distribution',
        current_value: productsInMultipleStores,
        prior_value: 0,
        delta_absolute: productsInMultipleStores,
        delta_percentage: null,
        period_label: 'last 7 days',
      },
      {
        metric: 'Receipt-Linked Sales',
        current_value: receiptLinkedSales,
        prior_value: receiptLinkedSalesPrior,
        delta_absolute: receiptLinkedSales - receiptLinkedSalesPrior,
        delta_percentage:
          receiptLinkedSalesPrior > 0
            ? Math.round(
                ((receiptLinkedSales - receiptLinkedSalesPrior) / receiptLinkedSalesPrior) * 1000,
              ) / 10
            : null,
        period_label: 'last 7 days',
      },
    ];
  }, [
    productsInRange,
    transactionsInRange,
    transactionsPriorRange,
    totalStockUnits,
    productsInMultipleStores,
    receiptLinkedSales,
    receiptLinkedSalesPrior,
  ]);

  const stockTrendData = useMemo((): StockTrendPoint[] => {
    const byDate = new Map<string, number>();
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byDate.set(key, 0);
    }
    for (const t of transactions) {
      const key = t.occurred_at.slice(0, 10);
      if (byDate.has(key)) {
        byDate.set(key, byDate.get(key)! + Math.max(0, t.quantity_delta));
      }
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total_stock_units: Math.max(0, total + totalStockUnits) }));
  }, [transactions, dateRange, totalStockUnits]);

  const categoryDistribution = useMemo((): CategoryDistributionPoint[] => {
    const byCategory = new Map<string, number>();
    for (const p of products) {
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
    }
    const total = products.length || 1;
    return Array.from(byCategory.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }, [products]);

  const stockStatusByCategory = useMemo((): StockStatusCategoryRow[] => {
    const byCategory = new Map<string, { in: number; low: number; out: number; total: number }>();
    for (const p of products) {
      const cat = p.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { in: 0, low: 0, out: 0, total: 0 });
      }
      const entry = byCategory.get(cat)!;
      const totalQty = stockBalances.get(p.id) ?? p.stock_quantity ?? 0;
      const cls = _classifyStock(totalQty, p.low_stock_threshold);
      if (cls === 'in') entry.in++;
      else if (cls === 'low') entry.low++;
      else entry.out++;
      entry.total++;
    }
    return Array.from(byCategory.entries()).map(([category, vals]) => ({
      category,
      in_stock: vals.in,
      low_stock: vals.low,
      out_of_stock: vals.out,
      total: vals.total,
    }));
  }, [products, stockBalances]);

  const mostSoldProducts = useMemo((): MostSoldProduct[] => {
    const salesByProduct = new Map<string, number>();
    for (const t of transactionsInRange) {
      if (t.movement_type === 'SALE') {
        salesByProduct.set(
          t.product_id,
          (salesByProduct.get(t.product_id) ?? 0) + Math.abs(t.quantity_delta),
        );
      }
    }
    const priorSalesByProduct = new Map<string, number>();
    for (const t of transactionsPriorRange) {
      if (t.movement_type === 'SALE') {
        priorSalesByProduct.set(
          t.product_id,
          (priorSalesByProduct.get(t.product_id) ?? 0) + Math.abs(t.quantity_delta),
        );
      }
    }
    const productMap = new Map(products.map((p) => [p.id, p]));
    return Array.from(salesByProduct.entries())
      .map(([productId, unitsSold]): MostSoldProduct => {
        const p = productMap.get(productId);
        const prior = priorSalesByProduct.get(productId) ?? 0;
        const trendDir: 'up' | 'down' | 'neutral' =
          unitsSold > prior ? 'up' : unitsSold < prior ? 'down' : 'neutral';
        const trendPct = prior > 0 ? Math.round(((unitsSold - prior) / prior) * 1000) / 10 : null;
        return {
          product_id: productId,
          product_name: p?.name ?? productId,
          category: p?.category ?? '',
          units_sold: unitsSold,
          trend_direction: trendDir,
          trend_percentage: trendPct,
        };
      })
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 10);
  }, [transactionsInRange, transactionsPriorRange, products]);

  const lowStockAlerts = useMemo(() => {
    return products
      .filter((p) => {
        const totalQty = stockBalances.get(p.id) ?? p.stock_quantity ?? 0;
        return p.low_stock_threshold != null && totalQty <= p.low_stock_threshold;
      })
      .map((p) => {
        const totalQty = stockBalances.get(p.id) ?? p.stock_quantity ?? 0;
        return {
          product_id: p.id,
          product_name: p.name,
          current_stock: totalQty,
          threshold: p.low_stock_threshold ?? null,
          category: p.category,
        };
      })
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 5);
  }, [products, stockBalances]);

  const recentActivity = useMemo((): RecentActivityItem[] => {
    const sorted = [...transactionsInRange].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));
    return sorted.slice(0, 5).map((t) => {
      let type: ActivityType;
      if (t.movement_type === 'RECEIPT') type = 'stock_added';
      else if (t.movement_type === 'SALE') type = 'stock_sold';
      else if (t.movement_type?.startsWith('TRANSFER')) type = 'transfer_completed';
      else if (t.movement_type === 'RETURN') type = 'return';
      else if (t.movement_type === 'DAMAGE') type = 'damage';
      else if (t.movement_type === 'ADJUSTMENT') type = 'adjustment';
      else type = 'stock_removed';
      return {
        id: t.transaction_id,
        type,
        product_id: t.product_id,
        product_name: t.product_name ?? t.product_id,
        sku: '',
        store_id: t.store_id,
        store_name: storeMap.get(t.store_id) ?? t.store_id,
        quantity: t.quantity_delta,
        occurred_at: t.occurred_at,
        reference_number: t.reference_number,
      };
    });
  }, [transactionsInRange, stores]);

  const lastSyncTimeStr = lastSyncAt ? _formatRelativeTime(lastSyncAt) : 'Never';

  const kpiTiles = useMemo(() => {
    const fmtDelta = (
      d: (typeof kpiDeltas)[0],
    ): { absolute: string; percentage: string | null } => ({
      absolute: d.delta_absolute > 0 ? `+${d.delta_absolute}` : `${d.delta_absolute}`,
      percentage: d.delta_percentage != null ? `${d.delta_percentage}% vs last week` : null,
    });
    return [
      {
        key: 'total-products',
        label: 'Total Products',
        value: dataLoading ? '...' : String(productsInRange.length),
        delta: fmtDelta(kpiDeltas[0]),
        dataTestId: 'kpi-total-products',
      },
      {
        key: 'total-stock',
        label: 'Total Stock Units',
        value: dataLoading ? '...' : String(totalStockUnits),
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
      {
        key: 'cross-store',
        label: 'Cross-Store Distribution',
        value: dataLoading ? '...' : String(productsInMultipleStores),
        delta: fmtDelta(kpiDeltas[2]),
        dataTestId: 'kpi-cross-store',
      },
      {
        key: 'receipt-sales',
        label: 'Receipt-Linked Sales',
        value: dataLoading ? '...' : String(receiptLinkedSales),
        delta: fmtDelta(kpiDeltas[3]),
        dataTestId: 'kpi-receipt-sales',
      },
    ];
  }, [
    dataLoading,
    productsInRange,
    totalStockUnits,
    lastSyncTimeStr,
    productsInMultipleStores,
    receiptLinkedSales,
    kpiDeltas,
  ]);

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
              Inventory analytics powered by local SQLite (offline-first)
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
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <Button variant="primary" onClick={onRetry} size="sm">
            Retry
          </Button>
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
          body="Reading from local SQLite database..."
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
                    {item.product_name}
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
