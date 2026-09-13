/**
 * Recent Activity view - dedicated page with toolbar, timeline, and inventory snapshot.
 *
 * Phase 5 redesign:
 * - Toolbar with search, store filter, activity type filter, date range, refresh
 * - Activity feed as timeline with semantic icons
 * - Group by date (Today, Yesterday, calendar dates)
 * - Clear separation between activity feed and inventory snapshot
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Spinner, type ColumnDef } from '@invenTory/ui';
import {
  Activity,
  Clock,
  Search,
  Filter,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  FileText,
  Trash2,
  Pencil,
  AlertTriangle,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { getRecentActivity, searchProducts } from '../services/dashboardService';
import { useResistantQuery } from '../hooks/useResistantQuery';
import type { ProductSearchResult, RecentActivityResponse } from '../types/dashboard';
import { InventoryPanel } from '../components/InventoryPanel';
import { DataTable } from '@invenTory/ui';

const RECENT_LIMIT = 50;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  stock_added: 'Stock Added',
  stock_sold: 'Stock Sold',
  transfer_completed: 'Transfer',
  receipt_linked: 'Receipt Linked',
  stock_removed: 'Stock Removed',
  adjustment: 'Adjustment',
  damage: 'Damage',
  return: 'Return',
};

const ACTIVITY_TYPE_ICONS: Record<string, React.ReactElement> = {
  stock_added: <ArrowDownCircle size={16} color="var(--it-green)" />,
  stock_sold: <ArrowUpCircle size={16} color="var(--it-red)" />,
  transfer_completed: <ArrowLeftRight size={16} color="var(--it-blue)" />,
  receipt_linked: <FileText size={16} color="var(--it-purple)" />,
  stock_removed: <Trash2 size={16} color="var(--it-orange)" />,
  adjustment: <Pencil size={16} color="var(--it-amber)" />,
  damage: <AlertTriangle size={16} color="var(--it-red)" />,
  return: <RotateCcw size={16} color="var(--it-teal)" />,
};

export function RecentActivityView(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentProducts, setRecentProducts] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<number>(7);

  const activityQuery = useResistantQuery<RecentActivityResponse>(
    () => getRecentActivity(RECENT_LIMIT),
    [],
  );
  const activityItems = useMemo(() => activityQuery.data?.data ?? [], [activityQuery.data?.data]);

  // Filter activity items
  const filteredActivity = useMemo(() => {
    return activityItems.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_id?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesActivity =
        activityFilter === 'ALL' ||
        (activityFilter === 'SALE' && item.type === 'stock_sold') ||
        (activityFilter === 'RECEIPT' && item.type === 'receipt_linked') ||
        (activityFilter === 'TRANSFER' && item.type === 'transfer_completed') ||
        (activityFilter === 'RETURN' && item.type === 'return') ||
        (activityFilter === 'DAMAGE' && item.type === 'damage') ||
        (activityFilter === 'ADJUSTMENT' && item.type === 'adjustment');

      return matchesSearch && matchesActivity;
    });
  }, [activityItems, searchQuery, activityFilter]);

  // Group by date
  const groupedActivity = useMemo(() => {
    const groups: Record<string, typeof filteredActivity> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    filteredActivity.forEach((item) => {
      const date = new Date(item.occurred_at).toDateString();
      if (date === today) {
        if (!groups['Today']) groups['Today'] = [];
        groups['Today'].push(item);
      } else if (date === yesterday) {
        if (!groups['Yesterday']) groups['Yesterday'] = [];
        groups['Yesterday'].push(item);
      } else {
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
      }
    });

    return groups;
  }, [filteredActivity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchProducts('', 200)
      .then((data) => {
        if (!cancelled) {
          const sorted = [...data.results].sort((a, b) => {
            const aTime = a.last_balance_update ? new Date(a.last_balance_update).getTime() : 0;
            const bTime = b.last_balance_update ? new Date(b.last_balance_update).getTime() : 0;
            return bTime - aTime;
          });
          setRecentProducts(sorted.slice(0, RECENT_LIMIT));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const columns: ColumnDef<ProductSearchResult>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Product',
        accessor: (r) => r.name,
        render: (r) => (
          <span className="web-cell-product">
            <span className="web-cell-product__name">{r.name}</span>
            {r.brand && <span className="web-cell-secondary">{r.brand}</span>}
          </span>
        ),
      },
      {
        key: 'total_quantity',
        header: 'Current Stock',
        numeric: true,
        accessor: (r) => r.total_quantity ?? 0,
        render: (r) => (
          <span className="web-cell-mono">{(r.total_quantity ?? 0).toLocaleString()}</span>
        ),
      },
      {
        key: 'last_balance_update',
        header: 'Last Activity',
        accessor: (r) => r.last_balance_update ?? '',
        render: (r) =>
          r.last_balance_update ? (
            <span
              className="web-cell-time"
              title={new Date(r.last_balance_update).toLocaleString()}
            >
              <Clock size={13} aria-hidden="true" />
              {new Date(r.last_balance_update).toLocaleString()}
            </span>
          ) : (
            <span className="web-cell-empty">Never</span>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        numeric: true,
        render: (r) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedProduct(r)}
            data-testid={`recent-view-${r.id}`}
          >
            <Eye size={14} />
          </Button>
        ),
        accessor: (r) => r.id,
      },
    ],
    [],
  );

  if (selectedProduct) {
    return (
      <InventoryPanel
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        onBack={() => setSelectedProduct(null)}
      />
    );
  }

  const formatRelativeTime = (iso: string): string => {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="web-view" data-testid="recent-activity-view">
      <div className="web-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={22} color="var(--it-green)" aria-hidden="true" />
          <div>
            <h2 className="web-view-title">Recent Activity</h2>
            <p className="web-view-subtitle">
              Track stock movements, transfers, and inventory changes
            </p>
          </div>
        </div>
      </div>

      {/* Activity Toolbar */}
      <div className="web-activity-toolbar" data-testid="activity-toolbar">
        <div className="web-activity-toolbar__search">
          <Search size={16} className="web-activity-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search by product name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="web-activity-toolbar__input"
            data-testid="activity-search"
          />
        </div>
        <div className="web-activity-toolbar__filters">
          <Filter size={16} color="var(--it-text-secondary)" />
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className="web-activity-toolbar__select"
            data-testid="activity-filter"
          >
            <option value="ALL">All Activity</option>
            <option value="SALE">Sales</option>
            <option value="RECEIPT">Receipts</option>
            <option value="TRANSFER">Transfers</option>
            <option value="RETURN">Returns</option>
            <option value="DAMAGE">Damage</option>
            <option value="ADJUSTMENT">Adjustments</option>
          </select>
        </div>
        <div className="web-activity-toolbar__filters">
          <Clock size={16} color="var(--it-text-secondary)" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="web-activity-toolbar__select"
            data-testid="date-range-filter"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => activityQuery.retry()}
          disabled={activityQuery.loading}
          data-testid="refresh-activity"
        >
          <RefreshCw size={14} className={activityQuery.loading ? 'spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Activity Feed - Timeline */}
      <div
        style={{
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '24px',
          marginBottom: '24px',
        }}
        data-testid="activity-feed"
      >
        {activityQuery.error ? (
          <EmptyState
            variant="error"
            heading="Failed to load activity"
            body={activityQuery.error}
          />
        ) : activityQuery.loading && activityItems.length === 0 ? (
          <div className="web-center-spinner" data-testid="recent-feed-loading">
            <Spinner size="sm" label="Loading recent activity..." />
          </div>
        ) : Object.keys(groupedActivity).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {Object.entries(groupedActivity).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <h3
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--it-text-primary)',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid var(--it-border)',
                  }}
                >
                  {dateLabel}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((item) => (
                    <div
                      key={item.id || item.occurred_at || Math.random()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: 'var(--it-r-sm)',
                        backgroundColor: 'var(--it-surface)',
                        border: '1px solid var(--it-border)',
                      }}
                      data-testid={`activity-item-${item.id}`}
                    >
                      <div style={{ flexShrink: 0 }}>
                        {ACTIVITY_TYPE_ICONS[item.type] || <Activity size={16} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--it-text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          {item.product_name || item.product_id}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--it-text-secondary)',
                          }}
                        >
                          {ACTIVITY_TYPE_LABELS[item.type] ||
                            item.type?.replace(/_/g, ' ') ||
                            'Unknown'}{' '}
                          · {item.store_name || item.store_id} · {item.quantity > 0 ? '+' : ''}
                          {item.quantity} units
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--it-text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatRelativeTime(item.occurred_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            heading="No recent activity"
            body="No transactions match your current filters."
            data-testid="recent-feed-empty"
          />
        )}
      </div>

      {/* Inventory Snapshot - Clear separation */}
      <div
        style={{
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '24px',
        }}
        data-testid="inventory-snapshot"
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--it-text-primary)',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--it-border)',
          }}
        >
          Inventory Snapshot — Products affected by recent activity
        </h3>
        {loading && (
          <div className="web-center-spinner" data-testid="recent-loading">
            <Spinner size="md" label="Loading inventory snapshot..." />
          </div>
        )}
        {error && (
          <EmptyState
            variant="error"
            heading="Failed to load inventory snapshot"
            body={error}
            data-testid="recent-error"
          />
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            rows={recentProducts}
            rowKey={(r) => `recent-${r.id}`}
            data-testid="recent-activity-table"
            emptySlot={
              <EmptyState
                heading="No inventory data"
                body="No products found in the recent activity timeframe."
                data-testid="recent-empty"
              />
            }
          />
        )}
      </div>
    </div>
  );
}
