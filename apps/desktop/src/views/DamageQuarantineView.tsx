import React, { useState, useEffect } from 'react';
import { Package, ShieldAlert, X, Check, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { moveStockBucket, getStockBalanceForBucket } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { MoveStockBucketInput, StockBucket } from '../types/transaction';
import { Button, TextInput, NumericInput, Select } from '@inven-tory/ui';

export const DamageQuarantineView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [fromBucket, setFromBucket] = useState<StockBucket>('AVAILABLE');
  const [toBucket, setToBucket] = useState<StockBucket>('DAMAGED');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const [fromBucketQty, setFromBucketQty] = useState<number | null>(null);
  const [toBucketQty, setToBucketQty] = useState<number | null>(null);

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
          // Silently handle product search error
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return (): void => clearTimeout(searchProductsDebounced);
  }, [productQuery]);

  const loadBucketBalances = async (
    storeId: string,
    product: Product,
    srcBucket: StockBucket,
    dstBucket: StockBucket,
  ): Promise<void> => {
    try {
      const srcBal = await getStockBalanceForBucket(storeId, product.id, srcBucket);
      setFromBucketQty(srcBal.quantity);
    } catch (_err) {
      setFromBucketQty(null);
    }

    try {
      const dstBal = await getStockBalanceForBucket(storeId, product.id, dstBucket);
      setToBucketQty(dstBal.quantity);
    } catch (_err) {
      setToBucketQty(null);
    }
  };

  useEffect(() => {
    if (selectedProduct && selectedStoreId) {
      loadBucketBalances(selectedStoreId, selectedProduct, fromBucket, toBucket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, fromBucket, toBucket]);

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
    if (selectedStoreId) {
      loadBucketBalances(selectedStoreId, product, fromBucket, toBucket);
    }
  };

  const clearProduct = (): void => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setFromBucketQty(null);
    setToBucketQty(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setReasonError(null);
    setSuccess(false);

    if (!selectedStoreId) {
      setError('Please select a store');
      return;
    }
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }
    if (fromBucket === toBucket) {
      setError('Source and destination buckets must be different');
      return;
    }
    if (quantity <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }

    if (!reason || !reason.trim()) {
      const msg = 'Reason is required for damage/quarantine movements';
      setReasonError(msg);
      setError(msg);
      return;
    }

    setIsSubmitting(true);

    try {
      const input: MoveStockBucketInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        from_bucket: fromBucket,
        to_bucket: toBucket,
        quantity,
        reason: reason.trim(),
        user_id: userId,
        device_id: deviceId,
      };

      await moveStockBucket(input);
      setSuccess(true);

      if (selectedStoreId && selectedProduct) {
        await loadBucketBalances(selectedStoreId, selectedProduct, fromBucket, toBucket);
      }

      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="view-container"
      data-testid="damage-quarantine-view"
      style={{ maxWidth: '640px' }}
    >
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} color="var(--it-red)" />
          <div>
            <h2 className="view-title">Damage &amp; Quarantine Management</h2>
            <p className="view-subtitle">
              Move stock between Available, Damaged, and Quarantine buckets (FR-MOV-005)
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="damage-error-banner"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          className="it-toast it-toast--success"
          style={{ marginBottom: '16px' }}
          data-testid="damage-success-banner"
        >
          <Check size={16} aria-hidden="true" />
          <span>
            Stock movement recorded successfully! {quantity} unit(s) moved from {fromBucket} to{' '}
            {toBucket}.
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
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
          onChange={(e): void => setSelectedStoreId(e.target.value)}
          disabled={isSubmitting}
          options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />

        {/* Product Search / Picker */}
        <div style={{ position: 'relative' }}>
          <label className="it-label" style={{ display: 'block', marginBottom: '4px' }}>
            Product *
          </label>
          {selectedProduct ? (
            <div
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} color="var(--it-green)" />
                <span
                  data-testid="selected-product-name"
                  style={{ fontWeight: 600, color: 'var(--it-green-text)', fontSize: '13px' }}
                >
                  {selectedProduct.name}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--it-font-mono)',
                    color: 'var(--it-text-secondary)',
                  }}
                >
                  SKU: {selectedProduct.sku}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={clearProduct}
                disabled={isSubmitting}
                data-testid="clear-product-btn"
                title="Change Product"
              >
                <X size={16} />
              </Button>
            </div>
          ) : (
            <div>
              <TextInput
                id="product-search-input"
                data-testid="product-search-input"
                value={productQuery}
                onChange={(e): void => setProductQuery(e.target.value)}
                placeholder="Search by product name or SKU..."
                disabled={isSubmitting}
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
                      onClick={(): void => handleProductSelect(product)}
                      data-testid={`product-result-${product.id}`}
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
                        SKU: {product.sku}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Bucket Selection: Source -> Destination */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <Select
              id="from-bucket-select"
              data-testid="from-bucket-select"
              label="Source Bucket (From)"
              value={fromBucket}
              onChange={(e): void => setFromBucket(e.target.value as StockBucket)}
              disabled={isSubmitting}
              options={[
                { value: 'AVAILABLE', label: 'AVAILABLE — Sellable Stock' },
                { value: 'DAMAGED', label: 'DAMAGED — Damaged / Defective' },
                { value: 'QUARANTINE', label: 'QUARANTINE — Under Inspection' },
              ]}
            />
            {fromBucketQty !== null && (
              <small
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: 'var(--it-text-secondary)',
                }}
                data-testid="from-bucket-qty"
              >
                Current {fromBucket} balance:{' '}
                <strong
                  data-testid="available-balance-display"
                  style={{ fontFamily: 'var(--it-font-mono)' }}
                >
                  {fromBucketQty}
                </strong>
              </small>
            )}
          </div>

          <div>
            <Select
              id="to-bucket-select"
              data-testid="to-bucket-select"
              label="Destination Bucket (To)"
              value={toBucket}
              onChange={(e): void => setToBucket(e.target.value as StockBucket)}
              disabled={isSubmitting}
              options={[
                { value: 'DAMAGED', label: 'DAMAGED — Damaged / Defective' },
                { value: 'QUARANTINE', label: 'QUARANTINE — Under Inspection' },
                { value: 'AVAILABLE', label: 'AVAILABLE — Sellable Stock' },
              ]}
            />
            {toBucketQty !== null && (
              <small
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: 'var(--it-text-secondary)',
                }}
                data-testid="to-bucket-qty"
              >
                Current {toBucket} balance:{' '}
                <strong style={{ fontFamily: 'var(--it-font-mono)' }}>{toBucketQty}</strong>
              </small>
            )}
          </div>
        </div>

        {/* Quantity */}
        <NumericInput
          id="quantity-input"
          data-testid="quantity-input"
          label="Quantity"
          required
          value={quantity}
          min={1}
          onChange={(v) => setQuantity(Math.max(1, v))}
          disabled={isSubmitting}
        />

        {/* Reason (Required Field) */}
        <div className="it-field">
          <label htmlFor="reason-input" className="it-label">
            Reason for Movement <span style={{ color: 'var(--it-red)' }}>*</span>
          </label>
          <textarea
            id="reason-input"
            rows={3}
            value={reason}
            onChange={(e): void => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
            placeholder="Describe reason for damage, quarantine, or bucket transfer..."
            disabled={isSubmitting}
            data-testid="reason-input"
            className="it-input"
            style={reasonError ? { borderColor: 'var(--it-red)' } : undefined}
          />
          {reasonError && (
            <span
              style={{ fontSize: '12px', color: 'var(--it-red-text)' }}
              data-testid="reason-error"
            >
              {reasonError}
            </span>
          )}
        </div>

        {/* Form Actions */}
        <div style={{ marginTop: '8px' }}>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !selectedProduct}
            loading={isSubmitting}
            data-testid="submit-move-btn"
            style={{ width: '100%' }}
          >
            <ArrowRightLeft size={18} />
            <span>Transfer Between Buckets</span>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default DamageQuarantineView;
