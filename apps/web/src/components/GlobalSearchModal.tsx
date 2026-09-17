/**
 * Global cross-store product search — web mirror of the desktop
 * GlobalSearchModal (apps/desktop/src/components/GlobalSearchModal.tsx).
 *
 * Same flow, same behavior:
 *  - opens from the header global search (desktop: "Search All Stores" button)
 *  - searches the whole catalogue across all stores (ignores any active scope)
 *  - renders the same per-store breakdown table format (Product | one column
 *    per store | Total), capped at 50 rows, with the store legend on top
 *  - read-only: opening/using/closing the modal never changes navigation or
 *    store scope — it is a lookup layered on top of the current view
 *
 * Web adaptation: quantities come from the single ?scope=all-stores search
 * response (store_quantities per product) instead of desktop's per-cell
 * balance lookups — same rendered table, one request.
 *
 * Responsive: the breakdown table scrolls horizontally inside the modal on
 * narrow viewports instead of squeezing columns.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, SearchInput, DataTable, EmptyState, type ColumnDef } from '@invenTory/ui';
import { searchProducts } from '../services/dashboardService';
import type { ProductSearchResult } from '../types/dashboard';

export interface GlobalSearchStore {
  id: string;
  name: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All stores in the system — one breakdown column each. */
  stores: GlobalSearchStore[];
  /** Prefilled from the header search bar submit. */
  initialQuery?: string;
}

interface SearchResultRow {
  product: ProductSearchResult;
  qtyByStore: Map<string, number>;
  total: number;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  stores,
  initialQuery = '',
}: GlobalSearchModalProps): React.ReactElement {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the header query every time the modal opens.
  useEffect(() => {
    if (isOpen) setQuery(initialQuery);
  }, [isOpen, initialQuery]);

  // Load the full catalogue when the modal opens (single all-stores request
  // carrying the per-store breakdown — the web equivalent of desktop's
  // getProducts() + per-cell getStockBalance() loop).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchProducts('', 200, 'all-stores')
      .then((data) => {
        if (!cancelled) setProducts(data.results ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProducts([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [isOpen]);

  // Name/SKU/brand/model/category matching — across ALL stores (desktop parity).
  const results = useMemo<SearchResultRow[]>(() => {
    const term = query.toLowerCase().trim();
    const filtered = products.filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.brand && p.brand.toLowerCase().includes(term)) ||
        (p.model && p.model.toLowerCase().includes(term)) ||
        p.category.toLowerCase().includes(term),
    );
    return filtered.slice(0, 50).map((p) => {
      const rowQty = new Map<string, number>();
      let total = 0;
      for (const sq of p.store_quantities ?? []) {
        rowQty.set(sq.store_id, sq.quantity);
      }
      for (const s of stores) {
        total += rowQty.get(s.id) ?? 0;
      }
      return { product: p, qtyByStore: rowQty, total };
    });
  }, [products, query, stores]);

  const storeColumns = stores.map((store): ColumnDef<SearchResultRow> => ({
    key: `qty-${store.id}`,
    header: <span style={{ whiteSpace: 'normal' }}>{store.name}</span>,
    numeric: true,
    align: 'center' as const,
    headerWrap: true,
    render: (r: SearchResultRow): React.ReactNode => {
      const qty = r.qtyByStore.get(store.id) ?? 0;
      return (
        <span
          className={`store-qty-cell ${qty === 0 ? 'store-qty-cell--zero' : ''}`}
          data-testid={`qty-${r.product.id}-${store.id}`}
          title={`${qty.toLocaleString()} ${r.product.unit} in ${store.name}`}
        >
          {qty.toLocaleString()}
        </span>
      );
    },
    accessor: (r: SearchResultRow) => r.qtyByStore.get(store.id) ?? 0,
  }));

  const columns: ColumnDef<SearchResultRow>[] = [
    {
      key: 'product',
      header: 'Product',
      minWidth: '26%',
      align: 'left' as const,
      render: (r: SearchResultRow) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600 }}>{r.product.name}</div>
          {r.product.model && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--it-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.product.model}
            </div>
          )}
        </div>
      ),
      accessor: (r: SearchResultRow) => r.product.name,
    },
    // One dedicated column per store so the full cross-store breakdown is
    // visible at a glance (desktop parity).
    ...storeColumns,
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      align: 'center' as const,
      headerWrap: true,
      width: '8%',
      render: (r: SearchResultRow) => (
        <span
          style={{
            fontFamily: 'var(--it-font-mono)',
            fontWeight: 700,
            color: 'var(--it-green-text)',
          }}
        >
          {r.total.toLocaleString()}
        </span>
      ),
      accessor: (r: SearchResultRow) => r.total,
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Product Search (All Stores)" size="xl">
      <div data-testid="global-search-modal">
        <div style={{ marginBottom: '16px' }}>
          <SearchInput
            autoFocus
            placeholder="Search all stores by name, SKU, brand, model or category..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="global-search-input"
          />
        </div>

        {loading ? (
          <EmptyState
            heading="Searching…"
            body="Loading catalogue across all stores."
            data-testid="global-search-loading"
          />
        ) : error ? (
          <EmptyState
            variant="error"
            heading="Search unavailable"
            body={error}
            data-testid="global-search-error"
          />
        ) : results.length === 0 ? (
          <EmptyState
            heading={query ? 'No products found' : 'Start typing to search'}
            body={
              query
                ? 'No products match your search across any store.'
                : 'Search the full catalogue by product name, SKU, brand, model or category.'
            }
          />
        ) : (
          // Responsive: horizontal scroll on narrow viewports keeps every
          // per-store column readable instead of crushing the table.
          <div
            style={{ overflowX: 'auto', maxWidth: '100%' }}
            data-testid="global-search-results-scroll"
          >
            <div style={{ minWidth: `${Math.max(560, 220 + stores.length * 110)}px` }}>
              <DataTable
                columns={columns}
                rows={results}
                rowKey={(r) => r.product.id}
                data-testid="global-search-results-table"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
