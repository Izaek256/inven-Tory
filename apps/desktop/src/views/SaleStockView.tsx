import React, { useState, useEffect } from 'react';
import { Package, ArrowUpCircle, X, Check, AlertCircle } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { sellStock, getStockBalance } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';

export const SaleStockView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);

  // Mock user/device IDs - in real app these come from auth/session
  const userId = 'USER-DEMO';
  const deviceId = 'DEV-DEMO';

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        setStores(data.filter((s) => s.is_active));
        if (data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      } catch (err) {
        setError('Failed to load stores');
      }
    };
    loadStores();
  }, []);

  useEffect(() => {
    const searchProductsDebounced = setTimeout(async () => {
      if (productQuery.trim()) {
        try {
          const results = await searchProducts(productQuery);
          setSearchResults(results.filter((p) => p.is_active));
        } catch (err) {
          // Silently fail - search errors shouldn't block the UI
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return (): void => clearTimeout(searchProductsDebounced);
  }, [productQuery]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!selectedStoreId) {
      setError('Please select a store');
      return;
    }
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }
    if (quantity <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: CreateTransactionInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        movement_type: 'SALE',
        quantity,
        reference_number: referenceNumber || undefined,
        user_id: userId,
        device_id: deviceId,
      };

      await sellStock(input);
      setSuccess(true);

      // Reset form
      setProductQuery('');
      setSelectedProduct(null);
      setQuantity(1);
      setReferenceNumber('');
      setSearchResults([]);
      setAvailableQuantity(null);
    } catch (err) {
      // Pass the raw error through — the Tauri sell_stock command already formats the
      // AT-012 message as "Insufficient stock. Available quantity: X. Cannot sell Y units."
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadAvailableQuantity = async (storeId: string, product: Product): Promise<void> => {
    try {
      const balance = await getStockBalance(storeId, product.id);
      setAvailableQuantity(balance.quantity);
    } catch (_err) {
      // Non-fatal: fall back to showing no quantity
      setAvailableQuantity(null);
    }
  };

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
    // Fetch real AVAILABLE quantity from local SQLite (AT-012)
    loadAvailableQuantity(selectedStoreId, product);
  };

  // Refresh available quantity when the user switches store with a product already selected
  useEffect(() => {
    if (selectedProduct && selectedStoreId) {
      loadAvailableQuantity(selectedStoreId, selectedProduct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const clearProduct = (): void => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setAvailableQuantity(null);
  };

  return (
    <div className="sale-stock-view" data-testid="sale-stock-view">
      <div className="view-header">
        <h2 className="view-title">Sale / Issue Stock</h2>
        <p className="view-subtitle">Record sales and stock removals (FR-MOV-002, Section 13.2)</p>
      </div>

      {success && (
        <div
          className="success-banner"
          data-testid="sale-success-banner"
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#dcfce7',
            border: '1px solid #22c55e',
            borderRadius: '6px',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={20} />
          <span>Stock sold successfully. Transaction recorded and balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="error-banner"
          data-testid="sale-error-banner"
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="transaction-form">
        {/* Store Selection */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label
            htmlFor="store-select"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
          >
            Store *
          </label>
          <select
            id="store-select"
            data-testid="store-select"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </div>

        {/* Product Search */}
        <div className="form-group" style={{ marginBottom: '20px', position: 'relative' }}>
          <label
            htmlFor="product-search"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
          >
            Product *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="product-search"
              data-testid="product-search-input"
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search by name, SKU, barcode..."
              required
              style={{
                width: '100%',
                padding: '10px',
                paddingRight: selectedProduct ? '40px' : '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            {selectedProduct && (
              <button
                type="button"
                onClick={clearProduct}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && !selectedProduct && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                marginTop: '4px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 10,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            >
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  data-testid={`product-result-${product.id}`}
                  onClick={() => handleProductSelect(product)}
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                >
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>{product.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    SKU: {product.sku} {product.barcode && `• Barcode: ${product.barcode}`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Product Display with Available Quantity */}
          {selectedProduct && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #22c55e',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={16} style={{ color: '#16a34a' }} />
              <span data-testid="selected-product-name">
                {selectedProduct.name} ({selectedProduct.sku})
              </span>
              {availableQuantity !== null && (
                <span
                  data-testid="available-quantity-display"
                  style={{ marginLeft: 'auto', fontWeight: '500', color: '#16a34a' }}
                >
                  Available: {availableQuantity}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label
            htmlFor="quantity"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
          >
            Quantity *
          </label>
          <input
            id="quantity"
            data-testid="quantity-input"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          {availableQuantity !== null && quantity > availableQuantity && (
            <div
              style={{
                marginTop: '4px',
                fontSize: '12px',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <AlertCircle size={12} />
              <span>Warning: Quantity exceeds available stock ({availableQuantity})</span>
            </div>
          )}
        </div>

        {/* Reference Number */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label
            htmlFor="reference-number"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
          >
            Receipt / Reference Number
          </label>
          <input
            id="reference-number"
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g., S-1002, INV-2024-001"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Submit Button */}
        <div className="form-actions" style={{ display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            data-testid="submit-sale-btn"
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: isSubmitting ? '#9ca3af' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isSubmitting ? (
              'Processing...'
            ) : (
              <>
                <ArrowUpCircle size={18} />
                Sell Stock
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
