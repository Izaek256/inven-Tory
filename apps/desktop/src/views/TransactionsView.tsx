import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, RefreshCw, AlertCircle, WifiOff } from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { getAccessToken } from '../services/tauriAuthService';
import { getLocalTransactions } from '../services/tauriTransactionService';
import { Store } from '../types/store';
import { Button, Badge, DataTable, EmptyState, Select, ColumnDef } from '@invenTory/ui';

const TRANSACTIONS_CACHE_KEY = 'inven_tory_transactions_cache_v1';

interface TransactionItem {
  transaction_id: string;
  store_id: string;
  product_id: string;
  movement_type: string;
  stock_bucket: string;
  quantity_delta: number;
  occurred_at: string;
  user_id: number;
  device_id: string;
  reference_number: string | null;
  reason_code: string | null;
  sync_status: string;
  server_accepted_at: string | null;
}

export const TransactionsView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const LIMIT = 100;

  const getApiBaseUrl = (): string => {
    const envBaseUrl =
      typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
        : undefined;
    return (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
  };

  const apiFetch = useCallback(async (path: string): Promise<Response> => {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(`${getApiBaseUrl()}${path}`, { headers });
  }, []);

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        setStores(data.filter((s) => s.is_active));
        if (data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      } catch {
        // non-fatal
      }
    };
    void loadStores();
  }, []);

  const loadTransactions = useCallback(
    async (storeId: string, currentOffset: number): Promise<void> => {
      setLoading(true);
      setError(null);
      setIsOffline(false);

      try {
        const localTxns = await getLocalTransactions().catch(() => [] as TransactionItem[]);

        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(currentOffset),
        });
        if (storeId) params.set('store_id', storeId);

        const resp = await apiFetch(`/transactions?${params.toString()}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ detail: resp.statusText }));
          throw new Error((body as { detail?: string }).detail ?? resp.statusText);
        }
        const data = (await resp.json()) as { transactions: TransactionItem[]; total: number };
        const serverTxns = data.transactions ?? [];

        const serverIds = new Set(serverTxns.map((t) => t.transaction_id));
        const merged = [...serverTxns];
        for (const t of localTxns) {
          if (!serverIds.has(t.transaction_id)) {
            merged.push({
              transaction_id: t.transaction_id,
              store_id: t.store_id,
              product_id: t.product_id,
              movement_type: t.movement_type,
              stock_bucket: t.stock_bucket,
              quantity_delta: t.quantity_delta,
              occurred_at: t.occurred_at,
              user_id: Number(t.user_id),
              device_id: t.device_id,
              reference_number: t.reference_number,
              reason_code: t.reason_code,
              sync_status: t.sync_status,
              server_accepted_at: t.server_accepted_at,
            } as TransactionItem);
          }
        }

        merged.sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        );

        setTransactions(merged);
        setTotal(merged.length);

        try {
          localStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(merged));
        } catch {
          // ignore quota errors
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setIsOffline(true);

        let localOnly: TransactionItem[] = [];
        try {
          const localTxns = await getLocalTransactions();
          localOnly = localTxns.map((t) => ({
            transaction_id: t.transaction_id,
            store_id: t.store_id,
            product_id: t.product_id,
            movement_type: t.movement_type,
            stock_bucket: t.stock_bucket,
            quantity_delta: t.quantity_delta,
            occurred_at: t.occurred_at,
            user_id: Number(t.user_id),
            device_id: t.device_id,
            reference_number: t.reference_number,
            reason_code: t.reason_code,
            sync_status: t.sync_status,
            server_accepted_at: t.server_accepted_at,
          }));
        } catch {
          // non-fatal
        }

        if (localOnly.length > 0) {
          localOnly.sort(
            (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
          );
          setTransactions(localOnly);
          setTotal(localOnly.length);
        } else {
          const cached = localStorage.getItem(TRANSACTIONS_CACHE_KEY);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as TransactionItem[];
              setTransactions(parsed);
              setTotal(parsed.length);
            } catch {
              // ignore corrupt cache
            }
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    if (selectedStoreId !== undefined) {
      setOffset(0);
      void loadTransactions(selectedStoreId, 0);
    }
  }, [selectedStoreId, loadTransactions]);

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMovementTypeBadge = (movementType: string): React.ReactElement => {
    const typeMap: Record<string, { status: string; label: string }> = {
      SALE: { status: 'INACTIVE', label: 'SALE' },
      RECEIPT: { status: 'ACTIVE', label: 'RECEIPT' },
      RETURN: { status: 'PENDING', label: 'RETURN' },
      ADJUSTMENT: { status: 'VERY_STALE', label: 'ADJUSTMENT' },
      TRANSFER_OUT: { status: 'INACTIVE', label: 'TRANSFER OUT' },
      TRANSFER_IN: { status: 'ACTIVE', label: 'TRANSFER IN' },
      DAMAGE: { status: 'INACTIVE', label: 'DAMAGE' },
    };
    const config = typeMap[movementType] ?? { status: 'PENDING', label: movementType };
    return <Badge status={config.status as never} label={config.label} />;
  };

  const getSyncBadge = (syncStatus: string): React.ReactElement => {
    const statusMap: Record<string, { status: string; label: string }> = {
      SYNCED: { status: 'ACTIVE', label: 'Synced' },
      PENDING: { status: 'PENDING', label: 'Pending' },
      PERMANENT_REJECTION: { status: 'INACTIVE', label: 'Rejected' },
    };
    const config = statusMap[syncStatus] ?? { status: 'PENDING', label: syncStatus };
    return <Badge status={config.status as never} label={config.label} />;
  };

  const columns: ColumnDef<TransactionItem>[] = [
    {
      key: 'occurred_at',
      header: 'Date / Time',
      render: (tx) => formatDateTime(tx.occurred_at),
      accessor: (tx) => tx.occurred_at,
    },
    {
      key: 'movement_type',
      header: 'Type',
      render: (tx) => getMovementTypeBadge(tx.movement_type),
      accessor: (tx) => tx.movement_type,
    },
    {
      key: 'product_id',
      header: 'Product',
      render: (tx) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{tx.product_id}</span>
      ),
      accessor: (tx) => tx.product_id,
    },
    {
      key: 'stock_bucket',
      header: 'Bucket',
      render: (tx) => tx.stock_bucket,
      accessor: (tx) => tx.stock_bucket,
    },
    {
      key: 'quantity_delta',
      header: 'Qty',
      numeric: true,
      render: (tx) => (
        <span
          style={{
            fontWeight: 'bold',
            color: tx.quantity_delta < 0 ? 'var(--it-red-text)' : 'var(--it-green-text)',
          }}
        >
          {tx.quantity_delta > 0 ? '+' : ''}
          {tx.quantity_delta}
        </span>
      ),
      accessor: (tx) => tx.quantity_delta,
    },
    {
      key: 'reference_number',
      header: 'Reference',
      render: (tx) => tx.reference_number ?? '—',
      accessor: (tx) => tx.reference_number,
    },
    {
      key: 'sync_status',
      header: 'Sync',
      render: (tx) => getSyncBadge(tx.sync_status),
      accessor: (tx) => tx.sync_status,
    },
    {
      key: 'transaction_id',
      header: 'Transaction ID',
      render: (tx) => (
        <span
          style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--it-text-secondary)' }}
        >
          {tx.transaction_id}
        </span>
      ),
      accessor: (tx) => tx.transaction_id,
    },
  ];

  return (
    <div className="view-container" data-testid="transactions-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Transactions Ledger</h2>
          <p className="view-subtitle">Stock movement and audit transaction entries</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadTransactions(selectedStoreId, offset)}
          disabled={loading}
          data-testid="btn-refresh"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </Button>
      </div>

      {isOffline && (
        <div
          className="it-toast it-toast--warning"
          style={{ marginBottom: '16px' }}
          data-testid="offline-banner"
        >
          <WifiOff size={16} aria-hidden="true" />
          <span>Offline mode — showing locally stored transactions</span>
        </div>
      )}

      {error && !isOffline && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="alert-error"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Store filter */}
      {stores.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <Select
            id="txn-store-select"
            data-testid="txn-store-select"
            label="Store"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            options={[
              { value: '', label: 'All stores' },
              ...stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
            ]}
          />
        </div>
      )}

      <div
        style={{
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '24px',
        }}
      >
        {transactions.length === 0 && !loading ? (
          <EmptyState
            icon={<ArrowLeftRight size={24} />}
            heading="No transactions found"
            body="Stock movement entries will appear here once operations are synced."
          />
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--it-text-secondary)' }}>
                Showing {transactions.length} of {total} transactions
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newOffset = Math.max(0, offset - LIMIT);
                    setOffset(newOffset);
                    void loadTransactions(selectedStoreId, newOffset);
                  }}
                  disabled={loading || offset === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newOffset = offset + LIMIT;
                    setOffset(newOffset);
                    void loadTransactions(selectedStoreId, newOffset);
                  }}
                  disabled={loading || offset + LIMIT >= total}
                >
                  Next
                </Button>
              </div>
            </div>

            <DataTable
              columns={columns}
              rows={transactions}
              rowKey={(tx) => tx.transaction_id}
              data-testid="transactions-table"
            />
          </>
        )}
      </div>
    </div>
  );
};
