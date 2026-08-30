import React, { useState, useEffect } from 'react';
import { Package, RotateCcw, X, Check, AlertCircle } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { returnStock, getStockBalanceForBucket } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { ReturnStockInput, StockBucket } from '../types/transaction';

export const ReturnStockView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [returnType, setReturnType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [stockBucket, setStockBucket] = useState<StockBucket>('AVAILABLE');
  const [quantity, setQuantity] = useState<number>(1);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [bucketQuantity, setBucketQuantity] = useState<number | null>(null);

  // Demo session identifiers
  const userId = 'USER-DEMO';
  const deviceId = 'DEV-DEMO';

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        const activeStores = data.filter((s) => s.is_active);
        setStores(activeStores);
        if (activeStores.length > 0) {
          setSelectedStoreId(activeStores[0].id);
        }
      } catch (_err) {
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
        } catch (_err) {
          // Silently handle product search failures
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return (): void => clearTimeout(searchProductsDebounced);
  }, [productQuery]);

  const loadBucketQuantity = async (
    storeId: string,
    product: Product,
    bucket: StockBucket,
  ): Promise<void> => {
    try {
      const balance = await getStockBalanceForBucket(storeId, product.id, bucket);
      setBucketQuantity(balance.quantity);
    } catch (_err) {
      setBucketQuantity(null);
    }
  };

  useEffect(() => {
    if (selectedProduct && selectedStoreId) {
      loadBucketQuantity(selectedStoreId, selectedProduct, stockBucket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, stockBucket]);

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
    if (selectedStoreId) {
      loadBucketQuantity(selectedStoreId, product, stockBucket);
    }
  };

  const clearProduct = (): void => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setBucketQuantity(null);
  };

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
      const input: ReturnStockInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        return_type: returnType,
        stock_bucket: stockBucket,
        quantity,
        reference_number: referenceNumber || undefined,
        reason: reason || undefined,
        user_id: userId,
        device_id: deviceId,
      };

      await returnStock(input);
      setSuccess(true);

      // Refresh stock balance
      if (selectedProduct && selectedStoreId) {
        await loadBucketQuantity(selectedStoreId, selectedProduct, stockBucket);
      }

      // Reset transaction form inputs
      setQuantity(1);
      setReferenceNumber('');
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="return-stock-view" data-testid="return-stock-view">
      <div className="view-header">
        <h2 className="view-title">Customer &amp; Supplier Returns</h2>
        <p className="view-subtitle">
          Process stock returns affecting Available, Damaged, or Quarantine buckets (FR-MOV-003,
          Section 13.3)
        </p>
      </div>

      {success && (
        <div
          className="success-banner"
          data-testid="success-banner"
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
          <span>Return transaction recorded successfully and stock balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="error-banner"
          data-testid="error-banner"
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

      <form onSubmit={handleSubmit} className="return-form" style={{ maxWidth: '640px' }}>
        {/* Return Type Segmented Toggle */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label
            className="form-label"
            style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}
          >
            Return Direction
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              data-testid="return-type-customer"
              onClick={(): void => setReturnType('CUSTOMER')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '6px',
                border: returnType === 'CUSTOMER' ? '2px solid #2563eb' : '1px solid #d1d5db',
                backgroundColor: returnType === 'CUSTOMER' ? '#eff6ff' : '#ffffff',
                color: returnType === 'CUSTOMER' ? '#1e40af' : '#374151',
                fontWeight: returnType === 'CUSTOMER' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Customer Return (Stock In)
            </button>
            <button
              type="button"
              data-testid="return-type-supplier"
              onClick={(): void => setReturnType('SUPPLIER')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '6px',
                border: returnType === 'SUPPLIER' ? '2px solid #2563eb' : '1px solid #d1d5db',
                backgroundColor: returnType === 'SUPPLIER' ? '#eff6ff' : '#ffffff',
                color: returnType === 'SUPPLIER' ? '#1e40af' : '#374151',
                fontWeight: returnType === 'SUPPLIER' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Supplier Return (Stock Out)
            </button>
          </div>
        </div>

        {/* Store Selection */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            className="form-label"
            htmlFor="store-select"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Store Location *
          </label>
          <select
            id="store-select"
            data-testid="store-select"
            className="form-control"
            value={selectedStoreId}
            onChange={(e): void => setSelectedStoreId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </div>

        {/* Product Search / Selection */}
        <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }}>
          <label
            className="form-label"
            htmlFor="product-search"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Product *
          </label>
          {selectedProduct ? (
            <div
              data-testid="selected-product-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                backgroundColor: '#f0f9ff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={20} color="#0284c7" />
                <div>
                  <strong style={{ display: 'block', color: '#0369a1' }}>
                    {selectedProduct.name}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    SKU: {selectedProduct.sku}
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="clear-product-button"
                onClick={clearProduct}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div>
              <input
                id="product-search"
                data-testid="product-search"
                type="text"
                className="form-control"
                placeholder="Type to search SKU or name..."
                value={productQuery}
                onChange={(e): void => setProductQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                }}
              />
              {searchResults.length > 0 && (
                <ul
                  data-testid="product-search-results"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {searchResults.map((product) => (
                    <li
                      key={product.id}
                      data-testid={`product-option-${product.id}`}
                      onClick={(): void => handleProductSelect(product)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{product.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        SKU: {product.sku} | Category: {product.category}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Condition / Stock Bucket Selection */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            className="form-label"
            htmlFor="bucket-select"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Stock Condition / Bucket *
          </label>
          <select
            id="bucket-select"
            data-testid="bucket-select"
            className="form-control"
            value={stockBucket}
            onChange={(e): void => setStockBucket(e.target.value as StockBucket)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          >
            <option value="AVAILABLE">AVAILABLE — Saleable / Good Condition</option>
            <option value="DAMAGED">DAMAGED — Damaged / Defective Stock</option>
            <option value="QUARANTINE">QUARANTINE — Under Inspection / Quarantine</option>
          </select>
        </div>

        {/* Bucket Stock Balance Info */}
        {selectedProduct && bucketQuantity !== null && (
          <div
            data-testid="bucket-balance-info"
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              color: '#334155',
            }}
          >
            Current stock in <strong>{stockBucket}</strong> bucket:{' '}
            <strong>{bucketQuantity}</strong> units
          </div>
        )}

        {/* Quantity Input */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            className="form-label"
            htmlFor="quantity-input"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Quantity *
          </label>
          <input
            id="quantity-input"
            data-testid="quantity-input"
            type="number"
            min="1"
            className="form-control"
            value={quantity}
            onChange={(e): void => setQuantity(parseInt(e.target.value, 10) || 0)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
        </div>

        {/* Original Reference Number Input */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            className="form-label"
            htmlFor="reference-input"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Original Transaction Reference (Optional)
          </label>
          <input
            id="reference-input"
            data-testid="reference-input"
            type="text"
            className="form-control"
            placeholder="e.g. TX-SALE-100234 or INV-9941"
            value={referenceNumber}
            onChange={(e): void => setReferenceNumber(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Links return to original sale receipt or purchase order
          </span>
        </div>

        {/* Reason / Notes Input */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label
            className="form-label"
            htmlFor="reason-input"
            style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}
          >
            Reason / Notes (Optional)
          </label>
          <input
            id="reason-input"
            data-testid="reason-input"
            type="text"
            className="form-control"
            placeholder="e.g. Defective screen upon opening box"
            value={reason}
            onChange={(e): void => setReason(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          data-testid="submit-return-button"
          disabled={isSubmitting || !selectedProduct}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: isSubmitting || !selectedProduct ? '#9ca3af' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: isSubmitting || !selectedProduct ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={18} />
          <span>{isSubmitting ? 'Processing Return...' : 'Process Return'}</span>
        </button>
      </form>
    </div>
  );
};
