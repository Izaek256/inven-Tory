import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  WifiOff,
} from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { getProducts } from '../services/tauriProductService';
import { getLocalTransactions } from '../services/tauriTransactionService';
import { getAccessToken } from '../services/tauriAuthService';
import { Store } from '../types/store';
import { InventoryTransaction } from '../types/transaction';
import {
  Button,
  Badge,
  DataTable,
  EmptyState,
  Select,
  ColumnDef,
  type BadgeStatus,
} from '@inven-tory/ui';

const DAYBOOKS_CACHE_PREFIX = 'inven_tory_daybooks_';
const DAYBOOK_DETAIL_CACHE_PREFIX = 'inven_tory_daybook_detail_';

function _cacheKey(prefix: string, storeId: string): string {
  return `${prefix}${storeId}`;
}

function _safeReadCache(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function _safeWriteCache(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function _toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

function _buildProductMap(products: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of products) {
    map.set(p.id, p.name);
  }
  return map;
}

function _buildLocalDayBooks(
  transactions: InventoryTransaction[],
  storeId: string,
  productMap: Map<string, string>,
): { dayBooks: DayBook[]; detailMap: Map<string, DayBookDetail> } {
  const storeTxns = transactions
    .filter((t) => t.store_id === storeId)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const byDate = new Map<string, InventoryTransaction[]>();
  for (const t of storeTxns) {
    const d = _toDateStr(t.occurred_at);
    const existing = byDate.get(d) ?? [];
    existing.push(t);
    byDate.set(d, existing);
  }

  const dayBooks: DayBook[] = [];
  const detailMap = new Map<string, DayBookDetail>();

  for (const [date, txns] of byDate) {
    const id = `local-${storeId}-${date}`;
    const entries: DayBookEntry[] = txns.map((t, idx) => {
      let balance = 0;
      for (let i = 0; i <= idx; i++) {
        balance += txns[i].quantity_delta;
      }
      return {
        id: t.transaction_id,
        transaction_id: t.transaction_id,
        movement_type: t.movement_type,
        product_id: t.product_id,
        product_name: productMap.get(t.product_id) ?? t.product_id,
        quantity_delta: t.quantity_delta,
        reference_number: t.reference_number,
        reason_code: t.reason_code,
        occurred_at: t.occurred_at,
        running_balance: balance,
      };
    });

    const openingBalance =
      entries.length > 0 ? entries[0].running_balance - entries[0].quantity_delta : 0;
    const closingBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

    dayBooks.push({
      id,
      store_id: storeId,
      book_date: date,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      balance_sheet_generated: false,
      balance_sheet_generated_at: null,
      created_at: txns[0]?.occurred_at ?? date,
      updated_at: txns[txns.length - 1]?.occurred_at ?? date,
    });

    detailMap.set(id, {
      id,
      store_id: storeId,
      book_date: date,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      balance_sheet_generated: false,
      balance_sheet_generated_at: null,
      entries,
    });
  }

  dayBooks.sort((a, b) => b.book_date.localeCompare(a.book_date));

  return { dayBooks, detailMap };
}

interface DayBook {
  id: string;
  store_id: string;
  book_date: string;
  opening_balance: number;
  closing_balance: number | null;
  balance_sheet_generated: boolean;
  balance_sheet_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DayBookEntry {
  id: string;
  transaction_id: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  quantity_delta: number;
  reference_number: string | null;
  reason_code: string | null;
  occurred_at: string;
  running_balance: number;
}

interface DayBookDetail {
  id: string;
  store_id: string;
  book_date: string;
  opening_balance: number;
  closing_balance: number | null;
  balance_sheet_generated: boolean;
  balance_sheet_generated_at: string | null;
  entries: DayBookEntry[];
}

export const DayBooksView: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [dayBooks, setDayBooks] = useState<DayBook[]>([]);
  const [selectedDayBook, setSelectedDayBook] = useState<DayBookDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [localDetailMap] = useState<Map<string, DayBookDetail>>(new Map());

  const getApiBaseUrl = (): string => {
    const envBaseUrl =
      typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
        : undefined;
    return (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
  };

  const apiFetch = useCallback(async (path: string, options?: RequestInit): Promise<Response> => {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
  }, []);

  useEffect(() => {
    const loadStores = async (): Promise<void> => {
      try {
        const data = await getStores();
        setStores(data.filter((s) => s.is_active));
        if (data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      } catch (err) {
        setError('Failed to load stores');
      }
    };
    loadStores();
  }, []);

  const loadDayBooks = useCallback(
    async (storeId: string): Promise<void> => {
      if (!storeId) return;
      setLoading(true);
      setError(null);
      setIsOffline(false);

      try {
        const resp = await apiFetch(`/stores/${storeId}/day-books?limit=30&offset=0`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ detail: resp.statusText }));
          throw new Error((body as { detail?: string }).detail ?? resp.statusText);
        }
        const data = (await resp.json()) as { day_books: DayBook[] };
        const serverDayBooks = data.day_books ?? [];
        setDayBooks(serverDayBooks);
        _safeWriteCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId), JSON.stringify(serverDayBooks));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setIsOffline(true);

        const cached = _safeReadCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId));
        if (cached) {
          try {
            setDayBooks(JSON.parse(cached) as DayBook[]);
          } catch {
            // ignore corrupt cache
          }
        }

        try {
          const [localTxns, products] = await Promise.all([
            getLocalTransactions().catch(() => [] as InventoryTransaction[]),
            getProducts().catch(() => [] as { id: string; name: string }[]),
          ]);
          const productMap = _buildProductMap(products);
          const { dayBooks: localDayBooks, detailMap } = _buildLocalDayBooks(
            localTxns,
            storeId,
            productMap,
          );
          if (localDayBooks.length > 0) {
            setDayBooks((prev) => {
              const merged = [...localDayBooks];
              for (const db of prev) {
                if (!merged.some((m) => m.id === db.id)) {
                  merged.push(db);
                }
              }
              merged.sort((a, b) => b.book_date.localeCompare(a.book_date));
              return merged;
            });
            for (const [key, value] of detailMap) {
              localDetailMap.set(key, value);
            }
          }
        } catch {
          // non-fatal local fallback
        }
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, localDetailMap],
  );

  useEffect(() => {
    if (selectedStoreId) {
      setSelectedDayBook(null);
      void loadDayBooks(selectedStoreId);
    }
  }, [selectedStoreId, loadDayBooks]);

  const loadDayBookDetail = useCallback(
    async (dayBookId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      setIsOffline(false);

      try {
        const resp = await apiFetch(`/day-books/${dayBookId}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ detail: resp.statusText }));
          throw new Error((body as { detail?: string }).detail ?? resp.statusText);
        }
        const data = (await resp.json()) as DayBookDetail;
        setSelectedDayBook(data);
        _safeWriteCache(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId), JSON.stringify(data));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setIsOffline(true);

        const cached = _safeReadCache(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId));
        if (cached) {
          try {
            setSelectedDayBook(JSON.parse(cached) as DayBookDetail);
            return;
          } catch {
            // ignore corrupt cache
          }
        }

        const localDetail = localDetailMap.get(dayBookId);
        if (localDetail) {
          setSelectedDayBook(localDetail);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, localDetailMap],
  );

  const generateBalanceSheet = useCallback(async (): Promise<void> => {
    if (!selectedDayBook) return;
    if (selectedDayBook.id.startsWith('local-')) {
      setError('Balance sheet generation requires a server connection.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(`/day-books/${selectedDayBook.id}/balance-sheet`, {
        method: 'POST',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error((body as { detail?: string }).detail ?? resp.statusText);
      }
      setSuccessMessage('Balance sheet generated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadDayBookDetail(selectedDayBook.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDayBook, apiFetch, loadDayBookDetail]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
    const typeMap: Record<string, { status: BadgeStatus; label: string }> = {
      SALE: { status: 'INACTIVE', label: 'SALE' },
      RECEIPT: { status: 'ACTIVE', label: 'RECEIPT' },
      RETURN: { status: 'PENDING', label: 'RETURN' },
      ADJUSTMENT: { status: 'VERY_STALE', label: 'ADJUSTMENT' },
      TRANSFER_OUT: { status: 'INACTIVE', label: 'TRANSFER OUT' },
      TRANSFER_IN: { status: 'ACTIVE', label: 'TRANSFER IN' },
    };
    const config = typeMap[movementType] ?? {
      status: 'PENDING' as BadgeStatus,
      label: movementType,
    };
    return <Badge status={config.status} label={config.label} />;
  };

  const listColumns: ColumnDef<DayBook>[] = [
    {
      key: 'book_date',
      header: 'Date',
      render: (db) => formatDate(db.book_date),
      accessor: (db) => db.book_date,
    },
    {
      key: 'opening_balance',
      header: 'Opening Balance',
      numeric: true,
      render: (db) => db.opening_balance,
      accessor: (db) => db.opening_balance,
    },
    {
      key: 'closing_balance',
      header: 'Closing Balance',
      numeric: true,
      render: (db) => db.closing_balance ?? '—',
      accessor: (db) => db.closing_balance,
    },
    {
      key: 'balance_sheet_generated',
      header: 'Balance Sheet',
      render: (db) =>
        db.balance_sheet_generated ? (
          <Badge status="ACTIVE" label="Generated" />
        ) : (
          <Badge status="INACTIVE" label="Pending" />
        ),
      accessor: (db) => db.balance_sheet_generated,
    },
    {
      key: 'actions',
      header: 'Actions',
      numeric: true,
      render: (db) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => loadDayBookDetail(db.id)}
          disabled={loading}
        >
          <FileText size={14} />
          <span>View</span>
        </Button>
      ),
      accessor: (db) => db.id,
    },
  ];

  const entryColumns: ColumnDef<DayBookEntry>[] = [
    {
      key: 'occurred_at',
      header: 'Time',
      render: (entry) => formatDateTime(entry.occurred_at),
      accessor: (entry) => entry.occurred_at,
    },
    {
      key: 'movement_type',
      header: 'Type',
      render: (entry) => getMovementTypeBadge(entry.movement_type),
      accessor: (entry) => entry.movement_type,
    },
    {
      key: 'product_name',
      header: 'Product',
      render: (entry) => entry.product_name,
      accessor: (entry) => entry.product_name,
    },
    {
      key: 'quantity_delta',
      header: 'Qty In/Out',
      numeric: true,
      render: (entry) => (
        <span
          style={{
            fontWeight: 'bold',
            color: entry.quantity_delta < 0 ? 'var(--it-red-text)' : 'var(--it-green-text)',
          }}
        >
          {entry.quantity_delta > 0 ? '+' : ''}
          {entry.quantity_delta}
        </span>
      ),
      accessor: (entry) => entry.quantity_delta,
    },
    {
      key: 'running_balance',
      header: 'Balance',
      numeric: true,
      render: (entry) => entry.running_balance,
      accessor: (entry) => entry.running_balance,
    },
    {
      key: 'reference_number',
      header: 'Reference',
      render: (entry) => entry.reference_number || '—',
      accessor: (entry) => entry.reference_number,
    },
  ];

  return (
    <div className="view-container" data-testid="day-books-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Day Books</h2>
          <p className="view-subtitle">Daily stock operation logs and balance sheets</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadDayBooks(selectedStoreId)}
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
          <span>Offline mode — showing cached and locally stored day books</span>
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

      {!selectedDayBook ? (
        <>
          <div style={{ marginBottom: '20px' }}>
            <Select
              id="store-select"
              data-testid="store-select"
              label="Store"
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />
          </div>

          <div
            style={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-lg)',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              Day Books for {stores.find((s) => s.id === selectedStoreId)?.name || selectedStoreId}
            </h3>

            {dayBooks.length === 0 ? (
              <EmptyState
                heading="No day books found"
                body="Day books are generated from synced stock operations. Perform operations offline and sync to see them here."
              />
            ) : (
              <DataTable
                columns={listColumns}
                rows={dayBooks}
                rowKey={(db) => db.id}
                data-testid="day-books-table"
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            <Button variant="secondary" onClick={() => setSelectedDayBook(null)} disabled={loading}>
              <ChevronLeft size={16} />
              <span>Back to List</span>
            </Button>
          </div>

          <div
            style={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-lg)',
              padding: '24px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                  <BookOpen size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Day Book - {formatDate(selectedDayBook.book_date)}
                </h3>
                <p style={{ color: 'var(--it-text-secondary)', fontSize: '14px' }}>
                  Store:{' '}
                  {stores.find((s) => s.id === selectedDayBook.store_id)?.name ||
                    selectedDayBook.store_id}
                </p>
              </div>
              {!selectedDayBook.balance_sheet_generated && (
                <Button
                  variant="primary"
                  onClick={generateBalanceSheet}
                  disabled={loading}
                  data-testid="btn-generate-balance-sheet"
                >
                  <Download size={16} />
                  <span>Generate Balance Sheet</span>
                </Button>
              )}
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}
            >
              {selectedDayBook.balance_sheet_generated ? (
                <>
                  <CheckCircle size={16} color="var(--it-green)" />
                  <span style={{ fontSize: '14px' }}>
                    Balance sheet generated at{' '}
                    {formatDateTime(selectedDayBook.balance_sheet_generated_at!)}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} color="var(--it-text-secondary)" />
                  <span style={{ fontSize: '14px', color: 'var(--it-text-secondary)' }}>
                    Balance sheet not yet generated
                  </span>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-lg)',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              Daily Operations ({selectedDayBook.entries.length} entries)
            </h3>

            {selectedDayBook.entries.length === 0 ? (
              <EmptyState
                heading="No operations recorded"
                body="Stock operations will appear here as they are performed."
              />
            ) : (
              <DataTable
                columns={entryColumns}
                rows={selectedDayBook.entries}
                rowKey={(entry) => entry.id}
                data-testid="day-book-entries-table"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
