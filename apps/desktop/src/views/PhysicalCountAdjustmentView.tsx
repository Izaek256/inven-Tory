import React, { useEffect, useCallback, useState } from 'react';
import {
  ClipboardList,
  Check,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
  Trash2,
} from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProductsFts5 } from '../services/tauriProductService';
import { getStockBalance, adjustStock } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { InventoryTransaction, AdjustStockInput } from '../types/transaction';
import {
  Button,
  StepIndicator as SharedStepIndicator,
  Badge,
  BadgeStatus,
  LinearEntryForm,
  FieldDef,
  SearchResultItem,
} from '@inven-tory/ui';
import type { ColumnDef } from '@inven-tory/ui';

type Step = 'count' | 'approve' | 'done';

interface PhysicalCountAdjustmentViewProps {
  userRole?: string;
}

interface CountEntry {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  timestamp: string;
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
  const [sessionUserId, setSessionUserId] = useState('');
  const [sessionDeviceId, setSessionDeviceId] = useState('');

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const { getSession } = await import('../services/tauriAuthService');
        const s = await getSession();
        setSessionUserId(s?.user_id ? String(s.user_id) : 'USER-LOCAL');
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { load } = await import('@tauri-apps/plugin-store');
          const store = await load('auth.dat', { autoSave: false });
          const devId = await store.get<string>('device_id');
          setSessionDeviceId(devId || 'SINGLE-USER-DEVICE');
        } else {
          setSessionDeviceId('SINGLE-USER-DEVICE');
        }
      } catch {
        setSessionUserId('USER-LOCAL');
        setSessionDeviceId('SINGLE-USER-DEVICE');
      }
    };
    void loadSession();
  }, []);

  const hasAdjustmentPermission =
    userRole === 'GLOBAL_ADMIN' || userRole === 'INVENTORY_MANAGER' || userRole === 'STORE_MANAGER';

  const [step, setStep] = useState<Step>('count');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [countEntries, setCountEntries] = useState<CountEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedTransaction, setApprovedTransaction] = useState<InventoryTransaction | null>(null);

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [elevatedPermissionChecked, setElevatedPermissionChecked] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        setStores(data.filter((s) => s.is_active));
        if (data.length > 0 && !selectedStoreId) {
          setSelectedStoreId(data[0].id);
        }
      } catch {
        setError('Failed to load stores. Please refresh.');
      }
    };
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchProductsFts5(query);
      const mapped = results
        .filter((p) => p.is_active)
        .map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: `SKU: ${p.sku}${p.barcode ? ` • Barcode: ${p.barcode}` : ''}`,
          name: p.name,
          sku: p.sku,
          category: p.category,
          unit: p.unit,
          barcode: p.barcode,
          brand: p.brand,
          model: p.model,
          is_active: p.is_active,
        })) as SearchResultItem[];
      setSearchResults(mapped);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const handleSearchSelect = useCallback(
    (item: SearchResultItem) => {
      const product = item as unknown as Product;
      if (selectedStoreId) {
        setSelectedProduct(product);
        void getStockBalance(selectedStoreId, product.id).catch(() => {
          // silently fail
        });
      } else {
        setSelectedProduct(product);
      }
    },
    [selectedStoreId],
  );

  const handleCountCommit = useCallback(
    async (values: Record<string, string | number>) => {
      const storeId = values.store as string;
      const countedQty = typeof values.countedQty === 'number' ? values.countedQty : 0;

      if (!storeId) {
        setError('Please select a store');
        return;
      }

      const product = selectedProduct;
      if (!product) {
        setError('Please select a product');
        return;
      }

      let sysQty = 0;
      try {
        const bal = await getStockBalance(storeId, product.id);
        sysQty = bal.quantity;
      } catch {
        sysQty = 0;
      }

      const entry: CountEntry = {
        id: `${Date.now()}-${Math.random()}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        systemQty: sysQty,
        countedQty,
        variance: countedQty - sysQty,
        timestamp: new Date().toLocaleString(),
      };

      setCountEntries((prev) => [...prev, entry]);
      setSelectedProduct(null);
      setSearchResults([]);
    },
    [selectedProduct],
  );

  const handleVoidCount = useCallback((id: string) => {
    setCountEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const handleProceedToApproval = (): void => {
    setError(null);
    setReason('');
    setReasonError(null);
    setPermissionError(null);
    setElevatedPermissionChecked(false);
    if (!selectedStoreId) {
      setError('Please select a store.');
      return;
    }
    if (countEntries.length === 0) {
      setError('Please enter at least one count before proceeding.');
      return;
    }
    setStep('approve');
  };

  const handleApprove = async (): Promise<void> => {
    setError(null);
    setReasonError(null);
    setPermissionError(null);

    let hasError = false;

    if (!reason.trim()) {
      const msg = 'A reason is required for adjustment approval.';
      setReasonError(msg);
      setError(msg);
      hasError = true;
    }

    if (!elevatedPermissionChecked) {
      const msg = 'Elevated permission is required to approve stock adjustments.';
      setPermissionError(msg);
      if (!hasError) setError(msg);
      hasError = true;
    }

    if (hasError) return;

    const totalVariance = countEntries.reduce((sum, entry) => sum + entry.variance, 0);
    const primaryEntry = countEntries[0];

    if (!primaryEntry || !selectedStoreId) {
      setError('No count entries to approve.');
      return;
    }

    setIsSubmitting(true);
    try {
      const userId = sessionUserId || 'USER-LOCAL';
      const deviceId = sessionDeviceId || 'SINGLE-USER-DEVICE';

      const input: AdjustStockInput = {
        store_id: selectedStoreId,
        product_id: primaryEntry.productId,
        quantity_delta: totalVariance,
        reason: reason.trim(),
        user_id: userId,
        device_id: deviceId,
        count_reference: `COUNT-${selectedStoreId}-${Date.now()}`,
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
    setCountEntries([]);
    setSelectedProduct(null);
    setSearchResults([]);
    setError(null);
    setApprovedTransaction(null);
    setIsSubmitting(false);
    setReason('');
    setReasonError(null);
    setPermissionError(null);
    setElevatedPermissionChecked(false);
  };

  const currentStepIdx = step === 'count' ? 0 : step === 'approve' ? 1 : 2;
  const wizardSteps = [
    { id: 'count', label: 'Count Session' },
    { id: 'approve', label: 'Approve Adjustment' },
    { id: 'done', label: 'Confirmed' },
  ];

  const countColumns: ColumnDef<CountEntry>[] = [
    {
      key: 'productName',
      header: 'Product',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.productName}</div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--it-text-secondary)',
              fontFamily: 'var(--it-font-mono)',
            }}
          >
            SKU: {row.sku}
          </div>
        </div>
      ),
    },
    {
      key: 'systemQty',
      header: 'System Qty',
      numeric: true,
      render: (row) => <span style={{ fontFamily: 'var(--it-font-mono)' }}>{row.systemQty}</span>,
    },
    {
      key: 'countedQty',
      header: 'Counted Qty',
      numeric: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', fontWeight: 600 }}>{row.countedQty}</span>
      ),
    },
    {
      key: 'variance',
      header: 'Variance',
      render: (row) => varianceLabel(row.variance),
    },
    {
      key: 'timestamp',
      header: 'Time',
      render: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>{row.timestamp}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      numeric: true,
      render: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Remove entry"
            onClick={() => handleVoidCount(row.id)}
            data-testid={`void-count-${row.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const countFields: FieldDef[] = [
    {
      id: 'store',
      type: 'select',
      label: 'Store',
      required: true,
      defaultValue: selectedStoreId,
      options: stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      id: 'product',
      type: 'text',
      label: 'Product',
      required: true,
      placeholder: selectedProduct ? selectedProduct.name : 'Search by name or SKU...',
      defaultValue: selectedProduct ? selectedProduct.name : '',
    },
    {
      id: 'countedQty',
      type: 'number',
      label: 'Counted Quantity',
      required: true,
      defaultValue: 0,
      min: 0,
    },
  ];

  return (
    <div className="view-container" data-testid="physical-count-view" style={{ maxWidth: '960px' }}>
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

      <div data-testid="step-indicator" style={{ marginBottom: '20px' }}>
        <SharedStepIndicator steps={wizardSteps} currentStepIndex={currentStepIdx} />
      </div>

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

      {step === 'count' && (
        <div
          data-testid="count-session-panel"
          style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 60%', minWidth: '320px' }}>
            <LinearEntryForm
              dataTestid="count-session-linear"
              title="Step 1 — Enter Physical Count"
              subtitle="Scan or type products, enter counted quantity, press Enter to add to sheet"
              fields={countFields}
              fieldTestIds={{
                store: 'field-store',
                product: 'field-product',
                countedQty: 'field-countedQty',
              }}
              onCommit={handleCountCommit}
              searchResults={searchResults}
              onSearch={handleSearch}
              onSearchSelect={handleSearchSelect}
              sessionTableTitle="Count Sheet"
              sessionTableColumns={countColumns}
              sessionTableRows={countEntries}
              sessionTableEmptyState={
                <div
                  style={{
                    color: 'var(--it-text-secondary)',
                    fontSize: '13px',
                    textAlign: 'center',
                    padding: '40px 0',
                  }}
                >
                  No entries yet
                </div>
              }
            />
            <div style={{ marginTop: '16px' }}>
              <Button
                type="button"
                variant="primary"
                onClick={handleProceedToApproval}
                disabled={countEntries.length === 0}
                data-testid="proceed-to-approval-btn"
                style={{ width: '100%' }}
              >
                <ArrowRight size={18} />
                <span>Proceed to Approval ({countEntries.length} items)</span>
              </Button>
            </div>
          </div>
        </div>
      )}

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
                    Store
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    {stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Lines Counted
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    {countEntries.length}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    System Qty
                  </td>
                  <td
                    data-testid="summary-system-qty"
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    {countEntries[0]?.systemQty ?? 0}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Counted Qty
                  </td>
                  <td
                    data-testid="summary-counted-qty"
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    {countEntries[0]?.countedQty ?? 0}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}>
                    Total Variance
                  </td>
                  <td
                    data-testid="summary-variance"
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--it-border)',
                      fontFamily: 'var(--it-font-mono)',
                    }}
                  >
                    <strong>{countEntries.reduce((sum, e) => sum + e.variance, 0)}</strong>
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
              onChange={(e) => {
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
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={elevatedPermissionChecked}
                onChange={(e) => {
                  setElevatedPermissionChecked(e.target.checked);
                  if (permissionError) setPermissionError(null);
                  if (error) setError(null);
                }}
                data-testid="elevated-permission-checkbox"
                style={{ marginTop: '2px', accentColor: 'var(--it-green)' }}
              />
              <span style={{ color: 'var(--it-text-primary)' }}>
                <ShieldCheck
                  size={14}
                  color={hasAdjustmentPermission ? 'var(--it-green)' : 'var(--it-text-secondary)'}
                  style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                />
                I confirm I have elevated permission to approve this stock adjustment
                {hasAdjustmentPermission
                  ? ` (role: ${userRole})`
                  : ` — Note: your current role (${userRole}) may not authorise this`}
              </span>
            </label>
            {permissionError && (
              <p
                style={{ marginTop: '6px', fontSize: '12px', color: 'var(--it-red-text)' }}
                data-testid="permission-error"
              >
                {permissionError}
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
                setPermissionError(null);
                setElevatedPermissionChecked(false);
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
                  <td
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--it-border)' }}
                    data-testid="result-transaction-id"
                  >
                    <code style={{ fontFamily: 'var(--it-font-mono)' }}>
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
