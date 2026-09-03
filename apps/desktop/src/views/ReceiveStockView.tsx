import React, { useState, useEffect } from 'react';
import { Package, ArrowDownCircle, X, Check, AlertCircle } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { receiveStock } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';
import { Button, TextInput, NumericInput, Select } from '@inven-tory/ui';

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
    if (!sessionUserId) {
      setError('User session not found. Please log in again.');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: CreateTransactionInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        movement_type: 'RECEIPT',
        quantity,
        reference_number: referenceNumber || undefined,
        supplier: supplier || undefined,
        user_id: sessionUserId,
        device_id: sessionDeviceId,
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
    <div
      className="receive-stock-view"
      data-testid="receive-stock-view"
      style={{ maxWidth: '640px' }}
    >
      <div className="view-header">
        <div>
          <h2 className="view-title">Receive Stock</h2>
          <p className="view-subtitle">Record incoming inventory (FR-MOV-001, Section 13.1)</p>
        </div>
      </div>

      {success && (
        <div className="it-toast it-toast--success" style={{ marginBottom: '16px' }}>
          <Check size={16} aria-hidden="true" />
          <span>Stock received successfully. Transaction recorded and balance updated.</span>
        </div>
      )}

      {error && (
        <div className="it-toast it-toast--error" style={{ marginBottom: '16px' }}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {stores.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Package size={48} style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No stores configured</h3>
          <p style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }}>
            Create a store location first to record stock movements.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="transaction-form"
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
          {/* Store Selection */}
          <Select
            id="store-select"
            label="Store"
            required
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />

          {/* Product Search */}
          <div style={{ position: 'relative' }}>
            <TextInput
              id="product-search"
              label="Product"
              required
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search by name, SKU, barcode..."
            />
            {selectedProduct && (
              <button
                type="button"
                onClick={clearProduct}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '34px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--it-text-secondary)',
                }}
              >
                <X size={16} />
              </button>
            )}

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && !selectedProduct && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--it-card)',
                  border: '1px solid var(--it-border)',
                  borderRadius: 'var(--it-r-md)',
                  marginTop: '4px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  zIndex: 10,
                  boxShadow: 'var(--it-shadow-md)',
                }}
              >
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleProductSelect(product)}
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
                      style={{ fontWeight: 600, fontSize: '13px', color: 'var(--it-text-primary)' }}
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
                  backgroundColor: 'var(--it-green-surface)',
                  border: '1px solid var(--it-green-border)',
                  borderRadius: 'var(--it-r-md)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--it-green-text)',
                }}
              >
                <Package size={16} />
                <span>
                  {selectedProduct.name} ({selectedProduct.sku})
                </span>
              </div>
            )}
          </div>

          {/* Quantity */}
          <NumericInput
            id="quantity"
            label="Quantity"
            required
            value={quantity}
            min={1}
            onChange={(v) => setQuantity(Math.max(1, v))}
          />

          {/* Reference Number */}
          <TextInput
            id="reference-number"
            label="Receipt / Reference Number"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g., R-1002, INV-2024-001"
          />

          {/* Supplier (Optional) */}
          <TextInput
            id="supplier"
            label="Supplier (Optional)"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g., Acme Electronics"
            hint="Free-text reference only. Full supplier entity coming in Issue 21."
          />

          {/* Submit Button */}
          <div style={{ marginTop: '8px' }}>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              style={{ width: '100%' }}
            >
              <ArrowDownCircle size={18} />
              Receive Stock
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
