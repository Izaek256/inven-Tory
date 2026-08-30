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
  Package,
  Plus,
  Search,
  Edit2,
  Power,
  Barcode,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface ProductsViewProps {
  userRole?: string; // Provisional role restriction - TODO(issue-13)
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

  // Provisional role authorization
  const isAuthorized = userRole === 'ADMIN' || userRole === 'MANAGER';

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
          {!isAuthorized && (
            <span
              className="badge badge-inactive"
              title="Client-side role restriction (provisional) — TODO(issue-13)"
            >
              <AlertTriangle size={12} /> Restricted Role ({userRole})
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPickerDemoOpen(!pickerDemoOpen)}
            data-testid="toggle-picker-demo-btn"
          >
            <Sparkles size={16} /> Test Product Picker (FR-PROD-003)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            disabled={!isAuthorized}
            data-testid="add-product-btn"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {actionError && (
        <div
          className="alert alert-danger"
          style={{ marginBottom: '16px' }}
          data-testid="product-action-error"
        >
          <span>{actionError}</span>
        </div>
      )}

      {/* Product Picker Keyboard Demo Drawer */}
      {pickerDemoOpen && (
        <div className="card-box picker-demo-box" data-testid="picker-demo-container">
          <div className="table-header-box" style={{ marginBottom: '12px' }}>
            <div>
              <h4 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--accent-primary)" />
                Reusable Search-First Product Picker (Section 18 Specification)
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Keyboard navigation: Arrow up/down to navigate, Enter to select, Escape to close.
                Auto-focuses for barcode scanners.
              </p>
            </div>
            <button type="button" className="btn-icon" onClick={() => setPickerDemoOpen(false)}>
              ×
            </button>
          </div>

          <ProductPicker
            onSelectProduct={(p) => {
              setSelectedPickerProduct(p);
            }}
            onClose={() => setPickerDemoOpen(false)}
          />

          {selectedPickerProduct && (
            <div className="picker-selection-result" data-testid="picker-selection-result">
              <strong>Selected Item via Picker:</strong> {selectedPickerProduct.sku} —{' '}
              {selectedPickerProduct.name} ({selectedPickerProduct.category})
            </div>
          )}
        </div>
      )}

      {/* Search & Filter Control Bar */}
      <div className="filter-card">
        <div className="filter-search-box">
          <Search size={18} className="filter-search-icon" />
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search catalogue by name, SKU, brand, model, barcode or alias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="product-search-input"
          />
        </div>

        <div className="filter-controls-group">
          {/* Category Filter */}
          <select
            className="filter-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            data-testid="category-filter-select"
          >
            <option value="ALL">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="filter-button-group">
            <button
              type="button"
              className={`filter-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveFilter('ALL')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-btn ${activeFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setActiveFilter('ACTIVE')}
            >
              Active
            </button>
            <button
              type="button"
              className={`filter-btn ${activeFilter === 'INACTIVE' ? 'active' : ''}`}
              onClick={() => setActiveFilter('INACTIVE')}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Product Table */}
      <div className="table-card">
        <div className="table-header-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="var(--accent-primary)" />
            <h3 className="table-title">Product Master List ({filteredProducts.length})</h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            v1.0.0 Field Set Only
          </span>
        </div>

        {loading ? (
          <div className="loading-state" data-testid="loading-state">
            <div className="spinner"></div>
            <p>Loading master product index...</p>
          </div>
        ) : error ? (
          <div className="error-state" data-testid="error-state">
            <p style={{ color: 'var(--status-error)', marginBottom: '8px', fontWeight: 600 }}>
              {error}
            </p>
            <button type="button" className="btn-retry" onClick={fetchProductsList}>
              Retry Load
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state" data-testid="empty-state">
            <p>No products match the selected criteria.</p>
            {searchQuery || selectedCategory !== 'ALL' || activeFilter !== 'ALL' ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '12px' }}
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setActiveFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '12px' }}
                onClick={handleOpenCreateModal}
              >
                Create First Product
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table" data-testid="products-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Brand / Model</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Barcode</th>
                  <th>Tracking</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} data-testid={`product-row-${prod.id}`}>
                    <td
                      style={{
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      {prod.sku}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{prod.name}</div>
                      {prod.alternate_names && (
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          Aliases: {prod.alternate_names}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {prod.brand || '-'} {prod.model ? `(${prod.model})` : ''}
                    </td>
                    <td>
                      <span className="badge badge-category">{prod.category}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{prod.unit}</td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {prod.barcode ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Barcode size={13} /> {prod.barcode}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {prod.serial_tracking_enabled ? (
                        <span
                          className="badge badge-serial"
                          title="Serial Number Tracking Required"
                        >
                          Serial
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Standard</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${prod.is_active ? 'badge-active' : 'badge-inactive'}`}
                      >
                        {prod.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-action"
                          title="Edit Product"
                          onClick={() => handleOpenEditModal(prod)}
                          disabled={!isAuthorized}
                          data-testid={`edit-product-btn-${prod.id}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          className={`btn-action ${prod.is_active ? 'active-on' : 'active-off'}`}
                          title={prod.is_active ? 'Deactivate Product' : 'Activate Product'}
                          onClick={() => handleToggleActive(prod)}
                          disabled={!isAuthorized}
                          data-testid={`toggle-product-btn-${prod.id}`}
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
