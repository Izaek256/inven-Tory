import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  CheckCircle,
  AlertTriangle,
  XCircle,
  PlusCircle,
  List,
  RefreshCw,
  Search,
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

export const TransferStockView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('list');

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
    try {
      const created = await createTransfer({
        source_store_id: sourceStoreId,
        destination_store_id: destinationStoreId,
        product_id: selectedProduct.id,
        quantity,
        created_by_user_id: 'USER-DEMO',
        notes: notes || undefined,
      });

      if (shouldDispatch) {
        await dispatchTransfer(created.id, 'USER-DEMO', 'DEV-DEMO');
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
    try {
      await dispatchTransfer(transferId, 'USER-DEMO', 'DEV-DEMO');
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
    try {
      await receiveTransfer(transferId, 'USER-DEMO', 'DEV-DEMO');
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
    try {
      await cancelTransfer(transferId, 'USER-DEMO', 'DEV-DEMO');
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
        return <span className="badge badge-draft">DRAFT</span>;
      case 'DISPATCHED':
        return <span className="badge badge-dispatched">DISPATCHED</span>;
      case 'RECEIVED':
        return <span className="badge badge-received">RECEIVED</span>;
      case 'EXCEPTION':
        return <span className="badge badge-exception">EXCEPTION</span>;
      case 'CANCELLED':
        return <span className="badge badge-cancelled">CANCELLED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getStoreName = (storeId: string): string => {
    const store = stores.find((s) => s.id === storeId);
    return store ? `${store.name} (${store.code})` : storeId;
  };

  return (
    <div className="view-container" data-testid="transfer-stock-view">
      <div className="view-header">
        <div>
          <h2>Inter-Store Stock Transfers</h2>
          <p className="subtitle">
            Move inventory between stores with linked transaction history (FR-MOV-004, Section 11,
            AT-005)
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchData}
          disabled={loading}
          data-testid="btn-refresh"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error" data-testid="alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" data-testid="alert-success">
          <CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* View Tabs */}
      <div className="view-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={(): void => setActiveTab('list')}
          data-testid="tab-list"
        >
          <List size={16} />
          <span>Transfer List ({transfers.length})</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={(): void => setActiveTab('create')}
          data-testid="tab-create"
        >
          <PlusCircle size={16} />
          <span>New Transfer</span>
        </button>
      </div>

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <div className="card" style={{ padding: '20px' }} data-testid="create-transfer-card">
          <h3>Create Inter-Store Transfer</h3>
          <div
            className="form-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginTop: '16px',
            }}
          >
            {/* Source Store */}
            <div className="form-group">
              <label htmlFor="source-store">Source Store (Origin)</label>
              <select
                id="source-store"
                className="form-control"
                value={sourceStoreId}
                onChange={(e): void => setSourceStoreId(e.target.value)}
                data-testid="select-source-store"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Store */}
            <div className="form-group">
              <label htmlFor="destination-store">Destination Store (Target)</label>
              <select
                id="destination-store"
                className="form-control"
                value={destinationStoreId}
                onChange={(e): void => setDestinationStoreId(e.target.value)}
                data-testid="select-destination-store"
              >
                {stores
                  .filter((s) => s.id !== sourceStoreId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
              </select>
            </div>

            {/* Product Picker */}
            <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }}>
              <label htmlFor="product-search">Product to Transfer</label>
              <div className="search-input-wrapper" style={{ position: 'relative' }}>
                <input
                  id="product-search"
                  type="text"
                  className="form-control"
                  placeholder="Scan barcode or type SKU / Name..."
                  value={searchQuery}
                  onChange={(e): void => {
                    setSearchQuery(e.target.value);
                    if (selectedProduct) setSelectedProduct(null);
                  }}
                  data-testid="input-product-search"
                />
                <Search
                  size={18}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#666',
                  }}
                />
              </div>

              {matchingProducts.length > 0 && (
                <div
                  className="dropdown-menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    zIndex: 10,
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                  data-testid="product-search-results"
                >
                  {matchingProducts.map((prod) => (
                    <div
                      key={prod.id}
                      style={{ padding: '8px 12px', cursor: 'pointer' }}
                      onClick={(): void => handleSelectProduct(prod)}
                      data-testid={`product-option-${prod.id}`}
                    >
                      <strong>{prod.name}</strong> ({prod.sku}) — Category: {prod.category}
                    </div>
                  ))}
                </div>
              )}

              {selectedProduct && (
                <div style={{ marginTop: '6px', fontSize: '14px', color: '#059669' }}>
                  Selected: <strong>{selectedProduct.name}</strong> ({selectedProduct.sku})
                  {sourceStock !== null && (
                    <span style={{ marginLeft: '12px', fontWeight: 'bold' }}>
                      | Stock Available at Source: {sourceStock} {selectedProduct.unit}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="form-group">
              <label htmlFor="transfer-quantity">Quantity to Transfer</label>
              <input
                id="transfer-quantity"
                type="number"
                min="1"
                className="form-control"
                value={quantity}
                onChange={(e): void => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
                data-testid="input-quantity"
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="transfer-notes">Transfer Notes / Reason (Optional)</label>
              <input
                id="transfer-notes"
                type="text"
                className="form-control"
                placeholder="e.g. Inter-store stock rebalance"
                value={notes}
                onChange={(e): void => setNotes(e.target.value)}
                data-testid="input-notes"
              />
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={(): Promise<void> => handleCreateTransfer(false)}
              data-testid="btn-create-draft"
            >
              <PlusCircle size={16} />
              <span>Save as Draft</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={(): Promise<void> => handleCreateTransfer(true)}
              data-testid="btn-create-dispatch"
            >
              <Send size={16} />
              <span>Create & Dispatch</span>
            </button>
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {activeTab === 'list' && (
        <div className="card" style={{ padding: '20px' }} data-testid="transfer-list-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3>Transfers</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label htmlFor="filter-status" style={{ fontSize: '14px', fontWeight: 500 }}>
                Filter Status:
              </label>
              <select
                id="filter-status"
                className="form-control"
                style={{ width: 'auto' }}
                value={statusFilter}
                onChange={(e): void => setStatusFilter(e.target.value)}
                data-testid="select-filter-status"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="EXCEPTION">EXCEPTION</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <p data-testid="empty-transfers-message">No transfers found matching criteria.</p>
          ) : (
            <table className="data-table" data-testid="transfers-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source Store</th>
                  <th>Destination Store</th>
                  <th>Product ID</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((t) => (
                  <tr key={t.id} data-testid={`transfer-row-${t.id}`}>
                    <td>
                      <code>{t.id}</code>
                    </td>
                    <td>{getStoreName(t.source_store_id)}</td>
                    <td>{getStoreName(t.destination_store_id)}</td>
                    <td>
                      <code>{t.product_id}</code>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{t.quantity}</td>
                    <td>{getStatusBadge(t.status)}</td>
                    <td>{t.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {t.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleDispatch(t.id)}
                              data-testid={`btn-dispatch-${t.id}`}
                            >
                              <Send size={14} />
                              <span>Dispatch</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleCancel(t.id)}
                              data-testid={`btn-cancel-${t.id}`}
                            >
                              <XCircle size={14} />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        {t.status === 'DISPATCHED' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleReceive(t.id)}
                              data-testid={`btn-receive-${t.id}`}
                            >
                              <CheckCircle size={14} />
                              <span>Confirm Receipt</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-warning"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleException(t.id)}
                              data-testid={`btn-exception-${t.id}`}
                            >
                              <AlertTriangle size={14} />
                              <span>Flag Exception</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleCancel(t.id)}
                              data-testid={`btn-cancel-${t.id}`}
                            >
                              <XCircle size={14} />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        {t.status === 'EXCEPTION' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleReceive(t.id)}
                              data-testid={`btn-receive-${t.id}`}
                            >
                              <CheckCircle size={14} />
                              <span>Resolve & Receive</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={submitting}
                              onClick={(): Promise<void> => handleCancel(t.id)}
                              data-testid={`btn-cancel-${t.id}`}
                            >
                              <XCircle size={14} />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        {(t.status === 'RECEIVED' || t.status === 'CANCELLED') && (
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>Completed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
