import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, SearchInput, DataTable, EmptyState, type ColumnDef } from '@invenTory/ui';
import { Product } from '../types/product';
import { Store } from '../types/store';
import { getProducts } from '../services/tauriProductService';
import { getStockBalance } from '../services/tauriTransactionService';
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
  const [qtyMap, setQtyMap] = useState<Map<string, Map<string, number>>>(new Map());
  const qtyCacheRef = useRef<Map<string, number>>(new Map());

  // Load the full catalogue when the modal opens (local/offline data source).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
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

  // Fetch per-store quantities for the catalogue; cached across runs.
  useEffect(() => {
    if (!isOpen || products.length === 0 || stores.length === 0) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      const next = new Map<string, Map<string, number>>();
      for (const store of stores) {
        for (const p of products) {
          const cacheKey = `${store.id}::${p.id}`;
          let qty = 0;
          const cached = qtyCacheRef.current.get(cacheKey);
          if (cached !== undefined) {
            qty = cached;
          } else {
            try {
              const bal = await getStockBalance(store.id, p.id);
              qty = bal.quantity;
            } catch {
              qty = 0;
            }
            qtyCacheRef.current.set(cacheKey, qty);
          }
          const row = next.get(p.id) ?? new Map<string, number>();
          row.set(store.id, qty);
          next.set(p.id, row);
        }
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
    return filtered.slice(0, 50).map((p) => {
      const rowQty = qtyMap.get(p.id) ?? new Map<string, number>();
      let total = 0;
      for (const s of stores) {
        total += rowQty.get(s.id) ?? 0;
      }
      return { product: p, qtyByStore: rowQty, total };
    });
  }, [products, query, stores, qtyMap]);

  const columns: ColumnDef<SearchResultRow>[] = [
    {
      key: 'name',
      header: 'Product Name',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.product.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--it-text-secondary)' }}>
            {r.product.brand || '—'} · {r.product.category}
          </div>
        </div>
      ),
      accessor: (r) => r.product.name,
    },
    {
      key: 'model',
      header: 'Model',
      render: (r) => r.product.model || '—',
      accessor: (r) => r.product.model || '',
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (r) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', color: 'var(--it-green-text)' }}>
          {r.product.sku}
        </span>
      ),
      accessor: (r) => r.product.sku,
    },
    // One dynamic column per store (Task D format)
    ...stores.map((store): ColumnDef<SearchResultRow> => ({
      key: `qty-${store.id}`,
      header: store.name,
      numeric: true,
      width: '10%',
      render: (r) => {
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
      accessor: (r) => r.qtyByStore.get(store.id) ?? 0,
    })),
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      width: '9%',
      render: (r) => (
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
      accessor: (r) => r.total,
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Product Search (All Stores)" size="lg">
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
          <EmptyState heading="Searching…" body="Loading catalogue across all stores." />
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
