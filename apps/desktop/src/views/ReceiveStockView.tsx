import React, { useState, useEffect } from 'react';
import { Package, ArrowDownCircle, X, Check } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { receiveStock } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';

export const ReceiveStockView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [supplier, setSupplier] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

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
        quantity,
        reference_number: referenceNumber || undefined,
        supplier: supplier || undefined,
        user_id: userId,
        device_id: deviceId,
      };

      await receiveStock(input);
      setSuccess(true);

      // Reset form
      setProductQuery('');
      setSelectedProduct(null);
      setQuantity(1);
      setReferenceNumber('');
      setSupplier('');
      setSearchResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
  };

  const clearProduct = (): void => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
  };

  return (
    <div className="receive-stock-view" data-testid="receive-stock-view">
      <div className="view-header">
        <h2 className="view-title">Receive Stock</h2>
        <p className="view-subtitle">Record incoming inventory (FR-MOV-001, Section 13.1)</p>
      </div>

      {success && (
        <div
          className="success-banner"
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
          <span>Stock received successfully. Transaction recorded and balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="error-banner"
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
          }}
        >
          {error}
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

          {/* Selected Product Display */}
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
              <span>
                {selectedProduct.name} ({selectedProduct.sku})
              </span>
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
        </div>

        {/* Reference Number */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
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
            placeholder="e.g., R-1002, INV-2024-001"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Supplier (Optional) */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label
            htmlFor="supplier"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
          >
            Supplier (Optional)
          </label>
          <input
            id="supplier"
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g., Acme Electronics"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Free-text reference only. Full supplier entity coming in Issue 21.
          </div>
        </div>

        {/* Submit Button */}
        <div className="form-actions" style={{ display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: isSubmitting ? '#9ca3af' : '#22c55e',
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
                <ArrowDownCircle size={18} />
                Receive Stock
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
