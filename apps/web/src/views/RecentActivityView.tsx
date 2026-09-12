/**
 * Recent Activity view - dedicated page.
 *
 * Shares its row rendering with the dashboard preview panel via
 * `RecentActivityList` (single underlying row component), so the format
 * `product name / {action} · {store} · {±units} / relative time`
 * can never drift between the two surfaces. The table variant from Phase 3
 * (Product | Stock | Last Sync | View) is preserved below the feed as the
 * per-product drill-down ("View" opens the InventoryPanel).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, Spinner, type ColumnDef } from '@invenTory/ui';
import { Activity, Clock } from 'lucide-react';
import { getRecentActivity, searchProducts } from '../services/dashboardService';
import { useResistantQuery } from '../hooks/useResistantQuery';
import type { ProductSearchResult, RecentActivityResponse } from '../types/dashboard';
import { InventoryPanel } from '../components/InventoryPanel';
import { RecentActivityList } from '../components/RecentActivityList';

const RECENT_LIMIT = 20;

export function RecentActivityView(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentProducts, setRecentProducts] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const activityQuery = useResistantQuery<RecentActivityResponse>(
    () => getRecentActivity(RECENT_LIMIT),
    [],
  );
  const activityItems = activityQuery.data?.data ?? [];

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
        header: 'Stock',
        numeric: true,
        accessor: (r) => r.total_quantity ?? 0,
        render: (r) => (
          <span className="web-cell-mono">{(r.total_quantity ?? 0).toLocaleString()}</span>
        ),
      },
      {
        key: 'last_balance_update',
        header: 'Last Sync',
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
            View
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

  return (
    <div className="web-view" data-testid="recent-activity-view">
      <div className="web-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={22} color="var(--it-green)" aria-hidden="true" />
          <div>
            <h2 className="web-view-title">Recent Activity</h2>
            <p className="web-view-subtitle">Latest stock movements across all stores</p>
          </div>
        </div>
      </div>

      <div className="web-dashboard-preview" data-testid="recent-activity-feed">
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
        ) : activityItems.length > 0 ? (
          <RecentActivityList items={activityItems} />
        ) : (
          <EmptyState
            heading="No recent activity"
            body="Stock movements will appear here."
            data-testid="recent-feed-empty"
          />
        )}
      </div>

      {loading && (
        <div className="web-center-spinner" data-testid="recent-loading">
          <Spinner size="md" label="Loading recent activity..." />
        </div>
      )}

      {error && (
        <EmptyState
          variant="error"
          heading="Failed to load recent activity"
          body={error}
          data-testid="recent-error"
        />
      )}

      {!loading && !error && (
        <div
          style={{
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            backgroundColor: 'var(--it-card)',
            overflow: 'hidden',
          }}
        >
          <DataTable
            columns={columns}
            rows={recentProducts}
            rowKey={(r) => `recent-${r.id}`}
            data-testid="recent-activity-table"
            emptySlot={
              <EmptyState
                heading="No recent activity"
                body="Synced stock movements will appear here."
                data-testid="recent-empty"
              />
            }
          />
        </div>
      )}
    </div>
  );
}
