/**
 * Product inventory panel — per-store quantities + movement history.
 *
 * Rendered when a user clicks "View" on a catalogue row (web Products view)
 * or a recent-activity row. Previously embedded in the unified dashboard;
 * extracted as a standalone panel so both split views can reuse it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, Spinner, type ColumnDef } from '@invenTory/ui';
import {
  ArrowLeft,
  BarChart2,
  Clock,
  Package,
  Store,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getProductHistory, getProductInventory } from '../services/dashboardService';
import type { MovementHistoryRow, StoreInventoryRow } from '../types/dashboard';
import { formatRelativeTime, movementTypeBadge } from '../utils/formatters';

export interface InventoryPanelProps {
  productId: string;
  productName: string;
  onBack: () => void;
}

export function InventoryPanel({
  productId,
  productName,
  onBack,
}: InventoryPanelProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeRows, setStoreRows] = useState<StoreInventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<MovementHistoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProductInventory(productId)
      .then((data) => {
        if (!cancelled) {
          setStoreRows(data.stores);
          setTotal(data.total_quantity);
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
  }, [productId]);

  const loadHistory = useCallback((): void => {
    setHistoryLoading(true);
    setHistoryError(null);
    getProductHistory(productId)
      .then((data) => {
        setHistoryRows(data.rows);
      })
      .catch((err: unknown) => {
        setHistoryError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [productId]);

  useEffect(() => {
    if (activeTab === 'history' && historyRows.length === 0 && !historyLoading) {
      loadHistory();
    }
  }, [activeTab, historyRows.length, historyLoading, loadHistory]);

  const inventoryCols: ColumnDef<StoreInventoryRow>[] = [
    {
      key: 'store_name',
      header: 'Store',
      sortable: true,
      accessor: (r) => r.store_name,
      render: (r) => (
        <span className="web-cell-store">
          <Store size={14} aria-hidden="true" />
          {r.store_name}
          <span className="web-cell-code">{r.store_code}</span>
        </span>
      ),
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
      key: 'updated_at',
      header: 'Last Sync',
      accessor: (r) => r.updated_at,
      render: (r) => (
        <span className="web-cell-time" title={new Date(r.updated_at).toLocaleString()}>
          <Clock size={13} aria-hidden="true" />
          {formatRelativeTime(r.updated_at)}
        </span>
      ),
    },
  ];

  const historyCols: ColumnDef<MovementHistoryRow>[] = [
    {
      key: 'occurred_at',
      header: 'When',
      sortable: true,
      accessor: (r) => r.occurred_at,
      render: (r) => (
        <span className="web-cell-time" title={r.occurred_at}>
          {new Date(r.occurred_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'movement_type',
      header: 'Type',
      accessor: (r) => r.movement_type,
      render: (r) => <Badge status={movementTypeBadge(r.movement_type)} />,
    },
    {
      key: 'store_name',
      header: 'Store',
      sortable: true,
      accessor: (r) => r.store_name,
      render: (r) => (
        <span className="web-cell-store">
          <Store size={14} aria-hidden="true" />
          {r.store_name}
        </span>
      ),
    },
    {
      key: 'stock_bucket',
      header: 'Bucket',
      accessor: (r) => r.stock_bucket,
      render: (r) => <span className="web-cell-mono">{r.stock_bucket}</span>,
    },
    {
      key: 'quantity_delta',
      header: 'Δ Qty',
      numeric: true,
      sortable: true,
      accessor: (r) => r.quantity_delta,
      render: (r) => (
        <span
          className={`web-cell-delta ${r.quantity_delta > 0 ? 'web-cell-delta--pos' : 'web-cell-delta--neg'}`}
        >
          {r.quantity_delta > 0 ? (
            <TrendingUp size={13} aria-hidden="true" />
          ) : (
            <TrendingDown size={13} aria-hidden="true" />
          )}
          {r.quantity_delta > 0 ? `+${r.quantity_delta}` : r.quantity_delta}
        </span>
      ),
    },
    {
      key: 'reference_number',
      header: 'Reference',
      accessor: (r) => r.reference_number ?? '',
      render: (r) =>
        r.reference_number ? (
          <span className="web-cell-mono">{r.reference_number}</span>
        ) : (
          <span className="web-cell-empty">—</span>
        ),
    },
  ];

  return (
    <div className="web-inventory-panel" data-testid="inventory-panel">
      <div className="web-panel-header">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to catalogue
        </Button>
        <div className="web-panel-title-row">
          <Package size={20} color="var(--it-green)" aria-hidden="true" />
          <h2 className="web-panel-title">{productName}</h2>
        </div>
        {!loading && !error && (
          <div className="web-panel-total" data-testid="total-quantity">
            <span className="web-panel-total__label">Global Total</span>
            <span className="web-panel-total__value">{total.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="web-tab-bar" role="tablist">
        <button
          role="tab"
          className={`web-tab ${activeTab === 'inventory' ? 'web-tab--active' : ''}`}
          onClick={() => setActiveTab('inventory')}
          aria-selected={activeTab === 'inventory'}
          data-testid="tab-inventory"
        >
          <BarChart2 size={15} aria-hidden="true" /> Inventory by Store
        </button>
        <button
          role="tab"
          className={`web-tab ${activeTab === 'history' ? 'web-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
          aria-selected={activeTab === 'history'}
          data-testid="tab-history"
        >
          <Clock size={15} aria-hidden="true" /> Movement History
        </button>
      </div>

      {activeTab === 'inventory' && (
        <>
          {loading && (
            <div className="web-center-spinner">
              <Spinner size="md" />
            </div>
          )}
          {error && (
            <EmptyState
              variant="error"
              heading="Failed to load inventory"
              body={error}
              action={
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              }
            />
          )}
          {!loading && !error && (
            <DataTable
              columns={inventoryCols}
              rows={storeRows}
              rowKey={(r) => `${r.store_id}-${r.stock_bucket}`}
              data-testid="inventory-table"
              emptySlot={
                <EmptyState
                  heading="No stock recorded"
                  body="This product has no stock balance on any store."
                />
              }
            />
          )}
        </>
      )}

      {activeTab === 'history' && (
        <>
          {historyLoading && (
            <div className="web-center-spinner">
              <Spinner size="md" />
            </div>
          )}
          {historyError && (
            <EmptyState
              variant="error"
              heading="Failed to load history"
              body={historyError}
              action={
                <Button variant="primary" onClick={loadHistory}>
                  Retry
                </Button>
              }
            />
          )}
          {!historyLoading && !historyError && (
            <DataTable
              columns={historyCols}
              rows={historyRows}
              rowKey={(r) => r.transaction_id}
              data-testid="history-table"
              emptySlot={
                <EmptyState
                  heading="No movement history"
                  body="No transactions have been recorded for this product."
                />
              }
            />
          )}
        </>
      )}
    </div>
  );
}
