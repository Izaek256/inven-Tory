import React, { useState, useEffect } from 'react';
import { Package, ShieldAlert, X, Check, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { moveStockBucket, getStockBalanceForBucket } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { MoveStockBucketInput, StockBucket } from '../types/transaction';

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

  // Demo user/device parameters
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

      // Refresh balances
      if (selectedStoreId && selectedProduct) {
        await loadBucketBalances(selectedStoreId, selectedProduct, fromBucket, toBucket);
      }

      // Reset reason and quantity
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="view-container" data-testid="damage-quarantine-view">
      <div className="view-header">
        <div className="view-title">
          <ShieldAlert className="icon" size={24} />
          <div>
            <h1>Damage & Quarantine Management</h1>
            <p>Move stock between Available, Damaged, and Quarantine buckets (FR-MOV-005)</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" data-testid="damage-error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success" data-testid="damage-success-banner">
          <Check size={20} />
          <span>
            Stock movement recorded successfully! {quantity} unit(s) moved from {fromBucket} to{' '}
            {toBucket}.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        {/* Store Selection */}
        <div className="form-group">
          <label htmlFor="store-select">Store</label>
          <select
            id="store-select"
            value={selectedStoreId}
            onChange={(e): void => setSelectedStoreId(e.target.value)}
            disabled={isSubmitting}
            data-testid="store-select"
            className="form-control"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </div>

        {/* Product Search / Picker */}
        <div className="form-group">
          <label htmlFor="product-search-input">Product</label>
          {selectedProduct ? (
            <div className="selected-item-badge">
              <Package size={16} />
              <span data-testid="selected-product-name">{selectedProduct.name}</span>
              <span className="sku-tag">SKU: {selectedProduct.sku}</span>
              <button
                type="button"
                className="btn-icon"
                onClick={clearProduct}
                disabled={isSubmitting}
                data-testid="clear-product-btn"
                title="Change Product"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="search-input-wrapper">
              <input
                id="product-search-input"
                type="text"
                value={productQuery}
                onChange={(e): void => setProductQuery(e.target.value)}
                placeholder="Search by product name or SKU..."
                disabled={isSubmitting}
                data-testid="product-search-input"
                className="form-control"
              />
              {searchResults.length > 0 && (
                <ul className="search-results-dropdown" data-testid="product-search-results">
                  {searchResults.map((product) => (
                    <li
                      key={product.id}
                      onClick={(): void => handleProductSelect(product)}
                      data-testid={`product-result-${product.id}`}
                    >
                      <div className="product-result-name">{product.name}</div>
                      <div className="product-result-sku">SKU: {product.sku}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Bucket Selection: Source -> Destination */}
        <div className="grid-2-col">
          <div className="form-group">
            <label htmlFor="from-bucket-select">Source Bucket (From)</label>
            <select
              id="from-bucket-select"
              value={fromBucket}
              onChange={(e): void => setFromBucket(e.target.value as StockBucket)}
              disabled={isSubmitting}
              data-testid="from-bucket-select"
              className="form-control"
            >
              <option value="AVAILABLE">AVAILABLE — Sellable Stock</option>
              <option value="DAMAGED">DAMAGED — Damaged / Defective</option>
              <option value="QUARANTINE">QUARANTINE — Under Inspection</option>
            </select>
            {fromBucketQty !== null && (
              <small className="help-text" data-testid="from-bucket-qty">
                Current {fromBucket} balance:{' '}
                <strong data-testid="available-balance-display">{fromBucketQty}</strong>
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="to-bucket-select">Destination Bucket (To)</label>
            <select
              id="to-bucket-select"
              value={toBucket}
              onChange={(e): void => setToBucket(e.target.value as StockBucket)}
              disabled={isSubmitting}
              data-testid="to-bucket-select"
              className="form-control"
            >
              <option value="DAMAGED">DAMAGED — Damaged / Defective</option>
              <option value="QUARANTINE">QUARANTINE — Under Inspection</option>
              <option value="AVAILABLE">AVAILABLE — Sellable Stock</option>
            </select>
            {toBucketQty !== null && (
              <small className="help-text" data-testid="to-bucket-qty">
                Current {toBucket} balance: <strong>{toBucketQty}</strong>
              </small>
            )}
          </div>
        </div>

        {/* Quantity */}
        <div className="form-group">
          <label htmlFor="quantity-input">Quantity</label>
          <input
            id="quantity-input"
            type="number"
            min="1"
            value={quantity}
            onChange={(e): void => setQuantity(parseInt(e.target.value, 10) || 0)}
            disabled={isSubmitting}
            data-testid="quantity-input"
            className="form-control"
          />
        </div>

        {/* Reason (Required Field) */}
        <div className="form-group">
          <label htmlFor="reason-input">
            Reason for Movement <span className="required-asterisk">*</span>
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
            className={`form-control ${reasonError ? 'input-error' : ''}`}
          />
          {reasonError && (
            <span className="error-text" data-testid="reason-error">
              {reasonError}
            </span>
          )}
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={isSubmitting || !selectedProduct}
            data-testid="submit-move-btn"
            className="btn btn-primary"
          >
            <ArrowRightLeft size={18} />
            <span>{isSubmitting ? 'Processing...' : 'Transfer Between Buckets'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default DamageQuarantineView;
