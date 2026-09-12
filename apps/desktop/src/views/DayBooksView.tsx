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
import { getProducts } from '../services/tauriProductService';
import { isTauriEnvironment } from '../services/tauriStoreService';
import { Store } from '../types/store';
import {
  getLocalTransactions,
  getStockBalance,
  getStockBalancesForStore,
  updateTransaction,
  deleteTransaction,
} from '../services/tauriTransactionService';
import { getAccessToken } from '../services/tauriAuthService';
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
  SearchInput,
  ColumnDef,
  type BadgeStatus,
} from '@invenTory/ui';
import { useActiveStore } from '../context/StoreContext';

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

/** Movement types that update the true stock but are NOT shown as Day Book entries. */
const DAY_BOOK_HIDDEN_MOVEMENT_TYPES = new Set<string>([
  'ADJUSTMENT', // Physical Count / recount correction
  'RETURN',
  'DAMAGE',
]);

function _buildLocalDayBooks(
  transactions: InventoryTransaction[],
  storeId: string,
  productMap: Map<string, string>,
  /** Actual current stock balances from stock_balances table (ground truth).
   *  Used to anchor the running-balance calculation so that stock seeded via
   *  server sync (which updates stock_balances directly without creating a
   *  local inventory_transactions row) is properly reflected. */
  currentBalances?: Map<string, number>,
): { dayBooks: DayBook[]; detailMap: Map<string, DayBookDetail> } {
  // All store-scoped transactions, sorted chronologically — includes hidden types so
  // their quantity_delta is reflected in the running balance, even though they never
  // become visible Day Book entries (Task A + Phase 3 Task E.5.2).
  const allStoreTxns = transactions
    .filter((t) => t.store_id === storeId)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const byDate = new Map<string, InventoryTransaction[]>();
  for (const t of allStoreTxns) {
    const d = _toDateStr(t.occurred_at);
    const existing = byDate.get(d) ?? [];
    existing.push(t);
    byDate.set(d, existing);
  }

  const dayBooks: DayBook[] = [];
  const detailMap = new Map<string, DayBookDetail>();

  // ── Anchor carry-over to actual stock_balances ───────────────────────────
  // The stock_balances table is updated by the Rust layer on every write AND
  // by server sync pulls (upsert_stock_balance_from_server).  The local
  // inventory_transactions log only covers locally-recorded operations; stock
  // that arrived via sync pull has no corresponding transaction row.
  //
  // To avoid running-balance drift we compute the "pre-transaction seed":
  //   seed[productId] = currentBalance - sum(all local transaction deltas)
  //
  // This seed is used as the starting carryOver so that the forward replay
  // always produces a balance that matches stock_balances at the end.
  const carryOver = new Map<string, number>();

  if (currentBalances && currentBalances.size > 0) {
    // Sum all transaction deltas per product
    const totalDeltas = new Map<string, number>();
    for (const t of allStoreTxns) {
      totalDeltas.set(t.product_id, (totalDeltas.get(t.product_id) ?? 0) + t.quantity_delta);
    }
    // Seed = currentBalance - totalDelta (what the balance was before any local tx)
    for (const [productId, currentQty] of currentBalances) {
      const delta = totalDeltas.get(productId) ?? 0;
      const seed = currentQty - delta;
      if (seed !== 0) {
        carryOver.set(productId, seed);
      }
    }
  }
  // If no currentBalances provided, carryOver starts at 0 (original behaviour)

  // Process dates in chronological order so carry-over accumulates correctly.
  const sortedDates = [...byDate.keys()].sort();

  for (const date of sortedDates) {
    const txns = byDate.get(date)!;
    const id = `local-${storeId}-${date}`;

    // Visible entries exclude hidden movement types (adjustments, returns, damage).

    // Opening/closing balances reflect the true stock after hidden ops have
    // already recalibrated the underlying stock. All store-scoped txns
    // (visible + hidden) feed into carryOver so the ledger math never produces
    // a balance that ignores a prior adjustment/return/damage.
    const openingBalanceAggregate = [...carryOver.values()].reduce((s, v) => s + v, 0);

    // Per-product running balance starting from carry-over (includes hidden-op deltas).
    const productRunning = new Map<string, number>(carryOver);

    // Walk every transaction (visible + hidden) in chronological order and record
    // the running balance immediately AFTER each visible entry. Hidden ops
    // (recounts/adjustments/returns/damage) update the running balance too, so a
    // visible entry that happens later on the same day always reflects the true
    // per-product stock position.
    //
    // The running balance is PER-PRODUCT so that each entry shows the actual
    // stock position for that specific product. This is critical after a recount
    // or adjustment — the running balance must reflect the true stock for that
    // product, not an aggregate across all products.
    const entries: DayBookEntry[] = [];
    for (const t of txns) {
      const before = productRunning.get(t.product_id) ?? 0;
      const after = before + t.quantity_delta;
      productRunning.set(t.product_id, after);
      if (DAY_BOOK_HIDDEN_MOVEMENT_TYPES.has(t.movement_type)) continue;
      entries.push({
        id: t.transaction_id,
        transaction_id: t.transaction_id,
        movement_type: t.movement_type,
        product_id: t.product_id,
        product_name: productMap.get(t.product_id) ?? t.product_id,
        quantity_delta: t.quantity_delta,
        reference_number: t.reference_number,
        reason_code: t.reason_code,
        occurred_at: t.occurred_at,
        running_balance: after,
      });
    }

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

interface DayBooksViewProps {
  stores: Store[];
}

export const DayBooksView: React.FC<DayBooksViewProps> = ({ stores }) => {
  const { activeStoreId } = useActiveStore();
  const [dayBooks, setDayBooks] = useState<DayBook[]>([]);
  const [selectedDayBook, setSelectedDayBook] = useState<DayBookDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptMatchTxIds, setReceiptMatchTxIds] = useState<Set<string>>(new Set());
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

  const loadDayBooks = useCallback(
    async (storeId: string): Promise<void> => {
      if (!storeId) return;
      setLoading(true);
      setError(null);
      setIsOffline(false);

      // ── OFFLINE-FIRST: always build from local SQLite first ──────────────
      // The UI becomes interactive immediately from local data; the server
      // merge happens in the background and does NOT block or replace local
      // entries for dates that already exist locally.
      try {
        const [localTxns, products, currentBalances] = await Promise.all([
          getLocalTransactions().catch(() => [] as InventoryTransaction[]),
          getProducts().catch(() => [] as { id: string; name: string }[]),
          getStockBalancesForStore(storeId).catch(() => new Map<string, number>()),
        ]);
        const productMap = _buildProductMap(products);
        const { dayBooks: localDayBooks, detailMap } = _buildLocalDayBooks(
          localTxns,
          storeId,
          productMap,
          currentBalances,
        );

        // Show local data immediately — no spinner wait for server
        if (localDayBooks.length > 0) {
          setDayBooks(localDayBooks);
          _safeWriteCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId), JSON.stringify(localDayBooks));
          for (const [key, value] of detailMap) {
            localDetailMap.set(key, value);
          }
          setLoading(false);
        } else {
          // No local data — show cache while waiting for server
          const cached = _safeReadCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId));
          if (cached) {
            try {
              setDayBooks(JSON.parse(cached) as DayBook[]);
            } catch {
              // ignore corrupt cache
            }
          }
        }
      } catch {
        // Non-fatal — fall through to server fetch
        const cached = _safeReadCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId));
        if (cached) {
          try {
            setDayBooks(JSON.parse(cached) as DayBook[]);
          } catch {
            // ignore corrupt cache
          }
        }
      }

      // ── BACKGROUND SERVER MERGE: append server-only dates ────────────────
      // Runs after local data is already shown. Only adds dates that have no
      // local transactions (i.e., entries that exist only on the server from
      // another device or a previous session before offline mode was available).
      try {
        const resp = await apiFetch(`/stores/${storeId}/day-books?limit=30&offset=0`);
        if (!resp.ok) {
          const body = await resp
            .json()
            .catch(() => ({ detail: resp.statusText }) as { detail?: string });
          const errDetail = body.detail ?? resp.statusText;
          if (resp.status === 401 || resp.status === 403) {
            // Auth error — surface it but keep local data visible
            setError(
              `Authentication required. Please log in to view server day books. (${errDetail})`,
            );
          }
          // Non-2xx but not auth — silently stay with local data (offline / 404)
          return;
        }
        const data = (await resp.json()) as { day_books: DayBook[] };
        const serverDayBooks = data.day_books ?? [];

        // Re-build local books so the merge uses the freshest local state
        const [localTxns2, products2, currentBalances2] = await Promise.all([
          getLocalTransactions().catch(() => [] as InventoryTransaction[]),
          getProducts().catch(() => [] as { id: string; name: string }[]),
          getStockBalancesForStore(storeId).catch(() => new Map<string, number>()),
        ]);
        const productMap2 = _buildProductMap(products2);
        const { dayBooks: localDayBooks2, detailMap: detailMap2 } = _buildLocalDayBooks(
          localTxns2,
          storeId,
          productMap2,
          currentBalances2,
        );

        // Local entries take absolute precedence — server dates are only added
        // if there is no local transaction for that date.
        // Normalise book_date to YYYY-MM-DD for comparison (server may return
        // full ISO datetime strings like "2026-09-12T00:00:00").
        const merged = [...localDayBooks2];
        const localDates = new Set(localDayBooks2.map((d) => _toDateStr(d.book_date)));
        for (const sdb of serverDayBooks) {
          if (!localDates.has(_toDateStr(sdb.book_date))) {
            merged.push(sdb);
          }
        }
        merged.sort((a, b) => b.book_date.localeCompare(a.book_date));
        setDayBooks(merged);
        _safeWriteCache(_cacheKey(DAYBOOKS_CACHE_PREFIX, storeId), JSON.stringify(merged));
        for (const [key, value] of detailMap2) {
          localDetailMap.set(key, value);
        }
      } catch {
        // Server unreachable — local data already shown, mark offline
        setIsOffline(true);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, localDetailMap],
  );

  useEffect(() => {
    if (activeStoreId) {
      // Clear stale list cache so old mixed-ID entries from previous sessions
      // can never bleed through into the deduplication logic.
      try {
        localStorage.removeItem(_cacheKey(DAYBOOKS_CACHE_PREFIX, activeStoreId));
      } catch {
        // ignore
      }
      setSelectedDayBook(null);
      void loadDayBooks(activeStoreId);
    }
  }, [activeStoreId, loadDayBooks]);

  // Also reload when the global store-switch event fires — this handles the
  // case where the event fires before the activeStoreId state propagates via
  // context to this component.
  useEffect(() => {
    const handler = (e: Event): void => {
      const storeId = (e as CustomEvent<{ storeId: string }>).detail?.storeId;
      if (storeId) {
        setSelectedDayBook(null);
        void loadDayBooks(storeId);
      }
    };
    window.addEventListener('inven-tory:stores-updated', handler);
    return (): void => {
      window.removeEventListener('inven-tory:stores-updated', handler);
    };
  }, [loadDayBooks]);

  const loadDayBookDetail = useCallback(
    async (dayBookId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      setIsOffline(false);

      // ── OFFLINE-FIRST for local IDs: never hit the server ────────────────
      // Day books with IDs starting with "local-" are computed entirely from
      // the local SQLite transaction log.  Fetching them from the server
      // would always yield 404 because they don't exist there.
      if (dayBookId.startsWith('local-')) {
        try {
          // 1. In-memory map (populated during this session)
          const inMemory = localDetailMap.get(dayBookId);
          if (inMemory) {
            setSelectedDayBook(inMemory);
            _safeWriteCache(
              _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId),
              JSON.stringify(inMemory),
            );
            setLoading(false);
            return;
          }

          // 2. Rebuild from local SQLite (covers component remounts)
          // Extract storeId from the local day book ID: "local-<storeId>-YYYY-MM-DD"
          // The date is always the last 10 characters (YYYY-MM-DD); storeId is
          // everything between the leading "local-" prefix and the trailing date segment.
          const dateSegment = dayBookId.slice(-10); // "YYYY-MM-DD"
          const storeId = dayBookId.slice(
            'local-'.length,
            dayBookId.length - dateSegment.length - 1,
          );

          const [localTxns, products, currentBalances] = await Promise.all([
            getLocalTransactions().catch(() => [] as InventoryTransaction[]),
            getProducts().catch(() => [] as { id: string; name: string }[]),
            getStockBalancesForStore(storeId).catch(() => new Map<string, number>()),
          ]);
          const productMap = _buildProductMap(products);
          const { detailMap } = _buildLocalDayBooks(
            localTxns,
            storeId,
            productMap,
            currentBalances,
          );
          const rebuilt = detailMap.get(dayBookId);
          if (rebuilt) {
            localDetailMap.set(dayBookId, rebuilt);
            setSelectedDayBook(rebuilt);
            _safeWriteCache(
              _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId),
              JSON.stringify(rebuilt),
            );
            setLoading(false);
            return;
          }

          // 3. Last resort: localStorage cache (survives across app restarts)
          const cachedLocal = _safeReadCache(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId));
          if (cachedLocal) {
            try {
              setSelectedDayBook(JSON.parse(cachedLocal) as DayBookDetail);
              setLoading(false);
              return;
            } catch {
              // ignore corrupt cache
            }
          }

          setError('Day book detail not found in local storage.');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
        return;
      }

      // ── Server-side day book IDs: fetch from server, reconcile with local ─
      try {
        const resp = await apiFetch(`/day-books/${dayBookId}`);
        if (!resp.ok) {
          const body = await resp
            .json()
            .catch(() => ({ detail: resp.statusText }) as { detail?: string });
          const errDetail = body.detail ?? resp.statusText;
          if (resp.status === 401 || resp.status === 403) {
            throw new Error(
              `Authentication required. Please log in to view day book details. (${errDetail})`,
            );
          }
          throw new Error(errDetail);
        }
        const data = (await resp.json()) as DayBookDetail;

        // Reconcile server payload with local transactions so that entries
        // deleted locally (but still present on the server until the next sync)
        // never reappear in the detail view.
        try {
          const localTxns = await getLocalTransactions().catch(() => [] as InventoryTransaction[]);
          const localIds = new Set(localTxns.map((t) => t.transaction_id));
          const reconciled: DayBookDetail = {
            ...data,
            entries: (data.entries ?? []).filter((e) => localIds.has(e.transaction_id)),
          };
          setSelectedDayBook(reconciled);
          _safeWriteCache(
            _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId),
            JSON.stringify(reconciled),
          );
        } catch {
          // If reconciliation fails, fall back to the raw server payload
          setSelectedDayBook(data);
          _safeWriteCache(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId), JSON.stringify(data));
        }
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

  // After an entry edit/delete the authoritative local transaction log is the
  // source of truth. Invalidate the day-book payload caches (so a revisit can't
  // resurrect removed entries) and rebuild the running balances from scratch.
  const refreshDetailAfterMutation = useCallback(
    async (dayBookId: string): Promise<void> => {
      try {
        localStorage.removeItem(_cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId));
      } catch {
        // ignore
      }
      if (!selectedDayBook) return;
      try {
        localStorage.removeItem(_cacheKey(DAYBOOKS_CACHE_PREFIX, selectedDayBook.store_id));
      } catch {
        // ignore
      }

      // Always rebuild from local SQLite transactions FIRST so that deletions
      // and edits are reflected immediately in the UI — even for server-side
      // day books whose entries still live on the server until the next sync.
      // Without this, a deleted entry would reappear because the server
      // still has it.
      try {
        const [localTxns, products, currentBalances] = await Promise.all([
          getLocalTransactions().catch(() => [] as InventoryTransaction[]),
          getProducts().catch(() => [] as { id: string; name: string }[]),
          getStockBalancesForStore(selectedDayBook.store_id).catch(() => new Map<string, number>()),
        ]);
        const productMap = _buildProductMap(products);
        const { dayBooks, detailMap } = _buildLocalDayBooks(
          localTxns,
          selectedDayBook.store_id,
          productMap,
          currentBalances,
        );
        if (dayBooks.length > 0) {
          setDayBooks((prev) => {
            // Local books are authoritative. Keep any prev entries whose date
            // is NOT covered by the fresh local rebuild (server-only dates).
            const localDates = new Set(dayBooks.map((d) => _toDateStr(d.book_date)));
            const serverOnly = prev.filter((p) => !localDates.has(_toDateStr(p.book_date)));
            const merged = [...dayBooks, ...serverOnly];
            merged.sort((a, b) => b.book_date.localeCompare(a.book_date));
            return merged;
          });
        }
        const rebuilt = detailMap.get(dayBookId);
        if (rebuilt) {
          localDetailMap.set(dayBookId, rebuilt);
          setSelectedDayBook(rebuilt);
          // Persist the rebuilt detail to localStorage so that deleted/edited
          // entries stay gone even after the component unmounts and remounts
          // (e.g. user navigates to Dashboard and back to Day Books).
          _safeWriteCache(
            _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId),
            JSON.stringify(rebuilt),
          );
        }
      } catch {
        // Non-fatal — the last known data remains visible.
      }

      // For server-side day books (id does NOT start with "local-"), also
      // re-fetch from the server so any server-side changes (e.g. other
      // users' edits) are eventually reflected. The local rebuild above
      // already removed any locally-deleted entries.
      if (!dayBookId.startsWith('local-')) {
        try {
          const resp = await apiFetch(`/day-books/${dayBookId}`);
          if (resp.ok) {
            const data = (await resp.json()) as DayBookDetail;
            // Only adopt server data if we don't already have a fresher local
            // rebuild (local rebuild takes precedence for immediate UX).
            setSelectedDayBook((prev) => {
              // If the local rebuild produced data for this day book, keep it.
              if (localDetailMap.has(dayBookId)) {
                return localDetailMap.get(dayBookId) ?? prev;
              }
              return data;
            });
            // CRITICAL: Only write server data to cache if we do NOT have a
            // local rebuild. The local rebuild reflects deletions/edits that
            // the server doesn't know about yet. Writing stale server data
            // here would resurrect deleted entries on the next visit.
            if (!localDetailMap.has(dayBookId)) {
              _safeWriteCache(
                _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, dayBookId),
                JSON.stringify(data),
              );
            }
            // Also refresh the day books list from the server
            const listResp = await apiFetch(
              `/stores/${selectedDayBook.store_id}/day-books?limit=30&offset=0`,
            );
            if (listResp.ok) {
              const listData = (await listResp.json()) as { day_books: DayBook[] };
              setDayBooks(listData.day_books ?? []);
              _safeWriteCache(
                _cacheKey(DAYBOOKS_CACHE_PREFIX, selectedDayBook.store_id),
                JSON.stringify(listData.day_books ?? []),
              );
            }
            return;
          }
        } catch {
          // Fall through — local rebuild already shown
        }
      }
    },
    [selectedDayBook, localDetailMap, apiFetch],
  );

  const handleSaveEntryEdit = useCallback(
    async (entry: DayBookEntry): Promise<void> => {
      if (!selectedDayBook) return;
      const qtyDelta = Number(editEntryValues.quantity_delta ?? entry.quantity_delta);
      const newReference = String(editEntryValues.reference_number ?? '').trim() || null;
      setIsSavingEntryEdit(true);
      try {
        await updateTransaction({
          transaction_id: entry.transaction_id,
          quantity_delta: qtyDelta,
          reference_number: newReference,
          reason_code: entry.reason_code ?? null,
        });

        await refreshDetailAfterMutation(selectedDayBook.id);
        setSuccessMessage('Entry updated');
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSavingEntryEdit(false);
        setEditingEntryId(null);
      }
    },
    [editEntryValues, selectedDayBook, refreshDetailAfterMutation],
  );

  const handleDeleteEntry = useCallback(
    async (entry: DayBookEntry): Promise<void> => {
      if (!selectedDayBook) return;
      try {
        await deleteTransaction(entry.transaction_id);

        // Immediately remove the entry from the local detail state so the
        // deletion is reflected in the UI instantly — even before the server
        // sync completes. This also prevents the entry from reappearing if
        // the user navigates away and back before the sync finishes.
        const updatedEntries = (selectedDayBook.entries ?? []).filter(
          (e) => e.transaction_id !== entry.transaction_id,
        );
        const updatedDetail: DayBookDetail = { ...selectedDayBook, entries: updatedEntries };
        setSelectedDayBook(updatedDetail);
        localDetailMap.set(selectedDayBook.id, updatedDetail);
        _safeWriteCache(
          _cacheKey(DAYBOOK_DETAIL_CACHE_PREFIX, selectedDayBook.id),
          JSON.stringify(updatedDetail),
        );

        await refreshDetailAfterMutation(selectedDayBook.id);
        setDeletingEntryId(null);
        setSuccessMessage('Entry deleted');
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsDeletingEntry(false);
      }
    },
    [selectedDayBook, refreshDetailAfterMutation, localDetailMap],
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

  /** Filter day book entries by receipt number (Task E.1). */
  const handleReceiptSearch = useCallback((): void => {
    if (!selectedDayBook || !receiptSearch.trim()) {
      setReceiptMatchTxIds(new Set());
      return;
    }
    const term = receiptSearch.trim();
    const matched = new Set<string>();
    for (const entry of selectedDayBook.entries) {
      if (entry.reference_number && entry.reference_number.includes(term)) {
        matched.add(entry.transaction_id);
      }
    }
    setReceiptMatchTxIds(matched);
  }, [selectedDayBook, receiptSearch]);

  // Re-run the receipt filter whenever the term or the loaded day book changes
  useEffect(() => {
    handleReceiptSearch();
  }, [handleReceiptSearch]);

  // All line items belonging to receipts that match the search term — a single
  // receipt can cover multiple products/line items, so they surface together.
  const receiptFilteredEntries = useMemo(() => {
    if (!selectedDayBook) return [];
    if (receiptMatchTxIds.size === 0) return selectedDayBook.entries;
    return selectedDayBook.entries.filter((e) => receiptMatchTxIds.has(e.transaction_id));
  }, [selectedDayBook, receiptMatchTxIds]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BookOpen size={24} color="var(--it-green)" />
          <div>
            <h2 className="view-title">Day Books</h2>
            <p className="view-subtitle">Daily stock operation logs and balance sheets</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => activeStoreId && void loadDayBooks(activeStoreId)}
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
          <div
            style={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-lg)',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              Day Books for {stores.find((s) => s.id === activeStoreId)?.name || activeStoreId}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Daily Operations (
                {receiptSearch.trim()
                  ? receiptFilteredEntries.length
                  : selectedDayBook.entries.length}{' '}
                entries)
              </h3>
              <div style={{ flex: 1, minWidth: '220px', maxWidth: '360px', marginLeft: 'auto' }}>
                <SearchInput
                  placeholder="Search by receipt number..."
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  data-testid="daybook-receipt-search"
                />
              </div>
              {receiptSearch.trim() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReceiptSearch('')}
                  data-testid="daybook-receipt-search-clear"
                >
                  <X size={14} /> Clear
                </Button>
              )}
            </div>
            {receiptSearch.trim() && receiptMatchTxIds.size === 0 && (
              <div
                className="it-toast"
                style={{ marginBottom: '16px' }}
                data-testid="daybook-receipt-no-match"
              >
                <AlertCircle size={16} aria-hidden="true" />
                <span>
                  No line items in this day book match receipt number “{receiptSearch.trim()}”.
                </span>
              </div>
            )}
            {receiptSearch.trim() && receiptMatchTxIds.size > 0 && (
              <div
                className="it-toast it-toast--success"
                style={{ marginBottom: '16px' }}
                data-testid="daybook-receipt-match-count"
              >
                <CheckCircle size={16} aria-hidden="true" />
                <span>
                  {receiptMatchTxIds.size} receipt{receiptMatchTxIds.size > 1 ? 's' : ''} matched —
                  showing all {receiptFilteredEntries.length} line items.
                </span>
              </div>
            )}

            {(receiptSearch.trim() ? receiptFilteredEntries : selectedDayBook.entries).length ===
            0 ? (
              <EmptyState
                heading="No operations recorded"
                body="Stock operations will appear here as they are performed."
              />
            ) : (
              <DataTable
                columns={entryColumns}
                rows={receiptSearch.trim() ? receiptFilteredEntries : selectedDayBook.entries}
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
