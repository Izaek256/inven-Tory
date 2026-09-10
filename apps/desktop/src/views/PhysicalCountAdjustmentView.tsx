import React, { useEffect, useCallback, useState, useRef } from 'react';
import { ClipboardList, Check, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import { searchProductsFts5 } from '../services/tauriProductService';
import { getStockBalance, adjustStock } from '../services/tauriTransactionService';
import { Product } from '../types/product';
import { AdjustStockInput } from '../types/transaction';
import { Button, LinearGridEntry, GridFieldDef, SearchResultItem, DataTable } from '@invenTory/ui';
import type { ColumnDef } from '@invenTory/ui';
import { useActiveStore } from '../context/StoreContext';

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

// Inline variance cell — colour-coded, no extra text
function VarianceCell({ delta }: { delta: number }): React.ReactElement {
  if (delta === 0)
    return (
      <span
        style={{ color: 'var(--it-text-secondary)', fontFamily: 'var(--it-font-mono)' }}
        data-testid="variance-display"
      >
        0
      </span>
    );
  if (delta > 0)
    return (
      <span
        style={{
          color: 'var(--it-green-text)',
          fontWeight: 700,
          fontFamily: 'var(--it-font-mono)',
        }}
        data-testid="variance-display"
      >
        +{delta}
      </span>
    );
  return (
    <span
      style={{ color: 'var(--it-red-text)', fontWeight: 700, fontFamily: 'var(--it-font-mono)' }}
      data-testid="variance-display"
    >
      {delta}
    </span>
  );
}

export const PhysicalCountAdjustmentView: React.FC<PhysicalCountAdjustmentViewProps> = () => {
  const { activeStoreId } = useActiveStore();
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

  const [countEntries, setCountEntries] = useState<CountEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Per-row submitting indicator (rowId → true while adjustStock is in flight)
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  // allProducts includes current qty in the detail badge
  const [allProducts, setAllProducts] = useState<SearchResultItem[]>([]);
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [nameToId, setNameToId] = useState<Map<string, string>>(new Map());
  // Live qty cache for the currently selected store (productId → qty)
  const [storeQtyCache, setStoreQtyCache] = useState<Map<string, number>>(new Map());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Products + per-store qty for search panel ─────────────────────────────

  const loadProductsWithQty = useCallback(async (storeId: string): Promise<void> => {
    try {
      const { getProducts } = await import('../services/tauriProductService');
      const products = await getProducts();
      const active = products.filter((p) => p.is_active);

      // Fetch qty for every product in parallel (best-effort)
      const qtyEntries = await Promise.all(
        active.map(async (p) => {
          try {
            const bal = await getStockBalance(storeId, p.id);
            return [p.id, bal.quantity] as const;
          } catch {
            return [p.id, 0] as const;
          }
        }),
      );
      const qtyMap = new Map(qtyEntries);
      setStoreQtyCache(qtyMap);

      const items: SearchResultItem[] = active.map((p) => ({
        id: p.id,
        label: p.name,
        subtitle: `SKU: ${p.sku}${p.model ? ` • ${p.model}` : ''}`,
        detail: `Qty: ${qtyMap.get(p.id) ?? 0}`,
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
      // FTS5 search still works without preloaded list
    }
  }, []);

  useEffect(() => {
    if (activeStoreId) {
      void loadProductsWithQty(activeStoreId);
    }
  }, [activeStoreId, loadProductsWithQty]);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(
    (query: string, _rowIndex: number): void => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      const q = query.trim().toLowerCase();
      if (!q) {
        setSearchResults([]);
        return;
      }

      // Instant local filter (includes qty badge)
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
                detail: `Qty: ${storeQtyCache.get(p.id) ?? 0}`,
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
    [allProducts, storeQtyCache],
  );

  const handleBarcodeScan = useCallback(
    (barcode: string, _rowIndex: number): void => {
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
                subtitle: `SKU: ${exact.sku}`,
                detail: `Qty: ${storeQtyCache.get(exact.id) ?? 0}`,
              },
            ]);
          }
        } catch {
          // ignore
        }
      })();
    },
    [storeQtyCache],
  );

  // ── Row commit — immediately applies ADJUSTMENT to stock ──────────────────

  const handleCountCommit = useCallback(
    async (row: { id: string; values: Record<string, string | number> }, _rowIndex: number) => {
      setError(null);

      if (!activeStoreId) {
        setError('Please select a store from the header.');
        return;
      }

      const productName = String(row.values.product ?? '').trim();
      if (!productName) {
        setError('Please select a product.');
        return;
      }

      const productId = String(row.values.product_id ?? '') || (nameToId.get(productName) ?? '');
      const product = productMap.get(productId);
      if (!product) {
        setError(`Product "${productName}" not found — search and select from the list.`);
        return;
      }

      const countedQty = Number(row.values.countedQty ?? 0);

      // Fetch live system qty at the moment of commit
      let systemQty = storeQtyCache.get(product.id) ?? 0;
      try {
        const bal = await getStockBalance(activeStoreId, product.id);
        systemQty = bal.quantity;
      } catch {
        // use cache
      }

      const variance = countedQty - systemQty;

      // Only write an ADJUSTMENT transaction when there is a real discrepancy.
      // Zero-variance counts are still logged in the sheet for audit trail.
      if (variance !== 0) {
        setSubmittingIds((prev) => new Set(prev).add(row.id));
        try {
          const input: AdjustStockInput = {
            store_id: activeStoreId,
            product_id: product.id,
            quantity_delta: variance,
            reason: `Physical count: system ${systemQty}, counted ${countedQty}`,
            user_id: sessionUserId || 'USER-LOCAL',
            device_id: sessionDeviceId || 'SINGLE-USER-DEVICE',
            count_reference: `COUNT-${activeStoreId}-${Date.now()}`,
          };
          await adjustStock(input);

          // Update the local qty cache so subsequent searches show the new qty
          setStoreQtyCache((prev) => {
            const next = new Map(prev);
            next.set(product.id, countedQty);
            return next;
          });
          // Refresh search panel badges
          setAllProducts((prev) =>
            prev.map((p) => (p.id === product.id ? { ...p, detail: `Qty: ${countedQty}` } : p)),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setSubmittingIds((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
          return;
        } finally {
          setSubmittingIds((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }
      }

      const entry: CountEntry = {
        id: row.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        systemQty,
        countedQty,
        variance,
        timestamp: new Date().toLocaleString(),
      };

      setCountEntries((prev) => [...prev, entry]);
    },
    [activeStoreId, productMap, nameToId, storeQtyCache, sessionUserId, sessionDeviceId],
  );

  const handleVoidCount = useCallback((rowId: string) => {
    setCountEntries((prev) => prev.filter((e) => e.id !== rowId));
  }, []);

  const handleReset = (): void => {
    setCountEntries([]);
    setSearchResults([]);
    setError(null);
  };

  // ── Grid fields — Product + Counted Qty only ──────────────────────────────

  const countFields: GridFieldDef[] = [
    {
      id: 'product',
      type: 'text',
      label: 'Product',
      required: true,
      placeholder: 'Search by name, SKU or scan barcode…',
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

  // ── Count sheet columns ───────────────────────────────────────────────────

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
            {row.sku}
          </div>
        </div>
      ),
    },
    {
      key: 'systemQty',
      header: 'System',
      numeric: true,
      render: (row) => <span style={{ fontFamily: 'var(--it-font-mono)' }}>{row.systemQty}</span>,
    },
    {
      key: 'countedQty',
      header: 'Counted',
      numeric: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', fontWeight: 600 }}>{row.countedQty}</span>
      ),
    },
    {
      key: 'variance',
      header: 'Variance',
      numeric: true,
      render: (row) => <VarianceCell delta={row.variance} />,
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
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          title="Remove from sheet"
          onClick={() => handleVoidCount(row.id)}
          data-testid={`void-count-${row.id}`}
        >
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const isSubmitting = submittingIds.size > 0;

  return (
    <div
      className="view-container"
      data-testid="physical-count-view"
      style={{ maxWidth: '1040px' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ClipboardList size={28} color="var(--it-green)" />
          <div>
            <h2 className="view-title">Physical Count &amp; Adjustment</h2>
            <p className="view-subtitle">
              Count stock, press Enter — adjustments are applied immediately
            </p>
          </div>
        </div>
      </div>

      {/* ── Step indicator removed — single step now ─────────────────────── */}
      <div data-testid="step-indicator" style={{ display: 'none' }} />

      {/* ── Error banner ────────────────────────────────────────────────── */}
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

      {/* ── Single-step count panel ──────────────────────────────────────── */}
      <div data-testid="count-session-panel">
        <LinearGridEntry
          dataTestid="count-session-grid"
          fields={countFields}
          onCommitRow={handleCountCommit}
          onSearch={handleSearch}
          onBarcodeScan={handleBarcodeScan}
          searchResults={searchResults}
          allItems={allProducts}
          initialRowCount={8}
          fieldTestIds={{
            product: 'field-product',
            countedQty: 'field-countedQty',
          }}
        />

        {/* Submitting indicator */}
        {isSubmitting && (
          <p style={{ fontSize: '12px', color: 'var(--it-text-secondary)', marginTop: '6px' }}>
            Applying adjustment…
          </p>
        )}

        {/* ── Count sheet ─────────────────────────────────────────────── */}
        {countEntries.length > 0 && (
          <>
            <div
              style={{
                marginTop: '24px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Count Sheet ({countEntries.length} lines)
              </h3>
              <Button variant="ghost" size="sm" onClick={handleReset} data-testid="new-count-btn">
                <RotateCcw size={14} />
                <span>Clear</span>
              </Button>
            </div>

            <DataTable<CountEntry>
              columns={countColumns}
              rows={countEntries}
              rowKey={(row) => row.id}
              emptySlot={null}
              data-testid="count-sheet-table"
            />

            {/* Summary row */}
            {countEntries.length > 0 && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  backgroundColor: 'var(--it-surface)',
                  border: '1px solid var(--it-border)',
                  borderRadius: 'var(--it-r-md)',
                  display: 'flex',
                  gap: '24px',
                  fontSize: '13px',
                  flexWrap: 'wrap',
                }}
                data-testid="count-summary"
              >
                <span>
                  <strong>{countEntries.length}</strong> products counted
                </span>
                <span>
                  Adjustments applied:{' '}
                  <strong style={{ color: 'var(--it-green-text)' }}>
                    {countEntries.filter((e) => e.variance !== 0).length}
                  </strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} color="var(--it-green)" />
                  <span style={{ color: 'var(--it-green-text)', fontWeight: 600 }}>
                    All adjustments saved to stock &amp; day book
                  </span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PhysicalCountAdjustmentView;
