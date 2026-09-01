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
import {
  Button,
  StepIndicator as SharedStepIndicator,
  TextInput,
  Select,
  Badge,
  BadgeStatus,
} from '@inven-tory/ui';

type Step = 'count' | 'approve' | 'done';

interface PhysicalCountAdjustmentViewProps {
  /** Current user's role from the auth session — enforces permission gate. */
  userRole?: string;
}

function varianceLabel(delta: number): React.ReactElement {
  if (delta === 0)
    return (
      <span
        style={{ color: 'var(--it-text-secondary)', fontWeight: 600 }}
        data-testid="variance-display"
      >
        ±0 (no discrepancy)
      </span>
    );
  if (delta > 0)
    return (
      <span
        style={{ color: 'var(--it-green-text)', fontWeight: 700 }}
        data-testid="variance-display"
      >
        +{delta} (surplus — unrecorded receipt?)
      </span>
    );
  return (
    <span style={{ color: 'var(--it-red-text)', fontWeight: 700 }} data-testid="variance-display">
      {delta} (shortage — adjustment required)
    </span>
  );
}

export const PhysicalCountAdjustmentView: React.FC<PhysicalCountAdjustmentViewProps> = ({
  userRole = 'STORE_CLERK',
}) => {
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

  // Role-based permission: ADJUSTMENT permission is STORE_MANAGER and above.
  const hasAdjustmentPermission =
    userRole === 'GLOBAL_ADMIN' || userRole === 'INVENTORY_MANAGER' || userRole === 'STORE_MANAGER';

  const [step, setStep] = useState<Step>('count');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [systemQty, setSystemQty] = useState<number | null>(null);
  const [countedQty, setCountedQty] = useState<string>('');
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false);

  const [reason, setReason] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedTransaction, setApprovedTransaction] = useState<InventoryTransaction | null>(null);

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

  const loadSystemQty = useCallback(async (storeId: string, product: Product): Promise<void> => {
    setLoadingBalance(true);
    setSystemQty(null);
    try {
      const bal = await getStockBalance(storeId, product.id);
      setSystemQty(bal.quantity);
    } catch (_err) {
      setSystemQty(0);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

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

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setReasonError(null);

    if (!reason.trim()) {
      const msg = 'A reason is required for adjustment approval.';
      setReasonError(msg);
      setError(msg);
      return;
    }

    if (!hasAdjustmentPermission) {
      const msg =
        'You do not have permission to approve stock adjustments. STORE_MANAGER role or above required.';
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
        user_id: sessionUserId,
        device_id: sessionDeviceId,
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
    setError(null);
    setApprovedTransaction(null);
    setIsSubmitting(false);
  };

  const currentStepIdx = step === 'count' ? 0 : step === 'approve' ? 1 : 2;
  const wizardSteps = [
    { id: 'count', label: 'Count Session' },
    { id: 'approve', label: 'Approve Adjustment' },
    { id: 'done', label: 'Confirmed' },
  ];

  return (
    <div className="view-container" data-testid="physical-count-view" style={{ maxWidth: '640px' }}>
      {/* Header */}
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ClipboardList size={28} color="var(--it-green)" />
          <div>
            <h2 className="view-title">Physical Count &amp; Adjustment</h2>
            <p className="view-subtitle">
              Record physical stock counts and reconcile variances with ADJUSTMENT transactions
              (FR-MOV-006, Section 13.4)
            </p>
          </div>
        </div>
      </div>

      <div data-testid="step-indicator">
        <SharedStepIndicator steps={wizardSteps} currentStepIndex={currentStepIdx} />
      </div>

      {/* Global error banner */}
      {error && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="count-error-banner"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Count Session */}
      {step === 'count' && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
          data-testid="count-session-panel"
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
            Step 1 — Enter Physical Count
          </h3>

          {/* Store */}
          <Select
            id="count-store-select"
            data-testid="store-select"
            label="Store"
            value={selectedStoreId}
            onChange={(e): void => handleStoreChange(e.target.value)}
            options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />

          {/* Product search */}
          <div style={{ position: 'relative' }}>
            <label className="it-label" style={{ display: 'block', marginBottom: '4px' }}>
              Product
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
                  data-testid="clear-product-btn"
                  title="Change Product"
                >
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <div>
                <TextInput
                  id="count-product-search"
                  data-testid="product-search-input"
                  value={productQuery}
                  onChange={(e): void => setProductQuery(e.target.value)}
                  placeholder="Search by product name or SKU..."
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
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
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

          {/* Count table — only shown when a product is selected */}
          {selectedProduct && (
            <div
              style={{
                backgroundColor: 'var(--it-surface)',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-md)',
                overflow: 'hidden',
              }}
              data-testid="count-variance-table"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--it-border)',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--it-text-secondary)' }}>
                  System Quantity (projection)
                </span>
                <span
                  data-testid="system-quantity-display"
                  style={{
                    fontFamily: 'var(--it-font-mono)',
                    fontWeight: 700,
                    fontSize: '16px',
                    color: 'var(--it-green-text)',
                  }}
                >
                  {loadingBalance ? '…' : (systemQty ?? '—')}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--it-border)',
                }}
              >
                <label
                  htmlFor="counted-qty-input"
                  style={{ fontSize: '13px', color: 'var(--it-text-primary)', fontWeight: 600 }}
                >
                  Counted Quantity <span style={{ color: 'var(--it-red)' }}>*</span>
                </label>
                <input
                  id="counted-qty-input"
                  type="number"
                  min="0"
                  value={countedQty}
                  onChange={(e): void => setCountedQty(e.target.value)}
                  placeholder="0"
                  data-testid="counted-quantity-input"
                  className="it-input"
                  style={{
                    width: '120px',
                    textAlign: 'center',
                    fontFamily: 'var(--it-font-mono)',
                    fontWeight: 600,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: 'var(--it-gray-surface)',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--it-text-secondary)' }}>
                  Variance (Counted − System)
                </span>
                <span style={{ fontSize: '14px' }}>
                  {variance !== null ? (
                    varianceLabel(variance)
                  ) : (
                    <span style={{ color: 'var(--it-text-disabled)' }}>—</span>
                  )}
                </span>
              </div>
            </div>
          )}

          <div style={{ marginTop: '8px' }}>
            <Button
              type="button"
              variant="primary"
              onClick={handleProceedToApproval}
              disabled={!selectedProduct || parsedCounted === null}
              data-testid="proceed-to-approval-btn"
              style={{ width: '100%' }}
            >
              <ArrowRight size={18} />
              <span>Proceed to Approval</span>
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Approval */}
      {step === 'approve' && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
          data-testid="approval-panel"
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
            Step 2 — Approve Adjustment
          </h3>

          <div
            style={{
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              overflow: 'hidden',
            }}
            data-testid="approval-summary"
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--it-surface)',
                    color: 'var(--it-text-secondary)',
                  }}
                >
                  <th
                    style={{
                      padding: '8px 14px',
                      textAlign: 'left',
                      borderBottom: '1px solid var(--it-border)',
                    }}
                  >
                    Field
                  </th>
                  <th
                    style={{
                      padding: '8px 14px',
                      textAlign: 'left',
                      borderBottom: '1px solid var(--it-border)',
                    }}
                  >
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Product
                  </td>
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="summary-product-name"
                  >
                    {selectedProduct?.name}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    SKU
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    {selectedProduct?.sku}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Store
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    {stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    System Quantity
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                    data-testid="summary-system-qty"
                  >
                    {systemQty}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Counted Quantity
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                    data-testid="summary-counted-qty"
                  >
                    {parsedCounted}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    <strong>Adjustment Delta</strong>
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    <strong data-testid="summary-variance">
                      {variance !== null && variance >= 0 ? `+${variance}` : variance}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px' }}>Responsible User</td>
                  <td style={{ padding: '8px 14px' }} data-testid="summary-user">
                    {sessionUserId || '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="it-field">
            <label htmlFor="adjustment-reason-input" className="it-label">
              Adjustment Reason <span style={{ color: 'var(--it-red)' }}>*</span>
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

          <div
            style={{
              padding: '14px 18px',
              backgroundColor: 'var(--it-gray-surface)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
            }}
            data-testid="permission-gate"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <ShieldCheck
                size={16}
                color={hasAdjustmentPermission ? 'var(--it-green)' : 'var(--it-red)'}
              />
              <span style={{ color: 'var(--it-text-primary)' }}>
                {hasAdjustmentPermission
                  ? `Adjustment approved by role: ${userRole}`
                  : `Insufficient role: ${userRole} — STORE_MANAGER or above required`}
              </span>
            </div>
            {!hasAdjustmentPermission && (
              <p
                style={{ marginTop: '4px', fontSize: '12px', color: 'var(--it-red-text)' }}
                data-testid="permission-error"
              >
                You do not have permission to approve stock adjustments.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={(): void => {
                setStep('count');
                setError(null);
                setReasonError(null);
              }}
              data-testid="back-to-count-btn"
            >
              <ChevronLeft size={18} />
              <span>Back</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              onClick={handleApprove}
              loading={isSubmitting}
              data-testid="approve-adjustment-btn"
            >
              <Check size={18} />
              <span>Approve Adjustment</span>
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && approvedTransaction && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '32px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
          data-testid="adjustment-done-panel"
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--it-green-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-green-text)',
            }}
          >
            <Check size={36} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--it-text-primary)' }}>
            Adjustment Approved
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--it-text-secondary)' }}>
            An <strong>ADJUSTMENT</strong> transaction has been recorded with a full audit trail.
          </p>

          <div
            style={{
              width: '100%',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              overflow: 'hidden',
              textAlign: 'left',
            }}
            data-testid="adjustment-result"
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--it-surface)',
                    color: 'var(--it-text-secondary)',
                  }}
                >
                  <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Field
                  </th>
                  <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Transaction ID
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    <code
                      data-testid="result-transaction-id"
                      style={{ fontFamily: 'var(--it-font-mono)' }}
                    >
                      {approvedTransaction.transaction_id}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Movement Type
                  </td>
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="result-movement-type"
                  >
                    {approvedTransaction.movement_type}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Delta Applied
                  </td>
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="result-quantity-delta"
                  >
                    <strong style={{ fontFamily: 'var(--it-font-mono)' }}>
                      {approvedTransaction.quantity_delta >= 0
                        ? `+${approvedTransaction.quantity_delta}`
                        : approvedTransaction.quantity_delta}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Reason
                  </td>
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="result-reason"
                  >
                    {approvedTransaction.reason_code}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Responsible User
                  </td>
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="result-user"
                  >
                    {approvedTransaction.user_id}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Sync Status
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    <Badge status={approvedTransaction.sync_status as BadgeStatus} />
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px' }}>Timestamp</td>
                  <td style={{ padding: '8px 14px' }}>
                    {new Date(approvedTransaction.occurred_at).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            data-testid="new-count-btn"
          >
            <RotateCcw size={18} />
            <span>Start New Count</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default PhysicalCountAdjustmentView;
