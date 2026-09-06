import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { getStores } from '../services/tauriStoreService';
import { getAccessToken } from '../services/tauriAuthService';
import { Store } from '../types/store';
import { Button, Badge, DataTable, EmptyState, Select, ColumnDef } from '@inven-tory/ui';

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

  useEffect(() => {
    if (selectedStoreId) {
      loadDayBooks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const loadDayBooks = useCallback(async (): Promise<void> => {
    if (!selectedStoreId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(`/stores/${selectedStoreId}/day-books?limit=30&offset=0`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error((body as { detail?: string }).detail ?? resp.statusText);
      }
      const data = (await resp.json()) as { day_books: DayBook[] };
      setDayBooks(data.day_books ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, apiFetch]);

  const loadDayBookDetail = useCallback(
    async (dayBookId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiFetch(`/day-books/${dayBookId}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ detail: resp.statusText }));
          throw new Error((body as { detail?: string }).detail ?? resp.statusText);
        }
        const data = (await resp.json()) as DayBookDetail;
        setSelectedDayBook(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  const generateBalanceSheet = useCallback(async (): Promise<void> => {
    if (!selectedDayBook) return;
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
      // Refresh the day book detail
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
    const typeMap: Record<string, { status: string; label: string }> = {
      SALE: { status: 'INACTIVE', label: 'SALE' },
      RECEIPT: { status: 'ACTIVE', label: 'RECEIPT' },
      RETURN: { status: 'PENDING', label: 'RETURN' },
      ADJUSTMENT: { status: 'VERY_STALE', label: 'ADJUSTMENT' },
      TRANSFER_OUT: { status: 'INACTIVE', label: 'TRANSFER OUT' },
      TRANSFER_IN: { status: 'ACTIVE', label: 'TRANSFER IN' },
    };
    const config = typeMap[movementType] || { status: 'PENDING', label: movementType };
    return <Badge status={config.status as any} label={config.label} />;
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
          onClick={() => void loadDayBooks()}
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
          {/* Store Selection */}
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

          {/* Day Books List */}
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
                body="Day books will be created when stock operations are performed."
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
          {/* Day Book Detail View */}
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

            {/* Balance Sheet Status */}
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

          {/* Entries Table */}
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
