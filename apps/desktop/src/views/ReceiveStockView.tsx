import React, { useState, useEffect } from 'react';
import { Package, Check, AlertCircle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { searchProductsFts5 } from '../services/tauriProductService';
import { receiveStock } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { CreateTransactionInput } from '../types/transaction';
import { LinearEntryForm, FieldDef, SearchResultItem, Button } from '@inven-tory/ui';
import type { ColumnDef } from '@inven-tory/ui';

interface EntryLogItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  referenceNumber: string | null;
  supplier: string | null;
  timestamp: string;
}

export const ReceiveStockView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [showEntryLog, setShowEntryLog] = useState<boolean>(true);
  const [entryLog, setEntryLog] = useState<EntryLogItem[]>([]);

  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [sessionDeviceId, setSessionDeviceId] = useState<string>('');

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
    loadStores();
  }, []);

  const loadCurrentStock = async (_storeId: string, _product: Product): Promise<void> => {
    // Stock balance is loaded server-side; local projection is sufficient for flow.
  };

  const handleCommit = async (values: Record<string, string | number>): Promise<void> => {
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
    const qty = Number(values.quantity ?? 1);
    if (qty <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }

    try {
      const userId = sessionUserId || 'USER-LOCAL';
      const deviceId = sessionDeviceId || 'SINGLE-USER-DEVICE';

      const input: CreateTransactionInput = {
        store_id: selectedStoreId,
        product_id: selectedProduct.id,
        movement_type: 'RECEIPT',
        quantity: qty,
        reference_number: (values.reference_number as string) || undefined,
        supplier: (values.supplier as string) || undefined,
        user_id: userId,
        device_id: deviceId,
      };

      await receiveStock(input);
      setSuccess(true);

      setEntryLog((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          quantity: input.quantity,
          referenceNumber: input.reference_number || null,
          supplier: input.supplier || null,
          timestamp: new Date().toLocaleString(),
        },
      ]);

      if (selectedProduct && selectedStoreId) {
        await loadCurrentStock(selectedStoreId, selectedProduct);
      }

      setSelectedProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleProductSearch = async (query: string): Promise<void> => {
    if (!query.trim()) {
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
          product: p,
        })) as SearchResultItem[];
      setSearchResults(mapped);
    } catch {
      // silently fail
    }
  };

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const handleProductSelect = (item: SearchResultItem): void => {
    const product = item.product as unknown as Product;
    if (!product) return;
    setSelectedProduct(product);
    if (selectedStoreId) {
      loadCurrentStock(selectedStoreId, product);
    }
  };

  const removeEntry = (id: string): void => {
    setEntryLog((prev) => prev.filter((e) => e.id !== id));
  };

  const fields: FieldDef[] = [
    {
      id: 'store',
      type: 'select',
      label: 'Store',
      required: true,
      defaultValue: selectedStoreId || '',
      options: stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      id: 'product',
      type: 'text',
      label: 'Product',
      required: true,
      placeholder: selectedProduct ? selectedProduct.name : 'Search by name, SKU, barcode...',
      defaultValue: selectedProduct ? selectedProduct.name : '',
    },
    {
      id: 'quantity',
      type: 'number',
      label: 'Quantity',
      required: true,
      defaultValue: 1,
      min: 1,
    },
    {
      id: 'reference_number',
      type: 'text',
      label: 'Receipt / Reference Number',
      defaultValue: '',
    },
    {
      id: 'supplier',
      type: 'text',
      label: 'Supplier (Optional)',
      defaultValue: '',
    },
  ];

  const columns: ColumnDef<EntryLogItem>[] = [
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
      key: 'quantity',
      header: 'Qty',
      numeric: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', fontWeight: 600 }}>+{row.quantity}</span>
      ),
    },
    {
      key: 'referenceNumber',
      header: 'Reference',
      render: (row) => row.referenceNumber || '—',
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (row) => row.supplier || '—',
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
            onClick={() => removeEntry(row.id)}
            data-testid={`void-entry-${row.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div
      className="receive-stock-view"
      data-testid="receive-stock-view"
      style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 60%', minWidth: '320px' }}>
        <div className="view-header">
          <div>
            <h2 className="view-title">Receive Stock</h2>
            <p className="view-subtitle">Record incoming inventory (FR-MOV-001, Section 13.1)</p>
          </div>
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
            <Package
              size={48}
              style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }}
            />
            <h3 style={{ marginBottom: '8px' }}>No stores configured</h3>
            <p style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }}>
              Create a store location first to record stock movements.
            </p>
          </div>
        ) : (
          <LinearEntryForm
            dataTestid="receive-stock-form"
            fields={fields}
            onCommit={handleCommit}
            searchResults={searchResults}
            onSearch={handleProductSearch}
            onSearchSelect={handleProductSelect}
            sessionTableTitle="Entry Log"
            sessionTableColumns={columns}
            sessionTableRows={entryLog}
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
        )}
      </div>
    </div>
  );
};
