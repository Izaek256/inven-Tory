/**
 * Global product search view — FR-SRCH-001–004.
 *
 * Shows a search bar (FR-SRCH-001).  On selecting a result:
 *   - Per-store quantity breakdown + global total (FR-SRCH-002/003)
 *   - Movement history (FR-SRCH-004)
 *   - Last-sync timestamp for each store (FR-SRCH-005, via balance updated_at)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Hash,
  Package,
  Search,
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

// ---------------------------------------------------------------------------
// Sub-views
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
      header: 'Balance Updated',
      accessor: (r) => r.updated_at,
      render: (r) => (
        <span className="web-cell-time" title={r.updated_at}>
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
          Back to results
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
// Main search view
// ---------------------------------------------------------------------------

export function SearchView(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ProductSearchResult[] | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string): void => {
    if (!q.trim()) {
      setResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    searchProducts(q.trim())
      .then((data) => {
        setResults(data.results);
      })
      .catch((err: unknown) => {
        setSearchError(err instanceof Error ? err.message : String(err));
        setResults(null);
      })
      .finally(() => setSearching(false));
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      runSearch(query);
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

  const searchCols: ColumnDef<ProductSearchResult>[] = [
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
      render: (r) => (
        <span
          className="web-cell-mono"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <Hash size={12} aria-hidden="true" />
          {r.sku}
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

  return (
    <div className="web-view" data-testid="search-view">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <Search size={18} aria-hidden="true" /> Global Product Search
          </h2>
          <p className="web-view-subtitle">
            Search by name, SKU, barcode, brand, model or alternate name (FR-SRCH-001)
          </p>
        </div>
      </div>

      <div className="web-search-bar" data-testid="search-bar">
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type product name, SKU, barcode…"
          aria-label="Search products"
          data-testid="search-input"
        />
        {searching && (
          <div className="web-search-spinner">
            <Spinner size="sm" label="Searching…" />
          </div>
        )}
      </div>

      {searchError && (
        <div className="it-toast it-toast--error web-search-error" role="alert">
          {searchError}
        </div>
      )}

      {results === null && !searching && !searchError && (
        <EmptyState
          icon={<Search size={24} />}
          heading="Search products"
          body="Enter a product name, SKU, barcode, brand or model to see global stock quantities."
        />
      )}

      {results !== null && results.length === 0 && !searching && (
        <EmptyState
          heading="No products found"
          body={`No products matched "${query}". Try a different term.`}
        />
      )}

      {results !== null && results.length > 0 && (
        <SummaryCard
          title={`${results.length} result${results.length === 1 ? '' : 's'} for "${query}"`}
          titleIcon={<Package size={18} />}
        >
          <DataTable
            columns={searchCols}
            rows={results}
            rowKey={(r) => r.id}
            data-testid="search-results-table"
          />
        </SummaryCard>
      )}
    </div>
  );
}
