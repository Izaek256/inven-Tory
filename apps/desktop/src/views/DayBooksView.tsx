import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  WifiOff,
  Pencil,
  X,
  Copy,
  Trash2,
  Check,
  ExternalLink,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getStores, isTauriEnvironment } from '../services/tauriStoreService';
import { getProducts } from '../services/tauriProductService';
import {
  getLocalTransactions,
  getStockBalance,
  updateTransaction,
  deleteTransaction,
} from '../services/tauriTransactionService';
import { getAccessToken } from '../services/tauriAuthService';
import { Store } from '../types/store';
import { InventoryTransaction } from '../types/transaction';
import { BalanceSheetPdf } from '../components/BalanceSheetPdf';
import {
  buildBalanceSheetData,
  formatBalanceSheetText,
  type DayBookEntryForSheet,
  type BalanceSheetRow,
} from '../utils/balanceSheetUtils';
import {
  Button,
  Badge,
  DataTable,
  EmptyState,
  Select,
  ColumnDef,
  type BadgeStatus,
} from '@invenTory/ui';

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

async function saveOrDownloadPdf(
  filename: string,
  blob: Blob,
): Promise<{ savedPath?: string; url: string }> {
  const url = URL.createObjectURL(blob);

  // 1. Try native File System Access API (Save File Picker) - prompts native OS Save dialog
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    interface FilePickerHandle {
      name: string;
      createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
    }
    interface WindowWithFilePicker extends Window {
      showSaveFilePicker(opts: unknown): Promise<FilePickerHandle>;
    }
    try {
      const handle = await (window as WindowWithFilePicker).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'PDF Document (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { savedPath: handle.name ?? filename, url };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error('Save cancelled by user');
      }
      // If blocked or unsupported, fall through
    }
  }

  // 2. In Tauri runtime, invoke native save_pdf_file (saves to Downloads and reveals in Explorer)
  if (isTauriEnvironment()) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const savedPath = await invoke<string>('save_pdf_file', { filename, bytes });
      return { savedPath, url };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Native save_pdf_file failed, falling back to download:', err);
    }
  }

  // 3. Fallback: browser download anchor
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 1000);

  return { savedPath: filename, url };
}

function _copyViaTextarea(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
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

  // Carry per-product running totals across days so opening balances are correct.
  // Key: productId → cumulative quantity_delta from all prior days.
  const carryOver = new Map<string, number>();

  // Process dates in chronological order so carry-over accumulates correctly.
  const sortedDates = [...byDate.keys()].sort();

  for (const date of sortedDates) {
    const txns = byDate.get(date)!;
    const id = `local-${storeId}-${date}`;

    // Opening balance for this day = sum of all deltas for each product up to (but not including) today.
    // We compute a single aggregate opening balance across all products for the DayBook header row.
    const openingBalanceAggregate = [...carryOver.values()].reduce((s, v) => s + v, 0);

    // Per-product running balance starting from carry-over
    const productRunning = new Map<string, number>(carryOver);

    const entries: DayBookEntry[] = txns.map((t) => {
      const before = productRunning.get(t.product_id) ?? 0;
      const after = before + t.quantity_delta;
      productRunning.set(t.product_id, after);
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
        // running_balance is per-product: shows that product's stock level after this entry
        running_balance: after,
      };
    });

    const closingBalanceAggregate = [...productRunning.values()].reduce((s, v) => s + v, 0);

    dayBooks.push({
      id,
      store_id: storeId,
      book_date: date,
      opening_balance: openingBalanceAggregate,
      closing_balance: closingBalanceAggregate,
      balance_sheet_generated: false,
      balance_sheet_generated_at: null,
      created_at: txns[0]?.occurred_at ?? date,
      updated_at: txns[txns.length - 1]?.occurred_at ?? date,
    });

    detailMap.set(id, {
      id,
      store_id: storeId,
      book_date: date,
      opening_balance: openingBalanceAggregate,
      closing_balance: closingBalanceAggregate,
      balance_sheet_generated: false,
      balance_sheet_generated_at: null,
      entries,
    });

    // Advance carry-over for the next day
    for (const [pid, qty] of productRunning) {
      carryOver.set(pid, qty);
    }
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

  // Entry-level edit/delete state (for the detail entry table)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryValues, setEditEntryValues] = useState<Record<string, string | number>>({});
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [isSavingEntryEdit, setIsSavingEntryEdit] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);

  // Balance sheet and PDF save state
  const [productSkuMap, setProductSkuMap] = useState<Map<string, string>>(new Map());
  const [currentBalancesMap, setCurrentBalancesMap] = useState<Map<string, number>>(new Map());
  const [savedPdfPath, setSavedPdfPath] = useState<string | null>(null);
  const [savedPdfUrl, setSavedPdfUrl] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

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
          const errDetail = (body as { detail?: string }).detail ?? resp.statusText;
          // 401/403 — authentication issue, guide user to re-authenticate
          if (resp.status === 401 || resp.status === 403) {
            throw new Error(
              `Authentication required. Please log in to view server day books. (${errDetail})`,
            );
          }
          throw new Error(errDetail);
        }
        const data = (await resp.json()) as { day_books: DayBook[] };
        const serverDayBooks = data.day_books ?? [];
        setDayBooks(serverDayBooks);
        _safeWriteCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId), JSON.stringify(serverDayBooks));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Distinguish auth errors from genuine offline/network issues
        if (errMsg.toLowerCase().includes('authentication required')) {
          setError(errMsg);
          setIsOffline(false);
        } else {
          setError(errMsg);
          setIsOffline(true);
        }

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
          const errDetail = (body as { detail?: string }).detail ?? resp.statusText;
          if (resp.status === 401 || resp.status === 403) {
            throw new Error(
              `Authentication required. Please log in to view day book details. (${errDetail})`,
            );
          }
          throw new Error(errDetail);
        }
        const data = (await resp.json()) as DayBookDetail;
        setSelectedDayBook(data);
        _safeWriteCache(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId), JSON.stringify(data));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.toLowerCase().includes('authentication required')) {
          setError(errMsg);
          setIsOffline(false);
        } else {
          setError(errMsg);
          setIsOffline(true);
        }

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

  useEffect(() => {
    if (!selectedDayBook || selectedDayBook.entries.length === 0) {
      setSavedPdfPath(null);
      setSavedPdfUrl(null);
      return;
    }

    getProducts()
      .then((products) => {
        setProductSkuMap(new Map(products.map((p) => [p.id, p.sku])));
      })
      .catch(() => undefined);

    const productIds = [...new Set(selectedDayBook.entries.map((e) => e.product_id))];
    if (isTauriEnvironment()) {
      Promise.all(
        productIds.map(async (productId) => {
          try {
            const balance = await getStockBalance(selectedDayBook.store_id, productId);
            return [productId, balance.quantity] as const;
          } catch {
            return [productId, 0] as const;
          }
        }),
      )
        .then((entries) => {
          setCurrentBalancesMap(new Map(entries));
        })
        .catch(() => undefined);
    }
  }, [selectedDayBook]);

  const balanceSheetRows = useMemo((): BalanceSheetRow[] => {
    if (!selectedDayBook || selectedDayBook.entries.length === 0) return [];
    const sheetEntries: DayBookEntryForSheet[] = selectedDayBook.entries.map((e) => ({
      id: e.id,
      transaction_id: e.transaction_id,
      movement_type: e.movement_type,
      product_id: e.product_id,
      product_name: e.product_name,
      quantity_delta: e.quantity_delta,
      reference_number: e.reference_number,
      reason_code: e.reason_code,
      occurred_at: e.occurred_at,
      running_balance: e.running_balance,
      sku: productSkuMap.get(e.product_id) ?? null,
    }));
    return buildBalanceSheetData(sheetEntries, currentBalancesMap);
  }, [selectedDayBook, productSkuMap, currentBalancesMap]);

  const balanceSheetText = useMemo((): string => {
    return formatBalanceSheetText(balanceSheetRows);
  }, [balanceSheetRows]);

  const generateBalanceSheet = useCallback(async (): Promise<void> => {
    if (!selectedDayBook) return;
    if (balanceSheetRows.length === 0) {
      setError('No product data found — cannot generate balance sheet for an empty day book.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Generate PDF
      const { pdf } = await import('@react-pdf/renderer');
      const storeName =
        stores.find((s) => s.id === selectedDayBook.store_id)?.name ?? selectedDayBook.store_id;
      const now = new Date();
      const timeStamp =
        [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('-') +
        '_' +
        [
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0'),
        ].join('-');
      const filename = `balance-sheet-${timeStamp}.pdf`;

      const blob = await pdf(
        <BalanceSheetPdf
          rows={balanceSheetRows}
          generatedAt={new Date().toISOString()}
          storeName={storeName}
          bookDate={selectedDayBook.book_date}
        />,
      ).toBlob();

      const result = await saveOrDownloadPdf(filename, blob);
      setSavedPdfPath(result.savedPath ?? filename);
      setSavedPdfUrl(result.url);

      // Optimistically update day book status
      setSelectedDayBook((prev) =>
        prev
          ? {
              ...prev,
              balance_sheet_generated: true,
              balance_sheet_generated_at: new Date().toISOString(),
            }
          : prev,
      );

      // Also fire server-side marker if online (non-fatal)
      try {
        await apiFetch(`/day-books/${selectedDayBook.id}/balance-sheet`, {
          method: 'POST',
        });
      } catch {
        // offline — skip server marker silently
      }

      setSuccessMessage(`Balance sheet PDF saved: ${result.savedPath ?? filename}`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      if (err instanceof Error && err.message === 'Save cancelled by user') {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDayBook, balanceSheetRows, apiFetch, stores]);

  // ── Entry-level edit / delete handlers ───────────────────────────────────

  const startEditingEntry = useCallback((entry: DayBookEntry): void => {
    setEditingEntryId(entry.id);
    setDeletingEntryId(null);
    setEditEntryValues({
      quantity_delta: entry.quantity_delta,
      reference_number: entry.reference_number ?? '',
    });
  }, []);

  const handleSaveEntryEdit = useCallback(
    async (entry: DayBookEntry): Promise<void> => {
      if (!selectedDayBook) return;
      const qtyDelta = Number(editEntryValues.quantity_delta ?? entry.quantity_delta);
      setIsSavingEntryEdit(true);
      try {
        await updateTransaction({
          transaction_id: entry.transaction_id,
          quantity_delta: qtyDelta,
          reference_number: String(editEntryValues.reference_number ?? '').trim() || null,
          reason_code: entry.reason_code ?? null,
        });

        setSelectedDayBook((prev) => {
          if (!prev) return prev;

          const updated = prev.entries.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  quantity_delta: qtyDelta,
                  reference_number: String(editEntryValues.reference_number ?? '').trim() || null,
                }
              : e,
          );

          const sorted = [...updated].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

          // Rebalance per-product from opening balance (0 for server books where
          // opening_balance is an aggregate; correct for local books).
          // We use product-scoped running totals so the Balance column shows the
          // per-product stock level, not a meaningless cross-product sum.
          const productRunning = new Map<string, number>();
          const rebalanced = sorted.map((e) => {
            const before = productRunning.get(e.product_id) ?? 0;
            const after = before + e.quantity_delta;
            productRunning.set(e.product_id, after);
            return { ...e, running_balance: after };
          });

          return { ...prev, entries: rebalanced };
        });
        setSuccessMessage('Entry updated');
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSavingEntryEdit(false);
        setEditingEntryId(null);
      }
    },
    [editEntryValues, selectedDayBook],
  );

  const handleDeleteEntry = useCallback(
    async (entry: DayBookEntry): Promise<void> => {
      if (!selectedDayBook) return;
      try {
        await deleteTransaction(entry.transaction_id);
        setSelectedDayBook((prev) => {
          if (!prev) return prev;
          const remaining = prev.entries.filter((e) => e.id !== entry.id);

          const sorted = [...remaining].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

          // Per-product rebalance (same logic as handleSaveEntryEdit)
          const productRunning = new Map<string, number>();
          const rebalanced = sorted.map((e) => {
            const before = productRunning.get(e.product_id) ?? 0;
            const after = before + e.quantity_delta;
            productRunning.set(e.product_id, after);
            return { ...e, running_balance: after };
          });

          return { ...prev, entries: rebalanced };
        });
        setDeletingEntryId(null);
        setSuccessMessage('Entry deleted');
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsDeletingEntry(false);
      }
    },
    [selectedDayBook],
  );

  // ── Copy balance sheet text to clipboard ─────────────────────────────────

  const copyBalanceSheetText = useCallback((): void => {
    if (!balanceSheetText) return;

    // Primary: modern async clipboard API
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(balanceSheetText)
        .then(() => {
          setCopiedText(true);
          setTimeout(() => setCopiedText(false), 2500);
        })
        .catch(() => {
          // Fall through to legacy method
          _copyViaTextarea(balanceSheetText);
          setCopiedText(true);
          setTimeout(() => setCopiedText(false), 2500);
        });
      return;
    }

    // Fallback: textarea + execCommand (works in Tauri WebView)
    _copyViaTextarea(balanceSheetText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  }, [balanceSheetText]);

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
      render: (entry): React.ReactElement => getMovementTypeBadge(entry.movement_type),
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
      render: (entry): React.ReactElement => {
        if (editingEntryId === entry.id) {
          return (
            <input
              type="number"
              data-testid={`edit-qty-${entry.id}`}
              style={{
                width: '70px',
                padding: '2px 6px',
                fontSize: '12px',
                textAlign: 'center',
                border: '1px solid var(--it-border)',
                borderRadius: '3px',
              }}
              value={editEntryValues.quantity_delta ?? entry.quantity_delta}
              onChange={(e) =>
                setEditEntryValues({ ...editEntryValues, quantity_delta: Number(e.target.value) })
              }
            />
          );
        }
        return (
          <span
            style={{
              fontWeight: 'bold',
              color: entry.quantity_delta < 0 ? 'var(--it-red-text)' : 'var(--it-green-text)',
            }}
          >
            {entry.quantity_delta > 0 ? '+' : ''}
            {entry.quantity_delta}
          </span>
        );
      },
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
      render: (entry): React.ReactElement | null => {
        if (editingEntryId === entry.id) {
          return (
            <input
              type="text"
              data-testid={`edit-ref-${entry.id}`}
              style={{
                width: '140px',
                padding: '2px 6px',
                fontSize: '12px',
                border: '1px solid var(--it-border)',
                borderRadius: '3px',
              }}
              value={editEntryValues.reference_number ?? entry.reference_number ?? ''}
              onChange={(e) =>
                setEditEntryValues({ ...editEntryValues, reference_number: e.target.value })
              }
            />
          );
        }
        return <>{entry.reference_number || '—'}</>;
      },
      accessor: (entry) => entry.reference_number,
    },
    {
      key: 'actions',
      header: '',
      render: (entry): React.ReactElement => {
        if (editingEntryId === entry.id) {
          if (isSavingEntryEdit) {
            return <RefreshCw size={14} className="spin" />;
          }
          return (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--it-border)',
                  borderRadius: '3px',
                  background: 'var(--it-bg-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => void handleSaveEntryEdit(entry)}
                data-testid={`save-entry-${entry.id}`}
                title="Save"
              >
                <Check size={12} />
              </button>
              <button
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--it-border)',
                  borderRadius: '3px',
                  background: 'var(--it-bg-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => setEditingEntryId(null)}
                data-testid={`cancel-entry-${entry.id}`}
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          );
        }
        if (deletingEntryId === entry.id) {
          if (isDeletingEntry) {
            return <RefreshCw size={14} className="spin" />;
          }
          return (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--it-danger-bg)',
                  borderRadius: '3px',
                  background: 'var(--it-danger-bg)',
                  color: 'var(--it-danger-text)',
                  cursor: 'pointer',
                }}
                onClick={() => void handleDeleteEntry(entry)}
                data-testid={`confirm-delete-${entry.id}`}
                title="Confirm delete"
              >
                <Check size={12} />
              </button>
              <button
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--it-border)',
                  borderRadius: '3px',
                  background: 'var(--it-bg-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => setDeletingEntryId(null)}
                data-testid={`cancel-del-${entry.id}`}
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              style={{
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--it-text-secondary)',
              }}
              onClick={() => startEditingEntry(entry)}
              data-testid={`edit-entry-${entry.id}`}
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              style={{
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--it-text-secondary)',
              }}
              onClick={() => setDeletingEntryId(entry.id)}
              data-testid={`delete-entry-${entry.id}`}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
      accessor: () => '',
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

      {error && (
        <div
          className={`it-toast ${error.includes('Authentication required') ? 'it-toast--error' : 'it-toast--error'}`}
          style={{ marginBottom: '16px' }}
          data-testid={
            error.includes('Authentication required') ? 'auth-error-banner' : 'alert-error'
          }
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
              {selectedDayBook.entries.length > 0 && (
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Button
                    variant="primary"
                    onClick={generateBalanceSheet}
                    disabled={loading}
                    data-testid="btn-generate-balance-sheet"
                  >
                    <Download size={16} />
                    <span>
                      {selectedDayBook.balance_sheet_generated
                        ? 'Re-generate PDF'
                        : 'Generate Balance Sheet'}
                    </span>
                  </Button>
                  {balanceSheetRows.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={copyBalanceSheetText}
                      data-testid="btn-copy-balance-sheet-text"
                    >
                      {copiedText ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copiedText ? 'Copied!' : 'Copy Text'}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Status row */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
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

            {/* PDF save result panel */}
            {savedPdfPath && (
              <div
                style={{
                  background: 'var(--it-bg-secondary)',
                  border: '1px solid var(--it-border)',
                  borderRadius: 'var(--it-r-md)',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
                data-testid="pdf-save-result"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={15} color="var(--it-green)" />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>PDF saved</span>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--it-text-secondary)',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {savedPdfPath}
                </div>
                {savedPdfUrl && (
                  <a
                    href={savedPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--it-primary)',
                      textDecoration: 'none',
                    }}
                    data-testid="pdf-view-link"
                  >
                    <ExternalLink size={12} />
                    <span>View PDF in browser</span>
                  </a>
                )}
              </div>
            )}

            {/* Balance sheet text panel */}
            {balanceSheetText && selectedDayBook.balance_sheet_generated && (
              <div
                style={{
                  background: 'var(--it-bg-secondary)',
                  border: '1px solid var(--it-border)',
                  borderRadius: 'var(--it-r-md)',
                  padding: '12px 16px',
                  marginBottom: '12px',
                }}
                data-testid="balance-sheet-text-panel"
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Balance Sheet Text</span>
                  <button
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      border: '1px solid var(--it-border)',
                      borderRadius: '4px',
                      background: 'var(--it-bg)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onClick={copyBalanceSheetText}
                    data-testid="copy-text-inline"
                  >
                    {copiedText ? <Check size={11} /> : <Copy size={11} />}
                    {copiedText ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    margin: 0,
                    color: 'var(--it-text)',
                  }}
                  data-testid="balance-sheet-text"
                >
                  {balanceSheetText}
                </pre>
              </div>
            )}
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
