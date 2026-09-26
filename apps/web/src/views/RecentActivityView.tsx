/**
 * Stock Movements view — tabular, dashboard-themed, no inventory snapshot.
 * Title aligns with nav label "Stock Movements".
 */
import React, { useMemo, useState } from 'react';
import { Activity, Clock, Search, Filter, RefreshCw } from 'lucide-react';
import { Button, EmptyState, SkeletonTable } from '@invenTory/ui';
import { getRecentActivity } from '../services/dashboardService';
import { useQuery } from '@tanstack/react-query';
import type { RecentActivityResponse } from '../types/dashboard';
import { RecentActivityList } from '../components/RecentActivityList';

const RECENT_LIMIT = 50;

export function RecentActivityView({
  globalSearch,
}: {
  globalSearch?: string;
}): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState<string>(globalSearch ?? '');
  const [activityFilter, setActivityFilter] = useState<string>('ALL');

  React.useEffect(() => {
    if (globalSearch !== undefined) setSearchQuery(globalSearch);
  }, [globalSearch]);

  const activityQuery = useQuery<RecentActivityResponse>({
    queryKey: ['recentActivity', RECENT_LIMIT],
    queryFn: () => getRecentActivity(RECENT_LIMIT),
  });
  const activityItems = useMemo(() => activityQuery.data?.data ?? [], [activityQuery.data?.data]);

  const filteredActivity = useMemo(() => {
    return activityItems.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.store_name?.toLowerCase().includes(searchQuery.toLowerCase());
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

  return (
    <div className="web-view" data-testid="recent-activity-view">
      <div className="prod-header" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 0,
              background: 'var(--it-amber-surface)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-amber-text)',
            }}
          >
            <Activity size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="prod-header__title">Stock Movements</h2>
            <p className="prod-header__subtitle">
              Track stock movements, transfers, and inventory changes
            </p>
          </div>
        </div>
      </div>

      <div className="prod-filters" data-testid="activity-toolbar" style={{ marginBottom: 14 }}>
        <div className="prod-filters__search" style={{ flex: 1 }}>
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by product name, ID or store..."
            value={searchQuery}
            onChange={(e): void => setSearchQuery(e.target.value)}
            data-testid="activity-search"
            aria-label="Search stock movements"
            style={{
              width: '100%',
              height: 36,
              padding: '0 12px 0 34px',
              border: '1px solid var(--it-border-strong)',
              background: 'var(--it-surface)',
              borderRadius: 0,
              fontSize: 13,
              fontFamily: 'var(--it-font-mono)',
            }}
          />
        </div>
        <Filter size={16} color="var(--it-text-secondary)" aria-hidden="true" />
        <select
          value={activityFilter}
          onChange={(e): void => setActivityFilter(e.target.value)}
          className="prod-select"
          data-testid="activity-filter"
          aria-label="Activity filter"
        >
          <option value="ALL">All Activity</option>
          <option value="SALE">Sales</option>
          <option value="RECEIPT">Receipts</option>
          <option value="TRANSFER">Transfers</option>
          <option value="RETURN">Returns</option>
          <option value="DAMAGE">Damage</option>
          <option value="ADJUSTMENT">Adjustments</option>
        </select>
        <Button
          variant="secondary"
          size="sm"
          onClick={(): void => {
            void activityQuery.refetch();
          }}
          disabled={activityQuery.isLoading || activityQuery.isFetching}
          data-testid="refresh-activity"
          type="button"
        >
          <RefreshCw
            size={14}
            className={activityQuery.isLoading || activityQuery.isFetching ? 'spin' : ''}
            aria-hidden="true"
          />{' '}
          Refresh
        </Button>
      </div>

      <div
        className="dash-panel"
        data-testid="activity-feed"
        style={{ padding: 0, overflow: 'hidden' }}
      >
        {activityQuery.error ? (
          <div style={{ padding: 24 }}>
            <EmptyState
              variant="error"
              heading="Failed to load activity"
              body={
                activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : String(activityQuery.error)
              }
            />
          </div>
        ) : (activityQuery.isLoading || activityQuery.isFetching) && activityItems.length === 0 ? (
          <div
            className="web-center-spinner"
            data-testid="recent-feed-loading"
            style={{ padding: 24 }}
          >
            <SkeletonTable rows={10} columns={4} />
          </div>
        ) : filteredActivity.length > 0 ? (
          <RecentActivityList items={filteredActivity} />
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState
              heading="No recent activity"
              body="No transactions match your current filters."
              data-testid="recent-feed-empty"
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
          fontSize: 12,
          color: 'var(--it-text-secondary)',
        }}
      >
        <Clock size={14} aria-hidden="true" /> Last 50 movements
      </div>
    </div>
  );
}
