import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  SearchInput,
  DataTable,
  EmptyState,
  SkeletonSearch,
  loadSearchHistory,
  pushSearchHistory,
  clearSearchHistory,
  type ColumnDef,
} from '@invenTory/ui';
import { Product } from '../types/product';
import { Store } from '../types/store';
import { getProducts } from '../services/tauriProductService';
import { getStockBalancesForStore } from '../services/tauriTransactionService';
import { storeColor } from '../utils/storeColors';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All stores in the system — one breakdown column each (Task D/G). */
  stores: Store[];
}

interface SearchResultRow {
  product: Product;
  qtyByStore: Map<string, number>;
  total: number;
}

/**
 * Global cross-store product search (Phase 3, Task G).
 *
 * Deliberately ignores the currently active store: it searches the whole
 * catalogue across all stores and renders the same per-store breakdown table
 * format used by the web Products view. Opening/closing/using this modal
 * never changes the active store — it is a read-only lookup layered on top of
 * whatever store context is currently active.
 */
export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  stores,
}) => {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());
  const [qtyMap, setQtyMap] = useState<Map<string, Map<string, number>>>(new Map());
  const qtyCacheRef = useRef<Map<string, Map<string, number>>>(new Map());

  // Load the full catalogue when the modal opens (local/offline data source).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    // Clear the cache when modal opens to ensure fresh data after stock movements
    qtyCacheRef.current.clear();
    getProducts()
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [isOpen]);

  // Fetch per-store quantities for the catalogue; one indexed balance query
  // per store, run concurrently and cached per store across runs. (The old
  // sequential per-(store, product) single-cell loop issued stores×products
  // round-trips and blocked the modal on all of them.)
  useEffect(() => {
    if (!isOpen || products.length === 0 || stores.length === 0) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      // Always fetch fresh balances when modal opens to reflect latest stock movements
      const fetched = await Promise.all(
        stores.map((store) =>
          getStockBalancesForStore(store.id)
            .catch(() => new Map<string, number>())
            .then((balances) => ({ storeId: store.id, balances })),
        ),
      );
      for (const { storeId, balances } of fetched) {
        qtyCacheRef.current.set(storeId, balances);
      }
      if (cancelled) return;
      const next = new Map<string, Map<string, number>>();
      for (const p of products) {
        const row = new Map<string, number>();
        for (const s of stores) {
          row.set(s.id, qtyCacheRef.current.get(s.id)?.get(p.id) ?? 0);
        }
        next.set(p.id, row);
      }
      if (!cancelled) setQtyMap(next);
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [isOpen, products, stores]);

  // Name/SKU/brand/model/category matching — across ALL stores.
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
    return filtered.slice(0, 50).map((p: Product) => {
      const rowQty = qtyMap.get(p.id) ?? new Map<string, number>();
      let total = 0;
      for (const s of stores) {
        total += rowQty.get(s.id) ?? 0;
      }
      return { product: p, qtyByStore: rowQty, total };
    });
  }, [products, query, stores, qtyMap]);

  const storeColumns = stores.map((store: Store): ColumnDef<SearchResultRow> => ({
    key: `qty-${store.id}`,
    header: (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          whiteSpace: 'normal',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="store-switcher-badge"
          style={{ backgroundColor: storeColor(store.id), flexShrink: 0 }}
        />
        <span>{store.name}</span>
      </span>
    ),
    numeric: true,
    align: 'center' as const,
    headerWrap: true,
    width: stores.length > 0 ? `${Math.max(5, Math.floor((68 / stores.length) * 10) / 10)}%` : '8%',
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
                fontFamily: 'var(--it-font-mono)',
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
    // visible at a glance — the wide (xl) modal fits every store without the
    // table degrading into an overflow chip or horizontal scrolling.
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
  const handleClose = (): void => {
    if (query.trim()) setSearchHistory(pushSearchHistory(query));
    setQuery('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Global Product Search (All Stores)"
      size="xl"
    >
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

        {!query && searchHistory.length > 0 && (
          <div
            data-testid="global-search-history"
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--it-text-secondary)' }}>Recent:</span>
            {searchHistory.slice(0, 5).map((term) => (
              <button
                key={term}
                type="button"
                className="btn btn--ghost btn--sm"
                data-testid="global-search-history-chip"
                onClick={() => setQuery(term)}
                style={{ fontSize: '12px' }}
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              data-testid="global-search-history-clear"
              onClick={() => {
                clearSearchHistory();
                setSearchHistory([]);
              }}
              style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}
            >
              Clear
            </button>
          </div>
        )}

        {stores.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              marginBottom: '12px',
              fontSize: '11px',
              color: 'var(--it-text-secondary)',
            }}
          >
            {stores.map((store) => (
              <span
                key={store.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <span
                  className="store-switcher-badge"
                  style={{ backgroundColor: storeColor(store.id) }}
                />
                {store.name}
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <div data-testid="global-search-loading" role="status" aria-label="Loading catalogue">
            <SkeletonSearch />
          </div>
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
          <DataTable
            columns={columns}
            rows={results}
            rowKey={(r) => r.product.id}
            data-testid="global-search-results-table"
          />
        )}
      </div>
    </Modal>
  );
};
