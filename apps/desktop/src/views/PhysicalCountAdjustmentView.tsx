import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Package,
  X,
  Check,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
} from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { getStockBalance, adjustStock } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { InventoryTransaction, AdjustStockInput } from '../types/transaction';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'count' | 'approve' | 'done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function varianceLabel(delta: number): React.ReactElement {
  if (delta === 0)
    return (
      <span className="variance-neutral" data-testid="variance-display">
        ±0 (no discrepancy)
      </span>
    );
  if (delta > 0)
    return (
      <span className="variance-positive" data-testid="variance-display">
        +{delta} (surplus — unrecorded receipt?)
      </span>
    );
  return (
    <span className="variance-negative" data-testid="variance-display">
      {delta} (shortage — adjustment required)
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PhysicalCountAdjustmentView: React.FC = () => {
  // Demo credentials
  const userId = 'USER-DEMO';
  const deviceId = 'DEV-DEMO';

  // Step state
  const [step, setStep] = useState<Step>('count');

  // Entity selection
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Count session
  const [systemQty, setSystemQty] = useState<number | null>(null);
  const [countedQty, setCountedQty] = useState<string>('');
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false);

  // Approval
  const [reason, setReason] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  /** Provisional elevated-permission flag — server-side enforcement lands in Issue 13/14. */
  const [hasElevatedPermission, setHasElevatedPermission] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedTransaction, setApprovedTransaction] = useState<InventoryTransaction | null>(null);

  // ---------------------------------------------------------------------------
  // Load stores
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        const active = data.filter((s) => s.is_active);
        setStores(active);
        if (active.length > 0) {
          setSelectedStoreId(active[0].id);
        }
      } catch (_err) {
        setError('Failed to load stores. Please refresh.');
      }
    };
    loadStores();
  }, []);

  // ---------------------------------------------------------------------------
  // Product search (debounced 300 ms)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (productQuery.trim()) {
        try {
          const results = await searchProducts(productQuery);
          setSearchResults(results.filter((p) => p.is_active));
        } catch (_err) {
          // Silently handle search errors
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return (): void => clearTimeout(timer);
  }, [productQuery]);

  // ---------------------------------------------------------------------------
  // Load system quantity when store + product are set
  // ---------------------------------------------------------------------------

  const loadSystemQty = useCallback(async (storeId: string, product: Product): Promise<void> => {
    setLoadingBalance(true);
    setSystemQty(null);
    try {
      const bal = await getStockBalance(storeId, product.id);
      setSystemQty(bal.quantity);
    } catch (_err) {
      setSystemQty(0); // Treat as 0 if not found
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleProductSelect = (product: Product): void => {
    setSelectedProduct(product);
    setProductQuery(product.name);
    setSearchResults([]);
    setCountedQty('');
    setSystemQty(null);
    if (selectedStoreId) {
      loadSystemQty(selectedStoreId, product);
    }
  };

  const clearProduct = (): void => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setCountedQty('');
    setSystemQty(null);
  };

  const handleStoreChange = (storeId: string): void => {
    setSelectedStoreId(storeId);
    if (selectedProduct) {
      loadSystemQty(storeId, selectedProduct);
    }
  };

  const parsedCounted = countedQty === '' ? null : parseInt(countedQty, 10);
  const variance = parsedCounted !== null && systemQty !== null ? parsedCounted - systemQty : null;

  // Step 1 → Step 2
  const handleProceedToApproval = (): void => {
    setError(null);
    if (!selectedStoreId) {
      setError('Please select a store.');
      return;
    }
    if (!selectedProduct) {
      setError('Please select a product.');
      return;
    }
    if (systemQty === null) {
      setError('System quantity is still loading. Please wait.');
      return;
    }
    if (parsedCounted === null || isNaN(parsedCounted) || parsedCounted < 0) {
      setError('Please enter a valid non-negative counted quantity.');
      return;
    }
    setStep('approve');
  };

  // Step 2 → submit
  const handleApprove = async (): Promise<void> => {
    setError(null);
    setReasonError(null);
    setPermissionError(null);

    if (!reason.trim()) {
      const msg = 'A reason is required for adjustment approval.';
      setReasonError(msg);
      setError(msg);
      return;
    }

    // Provisional client-side permission gate (server enforcement: Issue 13/14)
    if (!hasElevatedPermission) {
      const msg =
        'Elevated permission is required to approve stock adjustments (provisional check).';
      setPermissionError(msg);
      setError(msg);
      return;
    }

    if (variance === null || systemQty === null || !selectedProduct) {
      setError('Session state is invalid. Please restart the count.');
      return;
    }

    setIsSubmitting(true);
    try {
      const input: AdjustStockInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        quantity_delta: variance,
        reason: reason.trim(),
        user_id: userId,
        device_id: deviceId,
        count_reference: `COUNT-${selectedStoreId}-${selectedProduct.id}-${Date.now()}`,
      };

      const tx = await adjustStock(input);
      setApprovedTransaction(tx);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = (): void => {
    setStep('count');
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setSystemQty(null);
    setCountedQty('');
    setReason('');
    setReasonError(null);
    setPermissionError(null);
    setHasElevatedPermission(false);
    setError(null);
    setApprovedTransaction(null);
    setIsSubmitting(false);
  };

  // ---------------------------------------------------------------------------
  // Step indicator helper
  // ---------------------------------------------------------------------------

  const StepIndicator: React.FC = () => (
    <div className="step-indicator" data-testid="step-indicator">
      <div
        className={`step-pill ${step === 'count' || step === 'approve' || step === 'done' ? 'step-active' : ''}`}
      >
        <span className="step-num">1</span>
        <span>Count Session</span>
      </div>
      <div className="step-connector" />
      <div
        className={`step-pill ${step === 'approve' || step === 'done' ? 'step-active' : 'step-inactive'}`}
      >
        <span className="step-num">2</span>
        <span>Approve Adjustment</span>
      </div>
      <div className="step-connector" />
      <div className={`step-pill ${step === 'done' ? 'step-active' : 'step-inactive'}`}>
        <span className="step-num">3</span>
        <span>Confirmed</span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="view-container" data-testid="physical-count-view">
      {/* Header */}
      <div className="view-header">
        <div className="view-title">
          <ClipboardList className="icon" size={24} />
          <div>
            <h1>Physical Count &amp; Adjustment</h1>
            <p>
              Record physical stock counts and reconcile variances with ADJUSTMENT transactions
              (FR-MOV-006, Section 13.4)
            </p>
          </div>
        </div>
      </div>

      <StepIndicator />

      {/* Global error banner */}
      {error && (
        <div className="alert alert-error" data-testid="count-error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 1: Count Session                                               */}
      {/* ------------------------------------------------------------------ */}
      {step === 'count' && (
        <div className="form-card" data-testid="count-session-panel">
          <h2 className="panel-title">Step 1 — Enter Physical Count</h2>

          {/* Store */}
          <div className="form-group">
            <label htmlFor="count-store-select">Store</label>
            <select
              id="count-store-select"
              value={selectedStoreId}
              onChange={(e): void => handleStoreChange(e.target.value)}
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

          {/* Product search */}
          <div className="form-group">
            <label htmlFor="count-product-search">Product</label>
            {selectedProduct ? (
              <div className="selected-item-badge">
                <Package size={16} />
                <span data-testid="selected-product-name">{selectedProduct.name}</span>
                <span className="sku-tag">SKU: {selectedProduct.sku}</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={clearProduct}
                  data-testid="clear-product-btn"
                  title="Change Product"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="search-input-wrapper">
                <input
                  id="count-product-search"
                  type="text"
                  value={productQuery}
                  onChange={(e): void => setProductQuery(e.target.value)}
                  placeholder="Search by product name or SKU..."
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

          {/* Count table — only shown when a product is selected */}
          {selectedProduct && (
            <div className="count-variance-table" data-testid="count-variance-table">
              <div className="count-row">
                <span className="count-label">System Quantity (projection)</span>
                <span className="count-value system-qty" data-testid="system-quantity-display">
                  {loadingBalance ? '…' : (systemQty ?? '—')}
                </span>
              </div>

              <div className="count-row">
                <label htmlFor="counted-qty-input" className="count-label">
                  Counted Quantity <span className="required-asterisk">*</span>
                </label>
                <input
                  id="counted-qty-input"
                  type="number"
                  min="0"
                  value={countedQty}
                  onChange={(e): void => setCountedQty(e.target.value)}
                  placeholder="0"
                  data-testid="counted-quantity-input"
                  className="form-control count-qty-input"
                />
              </div>

              <div className="count-row count-row-variance">
                <span className="count-label">Variance (Counted − System)</span>
                <span className="count-value">
                  {variance !== null ? varianceLabel(variance) : <span className="muted">—</span>}
                </span>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleProceedToApproval}
              disabled={!selectedProduct || parsedCounted === null}
              data-testid="proceed-to-approval-btn"
            >
              <ArrowRight size={18} />
              <span>Proceed to Approval</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2: Approval                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 'approve' && (
        <div className="form-card" data-testid="approval-panel">
          <h2 className="panel-title">Step 2 — Approve Adjustment</h2>

          {/* Summary table */}
          <div className="count-summary-block" data-testid="approval-summary">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Product</td>
                  <td data-testid="summary-product-name">{selectedProduct?.name}</td>
                </tr>
                <tr>
                  <td>SKU</td>
                  <td>{selectedProduct?.sku}</td>
                </tr>
                <tr>
                  <td>Store</td>
                  <td>{stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}</td>
                </tr>
                <tr>
                  <td>System Quantity</td>
                  <td data-testid="summary-system-qty">{systemQty}</td>
                </tr>
                <tr>
                  <td>Counted Quantity</td>
                  <td data-testid="summary-counted-qty">{parsedCounted}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Adjustment Delta</strong>
                  </td>
                  <td>
                    <strong data-testid="summary-variance">
                      {variance !== null && variance >= 0 ? `+${variance}` : variance}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td>Responsible User</td>
                  <td data-testid="summary-user">{userId}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reason */}
          <div className="form-group">
            <label htmlFor="adjustment-reason-input">
              Adjustment Reason <span className="required-asterisk">*</span>
            </label>
            <textarea
              id="adjustment-reason-input"
              rows={3}
              value={reason}
              onChange={(e): void => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
                if (error) setError(null);
              }}
              placeholder="Describe why this adjustment is required (e.g., cycle count discrepancy, shelf damage)..."
              data-testid="reason-input"
              className={`form-control ${reasonError ? 'input-error' : ''}`}
            />
            {reasonError && (
              <span className="error-text" data-testid="reason-error">
                {reasonError}
              </span>
            )}
          </div>

          {/* Elevated-permission gate (provisional — Issue 13/14 enforces server-side) */}
          <div className="form-group permission-gate" data-testid="permission-gate">
            <label className="checkbox-label">
              <input
                id="elevated-permission-checkbox"
                type="checkbox"
                checked={hasElevatedPermission}
                onChange={(e): void => {
                  setHasElevatedPermission(e.target.checked);
                  if (permissionError) setPermissionError(null);
                  if (error) setError(null);
                }}
                data-testid="elevated-permission-checkbox"
              />
              <ShieldCheck size={16} />
              <span>
                I confirm I have elevated permission to approve stock adjustments
                <em className="provisional-badge"> (provisional — Issue 13/14)</em>
              </span>
            </label>
            {permissionError && (
              <span className="error-text" data-testid="permission-error">
                {permissionError}
              </span>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={(): void => {
                setStep('count');
                setError(null);
                setReasonError(null);
                setPermissionError(null);
              }}
              data-testid="back-to-count-btn"
            >
              <ChevronLeft size={18} />
              <span>Back</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={isSubmitting}
              data-testid="approve-adjustment-btn"
            >
              <Check size={18} />
              <span>{isSubmitting ? 'Processing…' : 'Approve Adjustment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3: Done                                                         */}
      {/* ------------------------------------------------------------------ */}
      {step === 'done' && approvedTransaction && (
        <div className="form-card done-panel" data-testid="adjustment-done-panel">
          <div className="done-icon-wrap">
            <Check size={48} className="done-check-icon" />
          </div>
          <h2 className="panel-title done-title">Adjustment Approved</h2>
          <p className="done-subtitle">
            An <strong>ADJUSTMENT</strong> transaction has been recorded with a full audit trail.
          </p>

          <div className="count-summary-block" data-testid="adjustment-result">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Transaction ID</td>
                  <td>
                    <code data-testid="result-transaction-id">
                      {approvedTransaction.transaction_id}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td>Movement Type</td>
                  <td data-testid="result-movement-type">{approvedTransaction.movement_type}</td>
                </tr>
                <tr>
                  <td>Delta Applied</td>
                  <td data-testid="result-quantity-delta">
                    <strong>
                      {approvedTransaction.quantity_delta >= 0
                        ? `+${approvedTransaction.quantity_delta}`
                        : approvedTransaction.quantity_delta}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td>Reason</td>
                  <td data-testid="result-reason">{approvedTransaction.reason_code}</td>
                </tr>
                <tr>
                  <td>Responsible User</td>
                  <td data-testid="result-user">{approvedTransaction.user_id}</td>
                </tr>
                <tr>
                  <td>Sync Status</td>
                  <td>{approvedTransaction.sync_status}</td>
                </tr>
                <tr>
                  <td>Timestamp</td>
                  <td>{new Date(approvedTransaction.occurred_at).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
              data-testid="new-count-btn"
            >
              <RotateCcw size={18} />
              <span>Start New Count</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhysicalCountAdjustmentView;
