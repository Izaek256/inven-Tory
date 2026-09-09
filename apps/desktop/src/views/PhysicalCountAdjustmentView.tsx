import React, { useEffect, useCallback, useState, useRef } from 'react';
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
  LinearGridEntry,
  GridFieldDef,
  SearchResultItem,
  DataTable,
} from '@invenTory/ui';
import type { ColumnDef } from '@invenTory/ui';

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
  const [countEntries, setCountEntries] = useState<CountEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedTransaction, setApprovedTransaction] = useState<InventoryTransaction | null>(null);

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [elevatedPermissionChecked, setElevatedPermissionChecked] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [allProducts, setAllProducts] = useState<SearchResultItem[]>([]);
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [nameToId, setNameToId] = useState<Map<string, string>>(new Map());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const loadAllProducts = async (): Promise<void> => {
      try {
        const { getProducts } = await import('../services/tauriProductService');
        const products = await getProducts();
        const active = products.filter((p) => p.is_active);

        const items: SearchResultItem[] = active.map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: `SKU: ${p.sku}${p.model ? ` • ${p.model}` : ''}`,
          detail: undefined,
        }));
        setAllProducts(items);

        const pMap = new Map<string, Product>();
        const nMap = new Map<string, string>();
        active.forEach((p) => {
          pMap.set(p.id, p);
          nMap.set(p.name, p.id);
        });
        setProductMap(pMap);
        setNameToId(nMap);
      } catch {
        // Silently fail — FTS5 search will still work
      }
    };
    void loadAllProducts();
  }, []);

  const handleSearch = useCallback(
    (query: string, _rowIndex: number): void => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      const q = query.trim().toLowerCase();
      if (!q) {
        setSearchResults([]);
        return;
      }

      // Instant local filter
      const localMatches = allProducts.filter(
        (p) =>
          p.label.toLowerCase().includes(q) || (p.subtitle && p.subtitle.toLowerCase().includes(q)),
      );
      setSearchResults(localMatches);

      // Debounced FTS5 backend search
      searchTimerRef.current = setTimeout((): void => {
        void (async (): Promise<void> => {
          try {
            const results = await searchProductsFts5(query);
            const mapped = results
              .filter((p) => p.is_active)
              .map((p) => ({
                id: p.id,
                label: p.name,
                subtitle: `SKU: ${p.sku}${p.model ? ` • ${p.model}` : ''}`,
                detail: undefined,
              })) as SearchResultItem[];
            setSearchResults(mapped);

            setProductMap((prev) => {
              const next = new Map(prev);
              results.forEach((p) => next.set(p.id, p));
              return next;
            });
            setNameToId((prev) => {
              const next = new Map(prev);
              results.forEach((p) => next.set(p.name, p.id));
              return next;
            });
          } catch {
            // localMatches already shown
          }
        })();
      }, 100);
    },
    [allProducts],
  );

  const handleBarcodeScan = useCallback((barcode: string, _rowIndex: number): void => {
    if (!barcode.trim()) return;
    void (async (): Promise<void> => {
      try {
        const results = await searchProductsFts5(barcode);
        const exact = results.find((p) => p.barcode === barcode || p.sku === barcode);
        if (exact) {
          setSearchResults([
            {
              id: exact.id,
              label: exact.name,
              subtitle: exact.model ?? undefined,
              detail: undefined,
            },
          ]);
        }
      } catch {
        // Ignore scan errors
      }
    })();
  }, []);

  const handleCountCommit = useCallback(
    async (row: { id: string; values: Record<string, string | number> }, _rowIndex: number) => {
      if (!selectedStoreId) {
        setError('Please select a store');
        return;
      }

      const productName = String(row.values.product ?? '').trim();
      if (!productName) {
        setError('Please select a product');
        return;
      }

      // Resolve product: prefer product_id set by handleSearchSelect, fall back
      // to name lookup (same pattern as ReceiveStockView / SaleStockView).
      const productId = String(row.values.product_id ?? '') || (nameToId.get(productName) ?? '');
      const product = productMap.get(productId);
      if (!product) {
        setError(`Product "${productName}" not found — please search and select from the list`);
        return;
      }

      const countedQty = Number(row.values.countedQty ?? 0);

      let systemQty = 0;
      try {
        const bal = await getStockBalance(selectedStoreId, product.id);
        systemQty = bal.quantity;
      } catch {
        systemQty = 0;
      }

      const entry: CountEntry = {
        id: row.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        systemQty,
        countedQty,
        variance: countedQty - systemQty,
        timestamp: new Date().toLocaleString(),
      };

      setCountEntries((prev) => [...prev, entry]);
    },
    [selectedStoreId, productMap, nameToId],
  );

  const handleVoidCount = useCallback((rowId: string, _rowIndex: number) => {
    setCountEntries((prev) => prev.filter((entry) => entry.id !== rowId));
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
            onClick={() => handleVoidCount(row.id, 0)}
            data-testid={`void-count-${row.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const countFields: GridFieldDef[] = [
    {
      id: 'product',
      type: 'text',
      label: 'Product',
      required: true,
      placeholder: 'Search by name or SKU...',
    },
    {
      id: 'countedQty',
      type: 'number',
      label: 'Counted Qty',
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

        {/* Store selector — visible and user-controlled, same pattern as other views */}
        {stores.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              htmlFor="count-store-select"
              style={{ fontSize: '13px', color: 'var(--it-text-secondary)', whiteSpace: 'nowrap' }}
            >
              Store:
            </label>
            <select
              id="count-store-select"
              data-testid="store-select"
              value={selectedStoreId}
              onChange={(e) => {
                setSelectedStoreId(e.target.value);
                // Clear any existing count entries when the store changes —
                // system quantities would be wrong for the new store.
                setCountEntries([]);
                setSearchResults([]);
                setError(null);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--it-r-md)',
                border: '1px solid var(--it-border)',
                backgroundColor: 'var(--it-card)',
                color: 'var(--it-text-primary)',
                fontSize: '13px',
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
            <div className="view-header" style={{ marginBottom: '16px' }}>
              <div>
                <h2 className="view-title">Step 1 — Enter Physical Count</h2>
                <p className="view-subtitle">
                  Scan or type products, enter counted quantity, press Enter to add to sheet
                </p>
              </div>
            </div>

            <LinearGridEntry
              dataTestid="count-session-grid"
              fields={countFields}
              onCommitRow={handleCountCommit}
              onSearch={handleSearch}
              onBarcodeScan={handleBarcodeScan}
              searchResults={searchResults}
              allItems={allProducts}
              initialRowCount={5}
              fieldTestIds={{
                product: 'field-product',
                countedQty: 'field-countedQty',
              }}
            />

            <h3
              style={{
                marginTop: '24px',
                marginBottom: '12px',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--it-text-primary)',
              }}
            >
              Count Sheet
            </h3>

            <DataTable<CountEntry>
              columns={countColumns}
              rows={countEntries}
              rowKey={(row) => row.id}
              emptySlot={
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
              data-testid="count-sheet-table"
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
