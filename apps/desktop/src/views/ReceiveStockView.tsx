import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProductsFts5, getProducts } from '../services/tauriProductService';
import {
  receiveStock,
  updateTransaction,
  deleteTransaction,
} from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';
import { LinearGridEntry, GridFieldDef, GridRow, SearchResultItem, Button } from '@invenTory/ui';

// ─── Entry log ─────────────────────────────────────────────────────────────────

interface EntryLogItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  supplier: string | null;
  referenceNumber: string | null;
  timestamp: string;
}

// ─── Grid field definitions ───────────────────────────────────────────────────
// Column order: Product → Qty → Supplier → Receipt No.

const FIELDS: GridFieldDef[] = [
  {
    id: 'product',
    type: 'text',
    label: 'Product',
    placeholder: 'Scan or type product…',
    required: true,
  },
  {
    id: 'quantity',
    type: 'number',
    label: 'Qty',
    defaultValue: 1,
    min: 1,
    required: true,
  },
  {
    id: 'supplier',
    type: 'text',
    label: 'Supplier',
    placeholder: 'Optional',
  },
  {
    id: 'reference_number',
    type: 'text',
    label: 'Receipt No.',
    placeholder: 'Optional',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const ReceiveStockView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [showEntryLog, setShowEntryLog] = useState<boolean>(true);
  const [entryLog, setEntryLog] = useState<EntryLogItem[]>([]);

  // Right-panel state
  const [allProducts, setAllProducts] = useState<SearchResultItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  // Product lookup maps
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [nameToId, setNameToId] = useState<Map<string, string>>(new Map());

  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [sessionDeviceId, setSessionDeviceId] = useState<string>('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grid row ID → committed transaction_id (for edit/delete lookup)
  const [committedTxnIds, setCommittedTxnIds] = useState<Map<string, string>>(new Map());

  // ── Session ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const { getSession } = await import('../services/tauriAuthService');
        const s = await getSession();
        if (s && s.user_id !== undefined && s.user_id !== null && String(s.user_id).trim() !== '') {
          setSessionUserId(String(s.user_id));
        } else if (s && s.username) {
          setSessionUserId(s.username);
        } else {
          setSessionUserId('USER-LOCAL');
        }
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

  // ── Stores ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        setStores(data.filter((s) => s.is_active));
        if (data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      } catch (_err) {
        setError('Failed to load stores');
      }
    };
    void loadStores();
  }, []);

  // ── All products (right-panel default) ───────────────────────────────────

  useEffect(() => {
    const loadAllProducts = async (): Promise<void> => {
      try {
        const products = await getProducts();
        const active = products.filter((p) => p.is_active);

        const items: SearchResultItem[] = active.map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: p.model ?? undefined,
          detail:
            p.stock_quantity !== null && p.stock_quantity !== undefined
              ? `Qty: ${p.stock_quantity}`
              : undefined,
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

  // ── Live search (instant local filter + 100 ms debounced backend FTS5) ─────

  const handleProductSearch = useCallback(
    (query: string, _rowIndex: number): void => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      const q = query.trim().toLowerCase();
      if (!q) {
        setSearchResults([]);
        return;
      }

      // 1. Instant local filter on every keystroke
      const localMatches = allProducts.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          (p.subtitle && p.subtitle.toLowerCase().includes(q)) ||
          (p.detail && p.detail.toLowerCase().includes(q)),
      );
      setSearchResults(localMatches);

      // 2. Debounced backend search for authoritative SQLite DB results
      searchTimerRef.current = setTimeout(async () => {
        try {
          const results = await searchProductsFts5(query);
          setSearchResults(
            results.map((p) => ({
              id: p.id,
              label: p.name,
              subtitle: p.model ?? undefined,
              detail:
                p.stock_quantity !== null && p.stock_quantity !== undefined
                  ? `Qty: ${p.stock_quantity}`
                  : undefined,
            })),
          );

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
          // If backend fails, localMatches is already rendered
        }
      }, 100);
    },
    [allProducts],
  );

  // ── Barcode scan ─────────────────────────────────────────────────────────

  const handleBarcodeScan = useCallback(
    async (barcode: string, _rowIndex: number): Promise<void> => {
      if (!barcode.trim()) return;
      try {
        const results = await searchProductsFts5(barcode);
        const exact = results.find((p) => p.barcode === barcode || p.sku === barcode);
        if (exact) {
          setSearchResults([
            {
              id: exact.id,
              label: exact.name,
              subtitle: exact.model ?? undefined,
              detail:
                exact.stock_quantity !== null && exact.stock_quantity !== undefined
                  ? `Qty: ${exact.stock_quantity}`
                  : undefined,
            },
          ]);
        }
      } catch {
        // Ignore scan errors
      }
    },
    [],
  );

  // ── Row commit ────────────────────────────────────────────────────────────

  const handleCommitRow = useCallback(
    async (row: GridRow, _rowIndex: number): Promise<void> => {
      setError(null);
      setSuccess(false);

      if (!selectedStoreId) {
        setError('Please select a store');
        return;
      }

      const productName = String(row.values.product ?? '').trim();
      if (!productName) {
        setError('Please select a product');
        return;
      }

      const productId = nameToId.get(productName) ?? String(row.values.product_id ?? '');
      const product = productMap.get(productId);
      if (!product) {
        setError(`Product "${productName}" not found — please search and select from the panel`);
        return;
      }

      const qty = Number(row.values.quantity ?? 1);
      if (qty <= 0) {
        setError('Quantity must be greater than 0');
        return;
      }

      const input: CreateTransactionInput = {
        store_id: selectedStoreId,
        product_id: product.id,
        movement_type: 'RECEIPT',
        quantity: qty,
        reference_number: String(row.values.reference_number ?? '').trim() || undefined,
        supplier: String(row.values.supplier ?? '').trim() || undefined,
        user_id: sessionUserId,
        device_id: sessionDeviceId,
      };

      try {
        const result = await receiveStock(input);
        setSuccess(true);

        setCommittedTxnIds((prev) => new Map(prev).set(row.id, result.transaction_id));

        setEntryLog((prev) => [
          {
            id: row.id,
            productName: product.name,
            sku: product.sku,
            quantity: qty,
            supplier: input.supplier ?? null,
            referenceNumber: input.reference_number ?? null,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);

        // Optimistically update qty in allProducts panel
        setAllProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  detail: `Qty: ${(product.stock_quantity ?? 0) + qty}`,
                }
              : p,
          ),
        );
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
        setSuccess(false);
      }
    },
    [selectedStoreId, productMap, nameToId, sessionUserId, sessionDeviceId, setCommittedTxnIds],
  );

  // ── Edit / Delete handlers (row-level) ───────────────────────────────────

  const handleEditRow = useCallback(
    async (rowId: string, newValues: Record<string, string | number>): Promise<void> => {
      const transactionId = committedTxnIds.get(rowId);
      if (!transactionId) {
        setError('Transaction not found for this row');
        return;
      }

      setError(null);
      setSuccess(false);

      try {
        const qty = Number(newValues.quantity ?? 1);
        await updateTransaction({
          transaction_id: transactionId,
          quantity_delta: qty, // RECEIPT: positive delta
          reference_number: String(newValues.reference_number ?? '').trim() || null,
          reason_code: String(newValues.supplier ?? '').trim() || null,
        });
        setSuccess(true);

        setEntryLog((prev) =>
          prev.map((item) =>
            item.id === rowId
              ? {
                  ...item,
                  quantity: qty,
                  supplier: String(newValues.supplier ?? '').trim() || null,
                  referenceNumber: String(newValues.reference_number ?? '').trim() || null,
                  timestamp: new Date().toLocaleTimeString(),
                }
              : item,
          ),
        );
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      }
    },
    [committedTxnIds],
  );

  const handleDeleteRow = useCallback(
    async (rowId: string): Promise<void> => {
      const transactionId = committedTxnIds.get(rowId);
      if (!transactionId) {
        setError('Transaction not found for this row');
        return;
      }

      try {
        await deleteTransaction(transactionId);
        setEntryLog((prev) => prev.filter((item) => item.id !== rowId));
        setCommittedTxnIds((prev) => {
          const next = new Map(prev);
          next.delete(rowId);
          return next;
        });
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      }
    },
    [committedTxnIds],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="receive-stock-view" data-testid="receive-stock-view">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Receive Stock</h2>
          <p className="view-subtitle">Record incoming inventory (FR-MOV-001, Section 13.1)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            data-testid="store-select"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowEntryLog(!showEntryLog)}
            data-testid="toggle-entry-log"
          >
            {showEntryLog ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>{showEntryLog ? 'Hide Log' : 'Show Log'}</span>
          </Button>
        </div>
      </div>

      {/* Toasts */}
      {success && (
        <div className="it-toast it-toast--success" style={{ marginBottom: '16px' }}>
          <Check size={16} aria-hidden="true" />
          <span>Stock received successfully. Transaction recorded and balance updated.</span>
        </div>
      )}

      {error && (
        <div
          className="it-toast it-toast--error"
          data-testid="receive-error-banner"
          style={{ marginBottom: '16px' }}
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* No stores */}
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
        <>
          {/* ── Linear grid entry ──────────────────────────────────────── */}
          <LinearGridEntry
            fields={FIELDS}
            onCommitRow={handleCommitRow}
            onSearch={handleProductSearch}
            onBarcodeScan={handleBarcodeScan}
            searchResults={searchResults}
            allItems={allProducts}
            initialRowCount={9}
            dataTestid="receive-grid"
            onEditRow={handleEditRow}
            onDeleteRow={handleDeleteRow}
          />

          {/* ── Session entry log ──────────────────────────────────────── */}
          {showEntryLog && entryLog.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3
                style={{
                  marginBottom: '12px',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--it-text-primary)',
                }}
              >
                Entry Log
              </h3>
              <div
                style={{
                  border: '1px solid var(--it-border)',
                  borderRadius: 'var(--it-r-md)',
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--it-surface)',
                        borderBottom: '1px solid var(--it-border)',
                      }}
                    >
                      {['Product', 'SKU', 'Qty', 'Supplier', 'Receipt No.', 'Time'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 'var(--it-tracking-label)',
                            color: 'var(--it-text-secondary)',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entryLog.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--it-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{item.productName}</td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: 'var(--it-font-mono)',
                            fontSize: '12px',
                          }}
                        >
                          {item.sku}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: 'var(--it-font-mono)',
                            textAlign: 'right',
                          }}
                        >
                          {item.quantity}
                        </td>
                        <td style={{ padding: '8px 12px' }}>{item.supplier ?? '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{item.referenceNumber ?? '—'}</td>
                        <td
                          style={{
                            padding: '8px 12px',
                            color: 'var(--it-text-secondary)',
                            fontSize: '12px',
                          }}
                        >
                          {item.timestamp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
