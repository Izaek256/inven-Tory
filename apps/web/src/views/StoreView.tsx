/**
 * Store-level inventory view — Section 14.1 mockup (v1.0.0 scope).
 *
 * Shows all stores with their freshness badge and total quantity.
 * Clicking [VIEW] drills into a store's full product inventory.
 *
 * Notification / PO widgets are explicitly v1.1.0 (Issues 21/22) — not included.
 *
 * Features: N+1 fix via batch endpoint (getStoresInventoryBulk),
 * optimistic updates, and proper loading states.
 */

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Skeleton,
  StatCard,
  SummaryCard,
  type ColumnDef,
} from '@invenTory/ui';
import { ArrowLeft, Clock, Package, RefreshCw, Store, Warehouse } from 'lucide-react';
import { getStoreInventory, getStoresInventoryBulk } from '../services/dashboardService';
import type { FreshnessStatus, StoreInventoryResponse, StoreProductRow } from '../types/dashboard';
import { formatRelativeTime } from '../utils/formatters';

function FreshnessBadge({ freshness }: { freshness: FreshnessStatus }): React.ReactElement {
  return <Badge status={freshness === 'VERY_STALE' ? 'VERY_STALE' : freshness} />;
}

interface StorePanelProps {
  storeId: string;
  onBack: () => void;
}

function StorePanel({ storeId, onBack }: StorePanelProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StoreInventoryResponse | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getStoreInventory(storeId)
      .then((d) => setData(d))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const productCols: ColumnDef<StoreProductRow>[] = [
    {
      key: 'product_name',
      header: 'Product',
      sortable: true,
      accessor: (r) => r.product_name,
      render: (r) => (
        <span className="web-cell-product">
          <span className="web-cell-product__name">{r.product_name}</span>
          <span
            className="web-cell-mono"
            style={{ fontSize: 11, color: 'var(--it-text-disabled)' }}
          >
            {r.product_sku}
          </span>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      accessor: (r) => r.category,
    },
    {
      key: 'stock_bucket',
      header: 'Bucket',
      accessor: (r) => r.stock_bucket,
      render: (r) => <span className="web-cell-mono">{r.stock_bucket}</span>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      numeric: true,
      sortable: true,
      accessor: (r) => r.quantity,
    },
    {
      key: 'unit',
      header: 'Unit',
      accessor: (r) => r.unit,
      render: (r) => <span className="web-cell-secondary">{r.unit}</span>,
    },
    {
      key: 'balance_updated_at',
      header: 'Balance Updated',
      accessor: (r) => r.balance_updated_at,
      render: (r) => (
        <span className="web-cell-time" title={r.balance_updated_at}>
          <Clock size={13} aria-hidden="true" />
          {formatRelativeTime(r.balance_updated_at)}
        </span>
      ),
    },
  ];

  const skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  return (
    <div className="web-store-panel" data-testid="store-panel">
      <div className="web-panel-header">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-to-stores-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          All Stores
        </Button>

        {data && (
          <>
            <div className="web-panel-title-row">
              <Store size={20} color="var(--it-green)" aria-hidden="true" />
              <h2 className="web-panel-title">{data.store_name}</h2>
              <span className="web-panel-code">{data.store_code}</span>
              <FreshnessBadge freshness={data.freshness} />
            </div>

            <div className="web-panel-sync-row" data-testid="store-last-sync">
              <Clock size={14} aria-hidden="true" />
              {data.last_sync_at
                ? `Last sync: ${formatRelativeTime(data.last_sync_at)}`
                : 'Never synced'}
            </div>

            <div className="web-stat-row">
              <StatCard label="Products" value={data.total_products} valueColour="default" />
              <StatCard
                label="Total Units"
                value={data.total_quantity.toLocaleString()}
                valueColour="green"
              />
              <StatCard
                label="Sync Status"
                value={data.freshness.replace('_', ' ')}
                valueColour={
                  data.freshness === 'FRESH'
                    ? 'green'
                    : data.freshness === 'RECENT'
                      ? 'accent'
                      : data.freshness === 'STALE'
                        ? 'amber'
                        : 'red'
                }
              />
            </div>
          </>
        )}
      </div>

      {loading && (
        <div className="web-skeleton-list">
          {skeletonRows.map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      )}

      {error && (
        <EmptyState
          variant="error"
          heading="Failed to load store inventory"
          body={error}
          action={
            <Button variant="primary" onClick={load}>
              Retry
            </Button>
          }
        />
      )}

      {!loading && !error && data && (
        <DataTable
          columns={productCols}
          rows={data.products}
          rowKey={(r) => `${r.product_id}-${r.stock_bucket}`}
          data-testid="store-products-table"
          emptySlot={
            <EmptyState
              heading="No products in stock"
              body="No stock balances recorded for this store."
            />
          }
        />
      )}
    </div>
  );
}

interface StoreListItem {
  storeId: string;
  storeCode: string;
  storeName: string;
  freshness: FreshnessStatus;
  lastSyncAt: string | null;
  totalQuantity: number;
  totalProducts: number;
}

export function StoreView({
  storeIds,
  loading: externalLoading,
  onRefresh,
}: StoreViewProps): React.ReactElement {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [storeData, setStoreData] = useState<Map<string, StoreListItem>>(new Map());
  const [batchLoading, setBatchLoading] = useState(false);
  const [isPending] = useTransition();

  const loadAllStores = useCallback(
    async (storeIdsToLoad: string[], optimistic?: Map<string, StoreListItem>) => {
      setBatchLoading(true);
      try {
        const data = await getStoresInventoryBulk(storeIdsToLoad);
        const newMap = new Map<string, StoreListItem>();
        for (const d of data) {
          const item: StoreListItem = {
            storeId: d.store_id,
            storeCode: d.store_code,
            storeName: d.store_name,
            freshness: d.freshness,
            lastSyncAt: d.last_sync_at,
            totalQuantity: d.total_quantity,
            totalProducts: d.total_products,
          };
          newMap.set(item.storeId, item);
        }
        if (optimistic) {
          for (const [id, item] of optimistic) {
            if (!newMap.has(id)) {
              newMap.set(id, item);
            }
          }
        }
        setStoreData(newMap);
      } catch {
        // Fall back to per-store fetching on batch failure
        for (const id of storeIdsToLoad) {
          getStoreInventory(id)
            .then((d) => {
              const item: StoreListItem = {
                storeId: d.store_id,
                storeCode: d.store_code,
                storeName: d.store_name,
                freshness: d.freshness,
                lastSyncAt: d.last_sync_at,
                totalQuantity: d.total_quantity,
                totalProducts: d.total_products,
              };
              setStoreData((prev) => new Map(prev).set(id, item));
            })
            .catch(() => {
              const placeholder: StoreListItem = {
                storeId: id,
                storeCode: '???',
                storeName: id,
                freshness: 'VERY_STALE',
                lastSyncAt: null,
                totalQuantity: 0,
                totalProducts: 0,
              };
              setStoreData((prev) => new Map(prev).set(id, placeholder));
            });
        }
      } finally {
        setBatchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (storeIds.length === 0) return;
    const unknownIds = storeIds.filter((id) => !storeData.has(id));
    if (unknownIds.length === 0) return;
    loadAllStores(unknownIds);
  }, [storeIds, loadAllStores]);

  const handleRefresh = useCallback(() => {
    if (storeIds.length === 0) return;
    const optimistic = new Map(storeData);
    setStoreData(new Map());
    loadAllStores(storeIds, optimistic);
    onRefresh();
  }, [storeIds, storeData, loadAllStores, onRefresh]);

  if (selectedStoreId) {
    return <StorePanel storeId={selectedStoreId} onBack={() => setSelectedStoreId(null)} />;
  }

  const rows = storeIds.map((id) => storeData.get(id)).filter(Boolean) as StoreListItem[];
  const isFetching = batchLoading || externalLoading || isPending;

  const staleCount = rows.filter(
    (r) => r.freshness === 'STALE' || r.freshness === 'VERY_STALE',
  ).length;

  const storeCols: ColumnDef<StoreListItem>[] = [
    {
      key: 'storeName',
      header: 'Store',
      sortable: true,
      accessor: (r) => r.storeName,
      render: (r) => (
        <span className="web-cell-store">
          <Store size={14} aria-hidden="true" />
          {r.storeName}
          <span className="web-cell-code">{r.storeCode}</span>
        </span>
      ),
    },
    {
      key: 'totalQuantity',
      header: 'Total Stock',
      numeric: true,
      sortable: true,
      accessor: (r) => r.totalQuantity,
      render: (r) => (
        <span className="web-cell-qty">
          {r.totalQuantity.toLocaleString()} {r.totalQuantity === 1 ? 'unit' : 'units'}
        </span>
      ),
    },
    {
      key: 'totalProducts',
      header: 'Products',
      numeric: true,
      sortable: true,
      accessor: (r) => r.totalProducts,
    },
    {
      key: 'lastSyncAt',
      header: 'Last Sync',
      accessor: (r) => r.lastSyncAt ?? '',
      render: (r) => (
        <span className="web-cell-time" title={r.lastSyncAt ?? 'Never'}>
          <Clock size={13} aria-hidden="true" />
          {r.lastSyncAt ? formatRelativeTime(r.lastSyncAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'freshness',
      header: 'Freshness',
      accessor: (r) => r.freshness,
      render: (r) => (
        <span data-testid={`freshness-${r.storeId}`}>
          <FreshnessBadge freshness={r.freshness} />
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedStoreId(r.storeId)}
          data-testid={`view-store-${r.storeId}`}
        >
          View
        </Button>
      ),
    },
  ];

  const skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  return (
    <div className="web-view" data-testid="store-view">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <Warehouse size={18} aria-hidden="true" /> Store Inventory
          </h2>
          <p className="web-view-subtitle">
            Per-store stock totals, freshness status, and last-sync time (Section 14.1)
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="refresh-stores-btn"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="web-stat-row" style={{ marginBottom: '16px' }}>
        <StatCard label="Stores" value={externalLoading || batchLoading ? '…' : storeIds.length} />
        <StatCard label="Loaded" value={isFetching ? '…' : rows.length} valueColour="green" />
        <StatCard
          label="Stale / Very Stale"
          value={isFetching ? '…' : staleCount}
          valueColour={staleCount > 0 ? 'red' : 'green'}
        />
      </div>

      {(isFetching || batchLoading) && rows.length === 0 && (
        <div className="web-skeleton-list">
          {skeletonRows.map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      )}

      {!externalLoading && storeIds.length === 0 && (
        <EmptyState
          icon={<Package size={24} />}
          heading="No stores found"
          body="No active stores are registered. Sync a device or add a store."
        />
      )}

      {rows.length > 0 && (
        <SummaryCard
          title="Registered Stores"
          titleIcon={<Store size={18} />}
          headerAction={isFetching ? <Skeleton height={20} width={80} /> : undefined}
        >
          <DataTable
            columns={storeCols}
            rows={rows}
            rowKey={(r) => r.storeId}
            data-testid="stores-table"
          />
        </SummaryCard>
      )}
    </div>
  );
}

interface StoreViewProps {
  storeIds: string[];
  loading: boolean;
  onRefresh: () => void;
}
