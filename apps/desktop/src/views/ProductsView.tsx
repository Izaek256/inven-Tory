import React, { useState, useEffect, useCallback } from 'react';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import {
  getProducts,
  createProduct,
  updateProduct,
  toggleProductActive,
} from '../services/tauriProductService';
import { ProductModal } from '../components/ProductModal';
import { ProductPicker } from '../components/ProductPicker';
import {
  Button,
  Badge,
  DataTable,
  EmptyState,
  SearchInput,
  Select,
  ColumnDef,
} from '@inven-tory/ui';
import { Package, Plus, Edit2, Power, Barcode, Sparkles, AlertTriangle, X } from 'lucide-react';

interface ProductsViewProps {
  /** Current user's role from the auth session (Issue 25). */
  userRole?: string;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ userRole = 'ADMIN' }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // ProductPicker demo drawer/modal state
  const [pickerDemoOpen, setPickerDemoOpen] = useState(false);
  const [selectedPickerProduct, setSelectedPickerProduct] = useState<Product | null>(null);

  // Role-based authorization backed by the real auth session (Issue 25)
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

  useEffect(() => {
    fetchProductsList();
  }, [fetchProductsList]);

  // Derived category list
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.model && p.model.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term)) ||
      (p.alternate_names && p.alternate_names.toLowerCase().includes(term));

    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

    const matchesActive =
      activeFilter === 'ALL' ||
      (activeFilter === 'ACTIVE' && p.is_active) ||
      (activeFilter === 'INACTIVE' && !p.is_active);

    return matchesSearch && matchesCategory && matchesActive;
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

  const handleToggleActive = async (product: Product): Promise<void> => {
    try {
      setActionError(null);
      await toggleProductActive(product.id, !product.is_active);
      fetchProductsList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const columns: ColumnDef<Product>[] = [
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (p) => (
        <span
          style={{
            fontWeight: 600,
            fontFamily: 'var(--it-font-mono)',
            color: 'var(--it-green-text)',
          }}
        >
          {p.sku}
        </span>
      ),
      accessor: (p) => p.sku,
    },
    {
      key: 'name',
      header: 'Product Name',
      sortable: true,
      render: (p) => (
        <div>
          <div style={{ fontWeight: 500 }}>{p.name}</div>
          {p.alternate_names && (
            <div style={{ fontSize: '11px', color: 'var(--it-text-secondary)' }}>
              Aliases: {p.alternate_names}
            </div>
          )}
        </div>
      ),
      accessor: (p) => p.name,
    },
    {
      key: 'brandModel',
      header: 'Brand / Model',
      render: (p) => (
        <span style={{ color: 'var(--it-text-secondary)' }}>
          {p.brand || '-'} {p.model ? `(${p.model})` : ''}
        </span>
      ),
      accessor: (p) => `${p.brand || ''} ${p.model || ''}`,
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (p) => <Badge status="SENT" label={p.category} />,
      accessor: (p) => p.category,
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (p) => <span style={{ color: 'var(--it-text-secondary)' }}>{p.unit}</span>,
      accessor: (p) => p.unit,
    },
    {
      key: 'barcode',
      header: 'Barcode',
      render: (p) =>
        p.barcode ? (
          <span
            style={{
              fontFamily: 'var(--it-font-mono)',
              fontSize: '12px',
              color: 'var(--it-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Barcode size={13} /> {p.barcode}
          </span>
        ) : (
          '-'
        ),
      accessor: (p) => p.barcode,
    },
    {
      key: 'tracking',
      header: 'Tracking',
      render: (p) =>
        p.serial_tracking_enabled ? (
          <Badge status="SENT" label="Serial" />
        ) : (
          <span style={{ color: 'var(--it-text-secondary)', fontSize: '12px' }}>Standard</span>
        ),
      accessor: (p) => (p.serial_tracking_enabled ? 'Serial' : 'Standard'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge status={p.is_active ? 'ACTIVE' : 'INACTIVE'} />,
      accessor: (p) => (p.is_active ? 'Active' : 'Inactive'),
    },
    {
      key: 'actions',
      header: 'Actions',
      numeric: true,
      render: (p) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Edit Product"
            onClick={() => handleOpenEditModal(p)}
            disabled={!isAuthorized}
            data-testid={`edit-product-btn-${p.id}`}
          >
            <Edit2 size={14} />
          </Button>
          <Button
            variant={p.is_active ? 'destructive' : 'primary'}
            size="sm"
            iconOnly
            title={p.is_active ? 'Deactivate Product' : 'Activate Product'}
            onClick={() => handleToggleActive(p)}
            disabled={!isAuthorized}
            data-testid={`toggle-product-btn-${p.id}`}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="products-view" data-testid="products-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Products Catalogue</h2>
          <p className="view-subtitle">
            Master item index and v1.0.0 product management (FR-PROD-001–003)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isAuthorized && <Badge status="INACTIVE" label={`Restricted Role (${userRole})`} />}
          <Button
            variant="secondary"
            onClick={() => setPickerDemoOpen(!pickerDemoOpen)}
            data-testid="toggle-picker-demo-btn"
          >
            <Sparkles size={16} /> Test Product Picker (FR-PROD-003)
          </Button>
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

      {/* Product Picker Keyboard Demo Drawer */}
      {pickerDemoOpen && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-green-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '16px',
            marginBottom: '20px',
          }}
          data-testid="picker-demo-container"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div>
              <h4
                style={{
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--it-text-primary)',
                }}
              >
                <Sparkles size={16} color="var(--it-green)" />
                Reusable Search-First Product Picker (Section 18 Specification)
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--it-text-secondary)', marginTop: '2px' }}>
                Keyboard navigation: Arrow up/down to navigate, Enter to select, Escape to close.
                Auto-focuses for barcode scanners.
              </p>
            </div>
            <Button variant="ghost" size="sm" iconOnly onClick={() => setPickerDemoOpen(false)}>
              <X size={16} />
            </Button>
          </div>

          <ProductPicker
            onSelectProduct={(p) => {
              setSelectedPickerProduct(p);
            }}
            onClose={() => setPickerDemoOpen(false)}
          />

          {selectedPickerProduct && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                backgroundColor: 'var(--it-green-surface)',
                border: '1px solid var(--it-green-border)',
                borderRadius: 'var(--it-r-md)',
                color: 'var(--it-green-text)',
                fontSize: '13px',
              }}
              data-testid="picker-selection-result"
            >
              <strong>Selected Item via Picker:</strong> {selectedPickerProduct.sku} —{' '}
              {selectedPickerProduct.name} ({selectedPickerProduct.category})
            </div>
          )}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            data-testid="category-filter-select"
            options={[
              { value: 'ALL', label: `All Categories (${categories.length})` },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
          />

          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--it-surface)',
              padding: '3px',
              borderRadius: 'var(--it-r-md)',
              border: '1px solid var(--it-border)',
            }}
          >
            <button
              type="button"
              className={`it-btn it-btn--sm ${activeFilter === 'ALL' ? 'it-btn--secondary' : 'it-btn--ghost'}`}
              onClick={() => setActiveFilter('ALL')}
            >
              All
            </button>
            <button
              type="button"
              className={`it-btn it-btn--sm ${activeFilter === 'ACTIVE' ? 'it-btn--secondary' : 'it-btn--ghost'}`}
              onClick={() => setActiveFilter('ACTIVE')}
            >
              Active
            </button>
            <button
              type="button"
              className={`it-btn it-btn--sm ${activeFilter === 'INACTIVE' ? 'it-btn--secondary' : 'it-btn--ghost'}`}
              onClick={() => setActiveFilter('INACTIVE')}
            >
              Inactive
            </button>
          </div>
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
                  searchQuery || selectedCategory !== 'ALL' || activeFilter !== 'ALL' ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('ALL');
                        setActiveFilter('ALL');
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
