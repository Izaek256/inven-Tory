import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  CheckCircle,
  AlertTriangle,
  XCircle,
  PlusCircle,
  List,
  RefreshCw,
} from 'lucide-react';
import { Store } from '../types/store';
import { Product } from '../types/product';
import { Transfer, TransferStatus } from '../types/transfer';
import { getStores } from '../services/tauriStoreService';
import { searchProducts } from '../services/tauriProductService';
import { getStockBalance } from '../services/tauriTransactionService';
import {
  getTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  markTransferException,
} from '../services/tauriTransferService';
import {
  Button,
  Badge,
  DataTable,
  EmptyState,
  TextInput,
  NumericInput,
  Select,
  ColumnDef,
} from '@inven-tory/ui';

export const TransferStockView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('list');

  // Auth: resolve user/device from the active session instead of hardcoded values.
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
        // device_id is stored separately in the secure store
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

  // Master Data
  const [stores, setStores] = useState<Store[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [sourceStoreId, setSourceStoreId] = useState<string>('');
  const [destinationStoreId, setDestinationStoreId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [matchingProducts, setMatchingProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sourceStock, setSourceStock] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Filter State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Load stores and transfer history
  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedStores, fetchedTransfers] = await Promise.all([getStores(), getTransfers()]);
      setStores(fetchedStores);
      setTransfers(fetchedTransfers);

      if (fetchedStores.length >= 2) {
        if (!sourceStoreId) setSourceStoreId(fetchedStores[0].id);
        if (!destinationStoreId) setDestinationStoreId(fetchedStores[1].id);
      } else if (fetchedStores.length === 1) {
        if (!sourceStoreId) setSourceStoreId(fetchedStores[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [destinationStoreId, sourceStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Product search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatchingProducts([]);
      return;
    }

    let isMounted = true;
    const search = async (): Promise<void> => {
      try {
        const results = await searchProducts(searchQuery);
        if (isMounted) {
          setMatchingProducts(results);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TransferStockView] Search error:', err);
      }
    };

    const timer = setTimeout(search, 200);
    return (): void => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Fetch available stock balance when source store or product changes
  useEffect(() => {
    if (!sourceStoreId || !selectedProduct) {
      setSourceStock(null);
      return;
    }

    let isMounted = true;
    const fetchBalance = async (): Promise<void> => {
      try {
        const balanceObj = await getStockBalance(sourceStoreId, selectedProduct.id);
        if (isMounted) {
          setSourceStock(balanceObj.quantity);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TransferStockView] Error fetching stock balance:', err);
      }
    };

    fetchBalance();
    return (): void => {
      isMounted = false;
    };
  }, [sourceStoreId, selectedProduct]);

  const handleSelectProduct = (product: Product): void => {
    setSelectedProduct(product);
    setSearchQuery(`${product.name} (${product.sku})`);
    setMatchingProducts([]);
  };

  const handleCreateTransfer = async (shouldDispatch: boolean = false): Promise<void> => {
    setError(null);
    setSuccessMessage(null);

    if (!sourceStoreId) {
      setError('Please select a source store.');
      return;
    }
    if (!destinationStoreId) {
      setError('Please select a destination store.');
      return;
    }
    if (sourceStoreId === destinationStoreId) {
      setError('Source store and destination store must be different.');
      return;
    }
    if (!selectedProduct) {
      setError('Please select a product to transfer.');
      return;
    }
    if (quantity <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (sourceStock !== null && quantity > sourceStock) {
      setError(
        `Insufficient stock at source store. Available: ${sourceStock}, requested: ${quantity}.`,
      );
      return;
    }
    setSubmitting(true);
    const userId = sessionUserId || 'USER-LOCAL';
    const deviceId = sessionDeviceId || 'SINGLE-USER-DEVICE';

    try {
      const created = await createTransfer({
        source_store_id: sourceStoreId,
        destination_store_id: destinationStoreId,
        product_id: selectedProduct.id,
        quantity,
        created_by_user_id: userId,
        notes: notes || undefined,
      });

      if (shouldDispatch) {
        await dispatchTransfer(created.id, userId, deviceId);
        setSuccessMessage(
          `Transfer ${created.id} created and dispatched! Source stock decreased by ${quantity}.`,
        );
      } else {
        setSuccessMessage(`Transfer ${created.id} created in DRAFT status.`);
      }

      // Reset form
      setSelectedProduct(null);
      setSearchQuery('');
      setQuantity(1);
      setNotes('');
      await fetchData();
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatch = async (transferId: string): Promise<void> => {
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    const userId = sessionUserId || 'USER-LOCAL';
    const deviceId = sessionDeviceId || 'SINGLE-USER-DEVICE';

    try {
      await dispatchTransfer(transferId, userId, deviceId);
      setSuccessMessage(`Transfer ${transferId} successfully dispatched!`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceive = async (transferId: string): Promise<void> => {
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    const userId = sessionUserId || 'USER-LOCAL';
    const deviceId = sessionDeviceId || 'SINGLE-USER-DEVICE';

    try {
      await receiveTransfer(transferId, userId, deviceId);
      setSuccessMessage(`Transfer ${transferId} receipt confirmed! Stock added to destination.`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (transferId: string): Promise<void> => {
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    if (!sessionUserId) {
      setError('User session not found. Please log in again.');
      setSubmitting(false);
      return;
    }
    try {
      await cancelTransfer(transferId, sessionUserId, sessionDeviceId);
      setSuccessMessage(`Transfer ${transferId} cancelled.`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleException = async (transferId: string): Promise<void> => {
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      await markTransferException(transferId, 'Flagged by operator');
      setSuccessMessage(`Transfer ${transferId} marked as EXCEPTION.`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTransfers = transfers.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  const getStatusBadge = (status: TransferStatus): React.ReactElement => {
    switch (status) {
      case 'DRAFT':
        return <Badge status="PENDING" label="DRAFT" />;
      case 'DISPATCHED':
        return <Badge status="SENT" label="DISPATCHED" />;
      case 'RECEIVED':
        return <Badge status="ACCEPTED" label="RECEIVED" />;
      case 'EXCEPTION':
        return <Badge status="VERY_STALE" label="EXCEPTION" />;
      case 'CANCELLED':
        return <Badge status="CANCELLED" label="CANCELLED" />;
      default:
        return <Badge status="PENDING" label={status} />;
    }
  };

  const getStoreName = (storeId: string): string => {
    const store = stores.find((s) => s.id === storeId);
    return store ? `${store.name} (${store.code})` : storeId;
  };

  const columns: ColumnDef<Transfer>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (t) => (
        <code style={{ fontFamily: 'var(--it-font-mono)', fontSize: '12px' }}>{t.id}</code>
      ),
      accessor: (t) => t.id,
    },
    {
      key: 'source',
      header: 'Source Store',
      render: (t) => getStoreName(t.source_store_id),
      accessor: (t) => getStoreName(t.source_store_id),
    },
    {
      key: 'destination',
      header: 'Destination Store',
      render: (t) => getStoreName(t.destination_store_id),
      accessor: (t) => getStoreName(t.destination_store_id),
    },
    {
      key: 'product',
      header: 'Product ID',
      render: (t) => (
        <code style={{ fontFamily: 'var(--it-font-mono)', fontSize: '12px' }}>{t.product_id}</code>
      ),
      accessor: (t) => t.product_id,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      numeric: true,
      render: (t) => <span style={{ fontWeight: 'bold' }}>{t.quantity}</span>,
      accessor: (t) => t.quantity,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => getStatusBadge(t.status),
      accessor: (t) => t.status,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (t) => t.notes || '—',
      accessor: (t) => t.notes,
    },
    {
      key: 'actions',
      header: 'Actions',
      numeric: true,
      render: (t) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {t.status === 'DRAFT' && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleDispatch(t.id)}
                data-testid={`btn-dispatch-${t.id}`}
              >
                <Send size={14} />
                <span>Dispatch</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleCancel(t.id)}
                data-testid={`btn-cancel-${t.id}`}
              >
                <XCircle size={14} />
                <span>Cancel</span>
              </Button>
            </>
          )}

          {t.status === 'DISPATCHED' && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleReceive(t.id)}
                data-testid={`btn-receive-${t.id}`}
              >
                <CheckCircle size={14} />
                <span>Confirm Receipt</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleException(t.id)}
                data-testid={`btn-exception-${t.id}`}
              >
                <AlertTriangle size={14} />
                <span>Flag Exception</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleCancel(t.id)}
                data-testid={`btn-cancel-${t.id}`}
              >
                <XCircle size={14} />
                <span>Cancel</span>
              </Button>
            </>
          )}

          {t.status === 'EXCEPTION' && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleReceive(t.id)}
                data-testid={`btn-receive-${t.id}`}
              >
                <CheckCircle size={14} />
                <span>Resolve & Receive</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={submitting}
                onClick={(): Promise<void> => handleCancel(t.id)}
                data-testid={`btn-cancel-${t.id}`}
              >
                <XCircle size={14} />
                <span>Cancel</span>
              </Button>
            </>
          )}

          {(t.status === 'RECEIVED' || t.status === 'CANCELLED') && (
            <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>Completed</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="view-container" data-testid="transfer-stock-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Inter-Store Stock Transfers</h2>
          <p className="view-subtitle">
            Move inventory between stores with linked transaction history (FR-MOV-004, Section 11,
            AT-005)
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={fetchData}
          disabled={loading}
          data-testid="btn-refresh"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="alert-error"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          className="it-toast it-toast--success"
          style={{ marginBottom: '16px' }}
          data-testid="alert-success"
        >
          <CheckCircle size={16} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* View Tabs */}
      <div className="view-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <Button
          variant={activeTab === 'list' ? 'primary' : 'secondary'}
          onClick={(): void => setActiveTab('list')}
          data-testid="tab-list"
        >
          <List size={16} />
          <span>Transfer List ({transfers.length})</span>
        </Button>
        <Button
          variant={activeTab === 'create' ? 'primary' : 'secondary'}
          onClick={(): void => setActiveTab('create')}
          data-testid="tab-create"
          disabled={stores.length < 2}
        >
          <PlusCircle size={16} />
          <span>New Transfer</span>
        </Button>
      </div>

      {/* Empty state for insufficient stores */}
      {stores.length < 2 && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Send size={48} style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '8px' }}>Transfers require at least 2 store locations</h3>
          <p style={{ color: 'var(--it-text-secondary)', marginBottom: '16px' }}>
            Create additional store locations to enable inter-store stock transfers.
          </p>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' && stores.length >= 2 && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '24px',
          }}
          data-testid="create-transfer-card"
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
            Create Inter-Store Transfer
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginTop: '16px',
            }}
          >
            {/* Source Store */}
            <Select
              id="source-store"
              data-testid="select-source-store"
              label="Source Store (Origin)"
              value={sourceStoreId}
              onChange={(e): void => setSourceStoreId(e.target.value)}
              options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />

            {/* Destination Store */}
            <Select
              id="destination-store"
              data-testid="select-destination-store"
              label="Destination Store (Target)"
              value={destinationStoreId}
              onChange={(e): void => setDestinationStoreId(e.target.value)}
              options={stores
                .filter((s) => s.id !== sourceStoreId)
                .map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />

            {/* Product Picker */}
            <div style={{ gridColumn: 'span 2', position: 'relative' }}>
              <TextInput
                id="product-search"
                data-testid="input-product-search"
                label="Product to Transfer"
                placeholder="Scan barcode or type SKU / Name..."
                value={searchQuery}
                onChange={(e): void => {
                  setSearchQuery(e.target.value);
                  if (selectedProduct) setSelectedProduct(null);
                }}
              />

              {matchingProducts.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--it-card)',
                    border: '1px solid var(--it-border)',
                    borderRadius: 'var(--it-r-md)',
                    zIndex: 10,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    boxShadow: 'var(--it-shadow-md)',
                    marginTop: '4px',
                  }}
                  data-testid="product-search-results"
                >
                  {matchingProducts.map((prod) => (
                    <div
                      key={prod.id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--it-border)',
                      }}
                      onClick={(): void => handleSelectProduct(prod)}
                      data-testid={`product-option-${prod.id}`}
                    >
                      <strong>{prod.name}</strong> ({prod.sku}) — Category: {prod.category}
                    </div>
                  ))}
                </div>
              )}

              {selectedProduct && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--it-green-text)' }}>
                  Selected: <strong>{selectedProduct.name}</strong> ({selectedProduct.sku})
                  {sourceStock !== null && (
                    <span
                      style={{
                        marginLeft: '12px',
                        fontWeight: 600,
                        fontFamily: 'var(--it-font-mono)',
                      }}
                    >
                      | Stock Available at Source: {sourceStock} {selectedProduct.unit}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quantity */}
            <NumericInput
              id="transfer-quantity"
              data-testid="input-quantity"
              label="Quantity to Transfer"
              value={quantity}
              min={1}
              onChange={(v) => setQuantity(Math.max(1, v))}
            />

            {/* Notes */}
            <TextInput
              id="transfer-notes"
              data-testid="input-notes"
              label="Transfer Notes / Reason (Optional)"
              placeholder="e.g. Inter-store stock rebalance"
              value={notes}
              onChange={(e): void => setNotes(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={(): Promise<void> => handleCreateTransfer(false)}
              data-testid="btn-create-draft"
            >
              <PlusCircle size={16} />
              <span>Save as Draft</span>
            </Button>
            <Button
              variant="primary"
              disabled={submitting}
              onClick={(): Promise<void> => handleCreateTransfer(true)}
              data-testid="btn-create-dispatch"
            >
              <Send size={16} />
              <span>Create & Dispatch</span>
            </Button>
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {activeTab === 'list' && (
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '24px',
          }}
          data-testid="transfer-list-card"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
              Transfers
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Select
                id="filter-status"
                data-testid="select-filter-status"
                label="Filter Status:"
                value={statusFilter}
                onChange={(e): void => setStatusFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'DRAFT', label: 'DRAFT' },
                  { value: 'DISPATCHED', label: 'DISPATCHED' },
                  { value: 'RECEIVED', label: 'RECEIVED' },
                  { value: 'EXCEPTION', label: 'EXCEPTION' },
                  { value: 'CANCELLED', label: 'CANCELLED' },
                ]}
              />
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <div data-testid="empty-transfers-message">
              <EmptyState
                heading="No transfers found"
                body="No transfers match the selected filter criteria."
              />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={filteredTransfers}
              rowKey={(t) => t.id}
              data-testid="transfers-table"
            />
          )}
        </div>
      )}
    </div>
  );
};
