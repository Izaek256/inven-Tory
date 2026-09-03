import React, { useState, useEffect } from 'react';
import { Package, RotateCcw, X, Check, AlertCircle } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { returnStock, getStockBalanceForBucket } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { ReturnStockInput, StockBucket } from '../types/transaction';
import { Button, TextInput, NumericInput, Select } from '@inven-tory/ui';

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

  // Auth: resolve user/device from the active session instead of hardcoded values.
  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [sessionDeviceId, setSessionDeviceId] = useState<string>('');

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const { getSession } = await import('../services/tauriAuthService');
        const s = await getSession();
        if (s) {
          setSessionUserId(s.user_id);
        }
        // device_id is stored separately in the secure store
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { load } = await import('@tauri-apps/plugin-store');
          const store = await load('auth.dat', { autoSave: false });
          const devId = await store.get<string>('device_id');
          setSessionDeviceId(devId ?? '');
        }
      } catch {
        // Non-Tauri / test environment — leave empty; Tauri commands use their own context
      }
    };
    void loadSession();
  }, []);

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
    if (!sessionUserId || !sessionDeviceId) {
      setError('Session not loaded. Please log in again.');
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
        user_id: sessionUserId,
        device_id: sessionDeviceId,
      };

      await returnStock(input);
      setSuccess(true);

      if (selectedProduct && selectedStoreId) {
        await loadBucketQuantity(selectedStoreId, selectedProduct, stockBucket);
      }

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
    <div
      className="return-stock-view"
      data-testid="return-stock-view"
      style={{ maxWidth: '640px' }}
    >
      <div className="view-header">
        <div>
          <h2 className="view-title">Customer &amp; Supplier Returns</h2>
          <p className="view-subtitle">
            Process stock returns affecting Available, Damaged, or Quarantine buckets (FR-MOV-003,
            Section 13.3)
          </p>
        </div>
      </div>

      {success && (
        <div
          className="it-toast it-toast--success"
          data-testid="success-banner"
          style={{ marginBottom: '16px' }}
        >
          <Check size={16} aria-hidden="true" />
          <span>Return transaction recorded successfully and stock balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="it-toast it-toast--error"
          data-testid="error-banner"
          style={{ marginBottom: '16px' }}
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="return-form"
        style={{
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Return Type Segmented Toggle */}
        <div>
          <label className="it-label" style={{ display: 'block', marginBottom: '8px' }}>
            Return Direction
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              type="button"
              data-testid="return-type-customer"
              variant={returnType === 'CUSTOMER' ? 'primary' : 'secondary'}
              onClick={(): void => setReturnType('CUSTOMER')}
              style={{ flex: 1 }}
            >
              Customer Return (Stock In)
            </Button>
            <Button
              type="button"
              data-testid="return-type-supplier"
              variant={returnType === 'SUPPLIER' ? 'primary' : 'secondary'}
              onClick={(): void => setReturnType('SUPPLIER')}
              style={{ flex: 1 }}
            >
              Supplier Return (Stock Out)
            </Button>
          </div>
        </div>

        {/* Store Selection */}
        <Select
          id="store-select"
          data-testid="store-select"
          label="Store Location"
          required
          value={selectedStoreId}
          onChange={(e): void => setSelectedStoreId(e.target.value)}
          options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />

        {/* Product Search / Selection */}
        <div style={{ position: 'relative' }}>
          <label className="it-label" style={{ display: 'block', marginBottom: '4px' }}>
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
                border: '1px solid var(--it-green-border)',
                borderRadius: 'var(--it-r-md)',
                backgroundColor: 'var(--it-green-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={20} color="var(--it-green)" />
                <div>
                  <strong
                    style={{ display: 'block', color: 'var(--it-green-text)', fontSize: '13px' }}
                  >
                    {selectedProduct.name}
                  </strong>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--it-text-secondary)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    SKU: {selectedProduct.sku}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                data-testid="clear-product-button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={clearProduct}
              >
                <X size={18} />
              </Button>
            </div>
          ) : (
            <div>
              <input
                id="product-search"
                data-testid="product-search"
                type="text"
                className="it-input"
                placeholder="Type to search SKU or name..."
                value={productQuery}
                onChange={(e): void => setProductQuery(e.target.value)}
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
                    margin: '4px 0 0 0',
                    padding: 0,
                    listStyle: 'none',
                    backgroundColor: 'var(--it-card)',
                    border: '1px solid var(--it-border)',
                    borderRadius: 'var(--it-r-md)',
                    boxShadow: 'var(--it-shadow-md)',
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
                        borderBottom: '1px solid var(--it-border)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--it-surface)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--it-text-primary)',
                        }}
                      >
                        {product.name}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--it-text-secondary)',
                          fontFamily: 'var(--it-font-mono)',
                        }}
                      >
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
        <Select
          id="bucket-select"
          data-testid="bucket-select"
          label="Stock Condition / Bucket"
          required
          value={stockBucket}
          onChange={(e): void => setStockBucket(e.target.value as StockBucket)}
          options={[
            { value: 'AVAILABLE', label: 'AVAILABLE — Saleable / Good Condition' },
            { value: 'DAMAGED', label: 'DAMAGED — Damaged / Defective Stock' },
            { value: 'QUARANTINE', label: 'QUARANTINE — Under Inspection / Quarantine' },
          ]}
        />

        {/* Bucket Stock Balance Info */}
        {selectedProduct && bucketQuantity !== null && (
          <div
            data-testid="bucket-balance-info"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--it-surface)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              fontSize: '13px',
              color: 'var(--it-text-primary)',
            }}
          >
            Current stock in <strong>{stockBucket}</strong> bucket:{' '}
            <strong style={{ fontFamily: 'var(--it-font-mono)' }}>{bucketQuantity}</strong> units
          </div>
        )}

        {/* Quantity Input */}
        <NumericInput
          id="quantity-input"
          data-testid="quantity-input"
          label="Quantity"
          required
          value={quantity}
          min={1}
          onChange={(v) => setQuantity(Math.max(1, v))}
        />

        {/* Original Reference Number Input */}
        <TextInput
          id="reference-input"
          data-testid="reference-input"
          label="Original Transaction Reference (Optional)"
          placeholder="e.g. TX-SALE-100234 or INV-9941"
          value={referenceNumber}
          onChange={(e): void => setReferenceNumber(e.target.value)}
          hint="Links return to original sale receipt or purchase order"
        />

        {/* Reason / Notes Input */}
        <TextInput
          id="reason-input"
          data-testid="reason-input"
          label="Reason / Notes (Optional)"
          placeholder="e.g. Defective screen upon opening box"
          value={reason}
          onChange={(e): void => setReason(e.target.value)}
        />

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!selectedProduct}
          data-testid="submit-return-button"
          style={{ width: '100%' }}
        >
          <RotateCcw size={18} />
          <span>{isSubmitting ? 'Processing Return...' : 'Process Return'}</span>
        </Button>
      </form>
    </div>
  );
};
