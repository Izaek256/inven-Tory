/**
 * Web Products view — global (all-stores) product catalogue.
 *
 * Primary table is the cross-store distribution breakdown (Phase 3, Task D):
 *   Product Name | Model | SKU | <Store 1> Qty | ... | <Store N> Qty | Total
 *
 * One dynamic column per store that exists in the system, plus the computed
 * Total. Stores with no stock for a product render a dash, never an empty
 * or broken row. This view is global — it is NOT scoped to a single store.
 * Writes stay store-scoped elsewhere; this table is read-only reference.
 *
 * Below the tablet breakpoint (see index.css @media) the table falls back to
 * a card-per-product layout where each store's quantity is a labeled row.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, SearchInput, Spinner, type ColumnDef } from '@invenTory/ui';
import { Eye, Package, Store as StoreIcon } from 'lucide-react';
import { searchProducts } from '../services/dashboardService';
import type { ProductSearchResult, StoreQuantity } from '../types/dashboard';
import { InventoryPanel } from '../components/InventoryPanel';

const CATALOG_LIMIT = 200;

export interface StoreColumn {
  store_id: string;
  store_name: string;
}

/** Build one dynamic column per store seen in the results (scales with N). */
export function deriveStoreColumns(results: ProductSearchResult[]): StoreColumn[] {
  const byId = new Map<string, string>();
  for (const r of results) {
    for (const sq of r.store_quantities ?? []) {
      byId.set(sq.store_id, sq.store_name);
    }
  }
  return [...byId.entries()]
    .map(([store_id, store_name]) => ({ store_id, store_name }))
    .sort((a, b) => a.store_name.localeCompare(b.store_name));
}

/** Quantity for one store, or null when the product holds no stock there. */
export function storeQty(
  storeQuantities: StoreQuantity[] | undefined,
  storeId: string,
): number | null {
  if (!storeQuantities) return null;
  const sq = storeQuantities.find((s) => s.store_id === storeId);
  return sq ? sq.quantity : null;
}

export function ProductsCatalogView(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<ProductSearchResult[]>([]);
  const [storeColumns, setStoreColumns] = useState<StoreColumn[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load full catalogue with cross-store breakdown (Task D backend scope).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchProducts('', CATALOG_LIMIT, 'all-stores')
      .then((data) => {
        if (!cancelled) {
          setAllResults(data.results);
          setStoreColumns(deriveStoreColumns(data.results));
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

  // Client-side search over name/SKU/brand/model/category (same behavior as
  // the previous dashboard search bar).
  const filteredResults = useMemo(() => {
    if (!query.trim()) return allResults;
    const term = query.toLowerCase();
    return allResults.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        (r.brand ?? '').toLowerCase().includes(term) ||
        (r.model ?? '').toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term),
    );
  }, [allResults, query]);

  // Responsive: swap table -> card fallback below the tablet breakpoint.
  useEffect(() => {
    const handleResize = (): void => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (value: string): void => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(value), 200);
  };

  if (selectedProduct) {
    return (
      <InventoryPanel
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        onBack={() => setSelectedProduct(null)}
      />
    );
  }

  const columns: ColumnDef<ProductSearchResult>[] = [
    {
      key: 'name',
      header: 'Product Name',
      sortable: true,
      accessor: (r) => r.name,
      render: (r) => (
        <span className="web-cell-product">
          <span className="web-cell-product__name">{r.name}</span>
          <span className="web-cell-product__secondary">{r.brand ?? ''}</span>
        </span>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      sortable: true,
      accessor: (r) => r.model ?? '',
      render: (r) =>
        r.model ? (
          <span className="web-cell-mono">{r.model}</span>
        ) : (
          <span className="web-cell-empty">—</span>
        ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      accessor: (r) => r.sku,
      render: (r) => <span className="web-cell-mono">{r.sku}</span>,
    },
    // Dynamic per-store quantity columns — column count scales with stores.
    ...storeColumns.map((col): ColumnDef<ProductSearchResult> => ({
      key: `store-${col.store_id}`,
      header: col.store_name,
      numeric: true,
      accessor: (r) => storeQty(r.store_quantities, col.store_id) ?? 0,
      render: (r) => {
        const qty = storeQty(r.store_quantities, col.store_id);
        return qty === null ? (
          <span className="web-cell-empty" data-testid={`store-qty-empty-${r.id}-${col.store_id}`}>
            —
          </span>
        ) : (
          <span className="web-cell-qty" data-testid={`store-qty-${r.id}-${col.store_id}`}>
            {qty.toLocaleString()}
          </span>
        );
      },
    })),
    {
      key: 'total_quantity',
      header: 'Total',
      numeric: true,
      sortable: true,
      accessor: (r) => r.total_quantity ?? 0,
      render: (r) => (
        <span className="web-cell-total" data-testid={`total-qty-${r.id}`}>
          {(r.total_quantity ?? 0).toLocaleString()}
        </span>
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
          data-testid={`view-product-${r.id}`}
          title={`View ${r.name}`}
        >
          <Eye size={14} aria-hidden="true" />
          View
        </Button>
      ),
      accessor: (r) => r.id,
    },
  ];

  return (
    <div className="web-catalog-view" data-testid="products-catalog-view">
      <div className="web-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package size={22} color="var(--it-green)" aria-hidden="true" />
          <div>
            <h2 className="web-view-title">Products</h2>
            <p className="web-view-subtitle">
              Global catalogue with per-store stock distribution across {storeColumns.length} store
              {storeColumns.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="web-search-bar">
        <SearchInput
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
          placeholder="Search by name, SKU, brand, model or category…"
          data-testid="catalog-search"
        />
      </div>

      {loading && (
        <div className="web-center-spinner" data-testid="catalog-loading">
          <Spinner size="md" />
        </div>
      )}

      {error && (
        <EmptyState
          variant="error"
          heading="Failed to load catalogue"
          body={error}
          action={
            <Button
              variant="primary"
              onClick={() => {
                setLoading(true);
                setError(null);
                searchProducts('', CATALOG_LIMIT, 'all-stores')
                  .then((data) => {
                    setAllResults(data.results);
                    setStoreColumns(deriveStoreColumns(data.results));
                  })
                  .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </Button>
          }
          data-testid="catalog-error"
        />
      )}

      {!loading &&
        !error &&
        (isNarrow ? (
          // Card-per-product fallback for phone widths — each store's quantity
          // is a labeled row inside the card instead of a wide flat table.
          <div className="web-product-cards" data-testid="catalog-cards">
            {filteredResults.map((r) => (
              <div className="web-product-card" key={r.id} data-testid={`catalog-card-${r.id}`}>
                <div className="web-product-card__head">
                  <span className="web-cell-product__name">{r.name}</span>
                  <span className="web-cell-total">{(r.total_quantity ?? 0).toLocaleString()}</span>
                </div>
                <div className="web-product-card__meta">
                  <span className="web-cell-mono">{r.sku}</span>
                  {r.model && <span className="web-cell-mono">{r.model}</span>}
                </div>
                <div className="web-product-card__stores">
                  {storeColumns.map((col) => {
                    const qty = storeQty(r.store_quantities, col.store_id);
                    return (
                      <div className="web-product-card__store-row" key={col.store_id}>
                        <span className="web-product-card__store-name">
                          <StoreIcon size={13} aria-hidden="true" />
                          {col.store_name}
                        </span>
                        <span className="web-cell-qty">
                          {qty === null ? '—' : qty.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedProduct(r)}
                  data-testid={`view-product-card-${r.id}`}
                >
                  <Eye size={14} aria-hidden="true" />
                  View
                </Button>
              </div>
            ))}
            {filteredResults.length === 0 && (
              <EmptyState
                heading="No products found"
                body="No products match the search criteria."
                data-testid="catalog-empty"
              />
            )}
          </div>
        ) : (
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
              rows={filteredResults}
              rowKey={(r) => r.id}
              data-testid="catalog-table"
              emptySlot={
                <EmptyState
                  heading="No products found"
                  body="No products match the search criteria."
                  data-testid="catalog-empty"
                />
              }
            />
          </div>
        ))}
    </div>
  );
}
