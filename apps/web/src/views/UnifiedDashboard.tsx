/**
 * Unified web dashboard — single-page interface combining
 * recent activity and the product catalog search.
 *
 * Layout:
 *   - Recent Activity: most recently synced products at the top
 *   - Product Catalog: full searchable catalogue as the primary feature
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SearchInput,
  Spinner,
  SummaryCard,
  type ColumnDef,
} from '@inven-tory/ui';
import {
  ArrowLeft,
  BarChart2,
  Clock,
  Package,
  Store,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  getProductHistory,
  getProductInventory,
  searchProducts,
} from '../services/dashboardService';
import type {
  MovementHistoryRow,
  ProductSearchResult,
  StoreInventoryRow,
} from '../types/dashboard';
import { formatRelativeTime, movementTypeBadge } from '../utils/formatters';

const RECENT_LIMIT = 8;
const CATALOG_LIMIT = 200;

// ---------------------------------------------------------------------------
// Inventory panel sub-view (reused from SearchView)
// ---------------------------------------------------------------------------

interface InventoryPanelProps {
  productId: string;
  productName: string;
  onBack: () => void;
}

function InventoryPanel({
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

// ---------------------------------------------------------------------------
// Main unified dashboard
// ---------------------------------------------------------------------------

interface UnifiedDashboardProps {
  onNavigateToStores: () => void;
  onNavigateToUsers: () => void;
}

export function UnifiedDashboard({
  onNavigateToStores: _onNavigateToStores,
  onNavigateToUsers: _onNavigateToUsers,
}: UnifiedDashboardProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<ProductSearchResult[]>([]);
  const [recentProducts, setRecentProducts] = useState<ProductSearchResult[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    searchProducts('', CATALOG_LIMIT)
      .then((data) => {
        if (!cancelled) {
          setAllResults(data.results);
          const sorted = [...data.results].sort((a, b) => {
            const aTime = a.last_balance_update ? new Date(a.last_balance_update).getTime() : 0;
            const bTime = b.last_balance_update ? new Date(b.last_balance_update).getTime() : 0;
            return bTime - aTime;
          });
          setRecentProducts(sorted.slice(0, RECENT_LIMIT));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
          setRecentLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const filteredResults = useMemo(() => {
    if (!query.trim()) return allResults;
    const term = query.toLowerCase();
    return allResults.filter((r) => {
      return (
        r.name.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        (r.brand ?? '').toLowerCase().includes(term) ||
        (r.model ?? '').toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term)
      );
    });
  }, [allResults, query]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim()) {
      debounceRef.current = setTimeout(() => {
        searchProducts(val.trim(), CATALOG_LIMIT)
          .then((data) => setAllResults(data.results))
          .catch(() => undefined);
      }, 500);
    } else {
      debounceRef.current = setTimeout(() => {
        searchProducts('', CATALOG_LIMIT)
          .then((data) => setAllResults(data.results))
          .catch(() => undefined);
      }, 500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchProducts(query.trim(), CATALOG_LIMIT)
        .then((data) => setAllResults(data.results))
        .catch(() => undefined);
    }
  };

  useEffect(() => {
    return (): void => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (selectedProduct) {
    return (
      <InventoryPanel
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        onBack={() => setSelectedProduct(null)}
      />
    );
  }

  const catalogueCols: ColumnDef<ProductSearchResult>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      accessor: (r) => r.name,
      render: (r) => (
        <span className="web-cell-product">
          <span className="web-cell-product__name">{r.name}</span>
          {r.brand && <span className="web-cell-secondary">{r.brand}</span>}
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      accessor: (r) => r.sku,
      render: (r) => <span className="web-cell-mono">{r.sku}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      accessor: (r) => r.category,
    },
    {
      key: 'total_quantity',
      header: 'Stock (Avail.)',
      numeric: true,
      sortable: true,
      accessor: (r) => r.total_quantity ?? 0,
      render: (r): React.ReactElement => {
        const qty = r.total_quantity ?? 0;
        return (
          <span
            style={{
              fontWeight: 600,
              fontFamily: 'var(--it-font-mono)',
              color: qty > 0 ? 'var(--it-green-text)' : 'var(--it-text-secondary)',
            }}
          >
            {qty.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'last_balance_update',
      header: 'Last Synced',
      accessor: (r) => r.last_balance_update ?? '',
      render: (r) =>
        r.last_balance_update ? (
          <span className="web-cell-time" title={new Date(r.last_balance_update).toLocaleString()}>
            <Clock size={13} aria-hidden="true" />
            {new Date(r.last_balance_update).toLocaleString()}
          </span>
        ) : (
          <span
            className="web-cell-empty"
            style={{ color: 'var(--it-text-secondary)', fontSize: '12px' }}
          >
            Not yet synced
          </span>
        ),
    },
    {
      key: 'is_active',
      header: 'Status',
      accessor: (r) => (r.is_active ? 'Active' : 'Inactive'),
      render: (r) => <Badge status={r.is_active ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: 'Detail',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedProduct(r)}
          data-testid={`view-product-${r.id}`}
        >
          View
        </Button>
      ),
    },
  ];

  const recentCols: ColumnDef<ProductSearchResult>[] = [
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
          <span className="web-cell-time" title={new Date(r.last_balance_update).toLocaleString()}>
            <Clock size={13} aria-hidden="true" />
            {formatRelativeTime(r.last_balance_update)}
          </span>
        ) : (
          <span className="web-cell-empty">Never</span>
        ),
    },
    {
      key: 'actions',
      header: '',
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
    },
  ];

  return (
    <div className="web-view" data-testid="unified-dashboard">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <Package size={18} aria-hidden="true" /> Product Catalogue
          </h2>
          <p className="web-view-subtitle">
            Full product catalogue with stock levels and last sync time. Search by name, SKU, brand,
            model or category.
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: '24px' }}>
        <SummaryCard
          title="Recent Activity"
          titleIcon={<Clock size={18} />}
          headerAction={recentLoading ? <Spinner size="sm" label="Loading…" /> : undefined}
        >
          {recentProducts.length === 0 && !recentLoading ? (
            <EmptyState
              heading="No recent activity"
              body="Synced stock movements will appear here."
            />
          ) : (
            <DataTable
              columns={recentCols}
              rows={recentProducts}
              rowKey={(r) => `recent-${r.id}`}
              data-testid="recent-activity-table"
            />
          )}
        </SummaryCard>
      </div>

      {/* Product Search Bar */}
      <div className="web-search-bar" data-testid="search-bar" style={{ marginBottom: '16px' }}>
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, SKU, brand, model or category…"
          aria-label="Search products"
          data-testid="search-input"
        />
      </div>

      {catalogError && (
        <div className="it-toast it-toast--error web-search-error" role="alert">
          {catalogError}
        </div>
      )}

      {catalogLoading && (
        <div className="web-center-spinner" style={{ padding: '48px 0' }}>
          <Spinner size="md" label="Loading catalogue…" />
        </div>
      )}

      {!catalogLoading && !catalogError && (
        <SummaryCard
          title={
            query.trim()
              ? `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'} for "${query}"`
              : `${filteredResults.length} product${filteredResults.length === 1 ? '' : 's'} in catalogue`
          }
          titleIcon={<Package size={18} />}
        >
          <DataTable
            columns={catalogueCols}
            rows={filteredResults}
            rowKey={(r) => r.id}
            data-testid="search-results-table"
            emptySlot={
              query.trim() ? (
                <EmptyState
                  heading="No products found"
                  body={`No products matched "${query}". Try a different term.`}
                />
              ) : (
                <EmptyState
                  heading="No products in catalogue"
                  body="No products have been synced to the server yet."
                />
              )
            }
          />
        </SummaryCard>
      )}
    </div>
  );
}
