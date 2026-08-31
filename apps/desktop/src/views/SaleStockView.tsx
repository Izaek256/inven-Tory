import React, { useState, useEffect } from 'react';
import { Package, ArrowUpCircle, X, Check, AlertCircle } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { sellStock, getStockBalance } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';
import { Button, TextInput, NumericInput, Select } from '@inven-tory/ui';

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
      setAvailableQuantity(null);
    }
  };

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
    loadAvailableQuantity(selectedStoreId, product);
  };

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
    <div className="sale-stock-view" data-testid="sale-stock-view" style={{ maxWidth: '640px' }}>
      <div className="view-header">
        <div>
          <h2 className="view-title">Sale / Issue Stock</h2>
          <p className="view-subtitle">
            Record sales and stock removals (FR-MOV-002, Section 13.2)
          </p>
        </div>
      </div>

      {success && (
        <div
          className="it-toast it-toast--success"
          data-testid="sale-success-banner"
          style={{ marginBottom: '16px' }}
        >
          <Check size={16} aria-hidden="true" />
          <span>Stock sold successfully. Transaction recorded and balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="it-toast it-toast--error"
          data-testid="sale-error-banner"
          style={{ marginBottom: '16px' }}
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

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
          data-testid="store-select"
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
            data-testid="product-search-input"
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
                  data-testid={`product-result-${product.id}`}
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

          {/* Selected Product Display with Available Quantity */}
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
              <span data-testid="selected-product-name">
                {selectedProduct.name} ({selectedProduct.sku})
              </span>
              {availableQuantity !== null && (
                <span
                  data-testid="available-quantity-display"
                  style={{ marginLeft: 'auto', fontWeight: 600, fontFamily: 'var(--it-font-mono)' }}
                >
                  Available: {availableQuantity}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div>
          <NumericInput
            id="quantity"
            data-testid="quantity-input"
            label="Quantity"
            required
            value={quantity}
            min={1}
            onChange={(v) => setQuantity(Math.max(1, v))}
          />
          {availableQuantity !== null && quantity > availableQuantity && (
            <div
              style={{
                marginTop: '4px',
                fontSize: '12px',
                color: 'var(--it-red-text)',
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
        <TextInput
          id="reference-number"
          label="Receipt / Reference Number"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="e.g., S-1002, INV-2024-001"
        />

        {/* Submit Button */}
        <div style={{ marginTop: '8px' }}>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            data-testid="submit-sale-btn"
            style={{ width: '100%' }}
          >
            <ArrowUpCircle size={18} />
            Sell Stock
          </Button>
        </div>
      </form>
    </div>
  );
};
