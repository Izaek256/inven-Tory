/**
 * Product Catalogue view — FR-SRCH-001–005.
 *
 * Server-side search with pagination. Debounced server-side search (300ms).
 * Virtual scrolling concept: max 100 rows with pagination controls.
 * useTransition for non-urgent search input updates.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SearchInput,
  Skeleton,
  SummaryCard,
} from '@invenTory/ui';
import type { ColumnDef } from '@invenTory/ui';
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
  searchProductsServer,
} from '../services/dashboardService';
import type {
  MovementHistoryRow,
  ProductSearchResult,
  StoreInventoryRow,
} from '../types/dashboard';
import { formatRelativeTime, movementTypeBadge } from '../utils/formatters';

const PAGE_SIZE = 50;
const MAX_VISIBLE_ROWS = 100;

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

  const inventoryCols = useMemo<ColumnDef<StoreInventoryRow>[]>(
    () => [
      {
        key: 'store_name',
        header: 'Store',
        sortable: true,
        accessor: (r: StoreInventoryRow) => r.store_name,
        render: (r: StoreInventoryRow) => (
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
        accessor: (r: StoreInventoryRow) => r.stock_bucket,
        render: (r: StoreInventoryRow) => <span className="web-cell-mono">{r.stock_bucket}</span>,
      },
      {
        key: 'quantity',
        header: 'Qty',
        numeric: true,
        sortable: true,
        accessor: (r: StoreInventoryRow) => r.quantity,
      },
      {
        key: 'updated_at',
        header: 'Last Sync',
        accessor: (r: StoreInventoryRow) => r.updated_at,
        render: (r: StoreInventoryRow) => (
          <span className="web-cell-time" title={new Date(r.updated_at).toLocaleString()}>
            <Clock size={13} aria-hidden="true" />
            {formatRelativeTime(r.updated_at)}
          </span>
        ),
      },
    ],
    [],
  );

  const historyCols = useMemo<ColumnDef<MovementHistoryRow>[]>(
    () => [
      {
        key: 'occurred_at',
        header: 'When',
        sortable: true,
        accessor: (r: MovementHistoryRow) => r.occurred_at,
        render: (r: MovementHistoryRow) => (
          <span className="web-cell-time" title={r.occurred_at}>
            {new Date(r.occurred_at).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'movement_type',
        header: 'Type',
        accessor: (r: MovementHistoryRow) => r.movement_type,
        render: (r: MovementHistoryRow) => <Badge status={movementTypeBadge(r.movement_type)} />,
      },
      {
        key: 'store_name',
        header: 'Store',
        sortable: true,
        accessor: (r: MovementHistoryRow) => r.store_name,
        render: (r: MovementHistoryRow) => (
          <span className="web-cell-store">
            <Store size={14} aria-hidden="true" />
            {r.store_name}
          </span>
        ),
      },
      {
        key: 'stock_bucket',
        header: 'Bucket',
        accessor: (r: MovementHistoryRow) => r.stock_bucket,
        render: (r: MovementHistoryRow) => <span className="web-cell-mono">{r.stock_bucket}</span>,
      },
      {
        key: 'quantity_delta',
        header: 'Δ Qty',
        numeric: true,
        sortable: true,
        accessor: (r: MovementHistoryRow) => r.quantity_delta,
        render: (r: MovementHistoryRow) => (
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
        accessor: (r: MovementHistoryRow) => r.reference_number ?? '',
        render: (r: MovementHistoryRow) =>
          r.reference_number ? (
            <span className="web-cell-mono">{r.reference_number}</span>
          ) : (
            <span className="web-cell-empty">—</span>
          ),
      },
    ],
    [],
  );

  const skeletonRows = Array.from({ length: 5 }, (_, i) => i);

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
            <div className="web-skeleton-list">
              {skeletonRows.map((i) => (
                <Skeleton key={i} height={48} />
              ))}
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
            <div className="web-skeleton-list">
              {skeletonRows.map((i) => (
                <Skeleton key={i} height={48} />
              ))}
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
// Main catalogue / search view
// ---------------------------------------------------------------------------

export function SearchView(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = loading || isPending;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    searchProductsServer('', 1, PAGE_SIZE)
      .then((data) => {
        if (!cancelled) {
          setResults(data.results);
          setTotalResults(data.total);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setSearchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setQuery(val);
    startTransition(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (val.trim()) {
        debounceRef.current = setTimeout(() => {
          searchProductsServer(val.trim(), 1, PAGE_SIZE)
            .then((data) => {
              setResults(data.results);
              setTotalResults(data.total);
              setPage(1);
            })
            .catch(() => undefined);
        }, 300);
      } else {
        debounceRef.current = setTimeout(() => {
          searchProductsServer('', 1, PAGE_SIZE)
            .then((data) => {
              setResults(data.results);
              setTotalResults(data.total);
              setPage(1);
            })
            .catch(() => undefined);
        }, 300);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchProductsServer(query.trim(), 1, PAGE_SIZE)
        .then((data) => {
          setResults(data.results);
          setTotalResults(data.total);
        })
        .catch(() => undefined);
    }
  };

  const handlePageChange = (newPage: number): void => {
    setPage(newPage);
    searchProductsServer(query.trim(), newPage, PAGE_SIZE)
      .then((data) => {
        setResults(data.results);
        setTotalResults(data.total);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    return (): void => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const displayedResults = results.slice(0, MAX_VISIBLE_ROWS);
  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  const catalogueCols = useMemo<ColumnDef<ProductSearchResult>[]>(
    () => [
      {
        key: 'name',
        header: 'Product',
        sortable: true,
        accessor: (r: ProductSearchResult) => r.name,
        render: (r: ProductSearchResult) => (
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
        accessor: (r: ProductSearchResult) => r.sku,
        render: (r: ProductSearchResult) => <span className="web-cell-mono">{r.sku}</span>,
      },
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        accessor: (r: ProductSearchResult) => r.category,
      },
      {
        key: 'total_quantity',
        header: 'Stock (Avail.)',
        numeric: true,
        sortable: true,
        accessor: (r: ProductSearchResult) => r.total_quantity ?? 0,
        render: (r: ProductSearchResult): React.ReactElement => {
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
        accessor: (r: ProductSearchResult) => r.last_balance_update ?? '',
        render: (r: ProductSearchResult) =>
          r.last_balance_update ? (
            <span
              className="web-cell-time"
              title={new Date(r.last_balance_update).toLocaleString()}
            >
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
        accessor: (r: ProductSearchResult) => (r.is_active ? 'Active' : 'Inactive'),
        render: (r: ProductSearchResult) => <Badge status={r.is_active ? 'ACTIVE' : 'INACTIVE'} />,
      },
      {
        key: 'actions',
        header: 'Detail',
        render: (r: ProductSearchResult) => (
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
    ],
    [],
  );

  const skeletonRows = Array.from({ length: 8 }, (_, i) => i);

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
    <div className="web-view" data-testid="search-view">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <Package size={18} aria-hidden="true" /> Product Catalogue
          </h2>
          <p className="web-view-subtitle">
            Server-side search with pagination. Search by name, SKU, brand, model or category.
          </p>
        </div>
      </div>

      <div className="web-search-bar" data-testid="search-bar">
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, SKU, brand, model or category…"
          aria-label="Search products"
          data-testid="search-input"
        />
      </div>

      {searchError && (
        <div className="it-toast it-toast--error web-search-error" role="alert">
          {searchError}
        </div>
      )}

      {isLoading && (
        <div className="web-skeleton-list" data-testid="search-skeleton">
          {skeletonRows.map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </div>
      )}

      {!isLoading && !searchError && (
        <>
          <SummaryCard
            title={
              query.trim()
                ? `${totalResults} result${totalResults === 1 ? '' : 's'} for "${query}"`
                : `${totalResults} product${totalResults === 1 ? '' : 's'} in catalogue`
            }
            titleIcon={<Package size={18} />}
          >
            <DataTable
              columns={catalogueCols}
              rows={displayedResults}
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

          {totalPages > 1 && (
            <div className="web-pagination" data-testid="pagination">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                data-testid="prev-page"
              >
                Previous
              </Button>
              <span className="web-pagination-info">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                data-testid="next-page"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
