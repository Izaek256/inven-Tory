import React, { useState, useEffect, useCallback } from 'react';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { Store } from '../types/store';
import { getProducts, createProduct, updateProduct } from '../services/tauriProductService';
import { getStockBalance } from '../services/tauriTransactionService';
import { getStores } from '../services/tauriStoreService';
import { ProductModal } from '../components/ProductModal';
import { Button, Badge, DataTable, EmptyState, SearchInput, ColumnDef } from '@invenTory/ui';
import { Package, Plus, Edit2, AlertTriangle } from 'lucide-react';
import { useActiveStore } from '../context/StoreContext';
import { storeColor } from '../utils/storeColors';

interface ProductsViewProps {
  /** Current user's role from the auth session. */
  userRole?: string;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ userRole = 'ADMIN' }) => {
  const { activeStoreId } = useActiveStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Cross-store breakdown state (Task I): per-product, per-store AVAILABLE qty.
  const [stores, setStores] = useState<Store[]>([]);
  const [crossStoreMap, setCrossStoreMap] = useState<Map<string, Map<string, number>>>(new Map());

  // Modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Role-based authorization backed by the real auth session
  const isAuthorized =
    userRole === 'GLOBAL_ADMIN' ||
    userRole === 'ADMIN' ||
    userRole === 'INVENTORY_MANAGER' ||
    userRole === 'STORE_MANAGER';

  const fetchProductsList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductsView] Failed to fetch products:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Store list — read-only reference data for the breakdown columns
  useEffect(() => {
    let cancelled = false;
    getStores()
      .then((list) => {
        if (!cancelled) setStores(list);
      })
      .catch(() => {
        // non-fatal: table still renders with the active store column
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Fetch cross-store balances when products, stores, or activeStoreId change.
  // Read-only aggregation: per-store records are untouched (Phase 3, Task I).
  useEffect(() => {
    if (products.length === 0 || stores.length === 0) {
      setCrossStoreMap(new Map());
      return;
    }
    let cancelled = false;
    const loadBalances = async (): Promise<void> => {
      const next = new Map<string, Map<string, number>>();
      for (const store of stores) {
        for (const p of products) {
          let qty = 0;
          try {
            const bal = await getStockBalance(store.id, p.id);
            qty = bal.quantity;
          } catch {
            qty = 0;
          }
          const row = next.get(p.id) ?? new Map<string, number>();
          row.set(store.id, qty);
          next.set(p.id, row);
        }
      }
      if (!cancelled) setCrossStoreMap(next);
    };
    void loadBalances();
    return (): void => {
      cancelled = true;
    };
  }, [products, stores, activeStoreId]);

  useEffect(() => {
    fetchProductsList();
  }, [fetchProductsList]);

  // Filtered products list — search only (Category/Status columns removed
  // per Phase 3, Task I)
  const filteredProducts = products.filter((p) => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.model && p.model.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term)) ||
      (p.alternate_names && p.alternate_names.toLowerCase().includes(term)) ||
      p.category.toLowerCase().includes(term);
    return matchesSearch;
  });

  const handleOpenCreateModal = (): void => {
    setActionError(null);
    setEditingProduct(null);
    setProductModalOpen(true);
  };

  const handleOpenEditModal = (product: Product): void => {
    setActionError(null);
    setEditingProduct(product);
    setProductModalOpen(true);
  };

  const handleCreateProduct = async (input: CreateProductInput): Promise<void> => {
    await createProduct(input);
    fetchProductsList();
  };

  const handleUpdateProduct = async (input: UpdateProductInput): Promise<void> => {
    await updateProduct(input);
    fetchProductsList();
  };

  const activeStore = stores.find((s) => s.id === activeStoreId);
  // Column order: active store pinned first, then the other stores (dynamic),
  // per Phase 3 Task I. If the active store is not in the list (e.g. lookup
  // failed), fall back to the first store so the leading column still exists.
  const orderedStores: Store[] = activeStore
    ? [activeStore, ...stores.filter((s) => s.id !== activeStore.id)]
    : stores;

  const qtyFor = (productId: string, storeId: string | undefined): number => {
    if (!storeId) return 0;
    return crossStoreMap.get(productId)?.get(storeId) ?? 0;
  };

  const columns: ColumnDef<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      width: '26%',
      render: (p) => (
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontWeight: 500, fontSize: '14px' }}>{p.name}</div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--it-text-secondary)',
              marginTop: 1,
            }}
          >
            {p.model || '—'}
          </div>
        </div>
      ),
      accessor: (p) => `${p.name} ${p.model ?? ''}`.toLowerCase(),
    },
    // Active store quantity first — this is "that store's product list".
    // Edit only ever operates on this store's record (scoped write).
    ...orderedStores.slice(0, 3).map((store, index): ColumnDef<Product> => ({
      key: `qty-${store.id}`,
      header: index === 0 ? `${store.name} (This Store)` : store.name,
      numeric: true,
      width: index === 0 ? '12%' : '10%',
      render: (p: Product): React.ReactNode => {
        const qty = qtyFor(p.id, store.id);
        const color = storeColor(store.id);
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--it-font-mono)',
              fontWeight: 600,
              color: qty === 0 ? 'var(--it-text-secondary)' : 'var(--it-green-text)',
            }}
            title={`${qty.toLocaleString()} ${p.unit} in ${
              index === 0 ? 'active store' : store.name
            }`}
            data-testid={`qty-${p.id}-${store.id}`}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            {qty.toLocaleString()}
          </span>
        );
      },
      accessor: (p) => qtyFor(p.id, store.id),
    })),
    // Overflow store columns as a compact chip cluster (no horizontal scroll even
    // with many stores — Task B resolution of the cross-store column-scaling tension).
    {
      key: 'otherStores',
      header: orderedStores.length > 3 ? `+${orderedStores.length - 3} More Stores` : '',
      width: orderedStores.length > 3 ? '22%' : '0%',
      minWidth: '0%',
      sortable: false,
      render: (p: Product): React.ReactNode => {
        if (orderedStores.length <= 3) return null;
        const overflowStores = orderedStores.slice(3);
        return (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 3,
              maxHeight: 30,
              overflow: 'hidden',
            }}
            title={overflowStores
              .map((s) => `${s.name}: ${qtyFor(p.id, s.id).toLocaleString()} ${p.unit}`)
              .join(' | ')}
          >
            {overflowStores.map((store) => {
              const qty = qtyFor(p.id, store.id);
              const color = storeColor(store.id);
              return (
                <span
                  key={store.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '0 5px',
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: `${color}18`,
                    color,
                    fontSize: '10px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    border: `1px solid ${color}30`,
                    cursor: 'default',
                  }}
                  title={`${store.name}: ${qty.toLocaleString()} ${p.unit}`}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: color,
                    }}
                  />
                  {qty.toLocaleString()}
                </span>
              );
            })}
          </div>
        );
      },
      accessor: () => 0,
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      width: '9%',
      render: (p: Product): React.ReactNode => {
        const total = orderedStores.reduce((sum, s) => sum + qtyFor(p.id, s.id), 0);
        return (
          <span
            style={{
              fontFamily: 'var(--it-font-mono)',
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--it-green-text)',
            }}
          >
            {total.toLocaleString()}
          </span>
        );
      },
      accessor: (p) => orderedStores.reduce((sum, s) => sum + qtyFor(p.id, s.id), 0),
    },
    {
      key: 'actions',
      header: 'Actions',
      numeric: true,
      width: '8%',
      render: (p) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Edit Product (active store only)"
            onClick={() => handleOpenEditModal(p)}
            disabled={!isAuthorized}
            data-testid={`edit-product-btn-${p.id}`}
          >
            <Edit2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="products-view" data-testid="products-view">
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package size={24} color="var(--it-green)" />
          <div>
            <h2 className="view-title">Products Catalogue</h2>
            <p className="view-subtitle">
              Active-store catalogue with cross-store availability breakdown (read-only per-store
              reference; edits apply to the active store only)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isAuthorized && <Badge status="INACTIVE" label={`Restricted Role (${userRole})`} />}
          <Button
            variant="primary"
            onClick={handleOpenCreateModal}
            disabled={!isAuthorized}
            data-testid="add-product-btn"
          >
            <Plus size={16} /> Add Product
          </Button>
        </div>
      </div>

      {actionError && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="product-action-error"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Search & Filter Control Bar */}
      <div
        style={{
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1, minWidth: '280px' }}>
          <SearchInput
            placeholder="Search catalogue by name, SKU, brand, model, barcode or alias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="product-search-input"
          />
        </div>
      </div>

      {/* Product Table */}
      <div
        style={{
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          backgroundColor: 'var(--it-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--it-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="var(--it-green)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
              Product Master List ({filteredProducts.length})
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
            v1.0.0 Field Set Only
          </span>
        </div>

        {loading ? (
          <EmptyState
            variant="loading"
            heading="Loading product catalogue"
            body="Loading master product index..."
            data-testid="loading-state"
          />
        ) : error ? (
          <EmptyState
            variant="error"
            heading="Failed to load products"
            body={error}
            action={
              <Button variant="primary" onClick={fetchProductsList}>
                Retry Load
              </Button>
            }
            data-testid="error-state"
          />
        ) : (
          <div className="products-cross-store-wrap">
            <DataTable
              columns={columns}
              rows={filteredProducts}
              rowKey={(p) => p.id}
              data-testid="products-table"
              emptySlot={
                <EmptyState
                  heading="No products found"
                  body="No products match the selected criteria."
                  action={
                    searchQuery ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSearchQuery('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={handleOpenCreateModal}>
                        Create First Product
                      </Button>
                    )
                  }
                  data-testid="empty-state"
                />
              }
            />
          </div>
        )}
      </div>

      {/* Modal */}
      <ProductModal
        isOpen={productModalOpen}
        product={editingProduct}
        onClose={() => setProductModalOpen(false)}
        onSubmitCreate={handleCreateProduct}
        onSubmitUpdate={handleUpdateProduct}
      />
    </div>
  );
};
