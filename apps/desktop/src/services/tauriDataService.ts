import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';
import { invalidateStockBalanceCache } from './tauriTransactionService';

/** Default retention period for local business caches (days). */
export const LOCAL_CACHE_RETENTION_DAYS = 30;

export interface SearchResult {
  product_id: string;
  sku: string;
  name: string;
  brand: string | null;
  score: number;
}

export interface FTS5IndexInfo {
  exists: boolean;
  table_name: string;
  indexed_at: string | null;
  row_count: number;
}

/**
 * Initialize the local SQLite FTS5 index for desktop search.
 * Creates the FTS5 virtual table if it does not already exist.
 */
export async function initFTS5Index(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    const result = await invoke<boolean>('init_fts5_index');
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DataService] Failed to init FTS5 index:', err);
    return false;
  }
}

/**
 * Check whether the local SQLite FTS5 index exists and is up to date.
 */
export async function getFTS5IndexInfo(): Promise<FTS5IndexInfo> {
  if (!isTauriEnvironment()) {
    return { exists: false, table_name: '', indexed_at: null, row_count: 0 };
  }
  try {
    return await invoke<FTS5IndexInfo>('get_fts5_index_info');
  } catch {
    return { exists: false, table_name: '', indexed_at: null, row_count: 0 };
  }
}

/**
 * Query the local SQLite FTS5 index directly (no network request).
 * Returns ranked search results for the given query string.
 */
export async function searchLocal(
  query: string,
  storeId?: string | null,
  limit?: number,
): Promise<SearchResult[]> {
  if (!isTauriEnvironment()) return [];
  try {
    const results = await invoke<SearchResult[]>('search_fts5_local', {
      query,
      storeId: storeId ?? null,
      limit: limit ?? 50,
    });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

/**
 * Rebuild the local SQLite FTS5 index from the local product catalogue.
 */
export async function rebuildFTS5Index(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    const result = await invoke<boolean>('rebuild_fts5_index');
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DataService] Failed to rebuild FTS5 index:', err);
    return false;
  }
}

export interface DeleteAllDataResult {
  success: boolean;
  message: string;
}

export async function deleteAllData(confirmStoreName: string): Promise<DeleteAllDataResult> {
  if (isTauriEnvironment()) {
    try {
      const result = await invoke<string>('delete_all_data', { confirmStoreName });
      return { success: true, message: result };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DataService] Failed to delete all data:', err);
      return { success: false, message: String(err) };
    }
  }
  return { success: false, message: 'Not running in Tauri environment' };
}

export interface ServerWipeResult {
  message: string;
  wiped_tables: string[];
}

export async function wipeServerData(
  confirmStoreName: string,
  accessToken: string,
): Promise<ServerWipeResult> {
  const apiBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;
  const baseUrl = (apiBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/products/admin/wipe-all-data`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ confirm_store_name: confirmStoreName }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Server wipe failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<ServerWipeResult>;
}

/**
 * localStorage keys that hold business data which survives a page reload.
 *
 * `inven_tory_app_state_v1` (current view + active store) is intentionally
 * NOT cleared — stores are preserved by the wipe so it stays valid.
 * Auth session + device ID live in the Tauri secure store and sessionStorage
 * and are NEVER touched here so login keeps working after a wipe.
 */
const BUSINESS_CACHE_EXACT_KEYS = ['inven_tory_transactions_cache_v1'];
const BUSINESS_CACHE_PREFIXES = ['inven_tory_daybooks_', 'inven_tory_daybook_detail_'];

/**
 * Remove every locally cached business-data entry (transactions/day-books
 * caches). Safe to call in any environment; ignores storage errors.
 */
export function clearLocalBusinessCaches(): void {
  // In-memory stock balance cache lives outside localStorage — clear it too
  // so wiped databases don't keep serving stale quantities.
  invalidateStockBalanceCache();
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of BUSINESS_CACHE_EXACT_KEYS) {
      localStorage.removeItem(key);
    }
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && BUSINESS_CACHE_PREFIXES.some((p) => k.startsWith(p))) {
        staleKeys.push(k);
      }
    }
    staleKeys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore quota / private-mode errors — reload still resets React state
  }
}

/**
 * Purge local business caches that are older than the retention period.
 * Returns the number of entries purged.
 */
export function purgeExpiredLocalCaches(
  retentionDays: number = LOCAL_CACHE_RETENTION_DAYS,
): number {
  if (typeof localStorage === 'undefined') return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let purged = 0;
  try {
    // Check exact keys
    for (const key of BUSINESS_CACHE_EXACT_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.cachedAt && parsed.cachedAt < cutoff) {
            localStorage.removeItem(key);
            purged++;
          }
        } catch {
          // If not JSON or no cachedAt, keep it (legacy format)
        }
      }
    }
    // Check prefixed keys
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && BUSINESS_CACHE_PREFIXES.some((p) => k.startsWith(p))) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.cachedAt && parsed.cachedAt < cutoff) {
              staleKeys.push(k);
            }
          }
        } catch {
          // If not JSON or no cachedAt, keep it (legacy format)
        }
      }
    }
    staleKeys.forEach((k) => {
      localStorage.removeItem(k);
      purged++;
    });
  } catch {
    // ignore quota / private-mode errors
  }
  return purged;
}

/**
 * Wrapper to store business data with a cachedAt timestamp.
 * Call this instead of localStorage.setItem directly for business caches.
 */
export function setBusinessCacheItem<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // ignore quota / private-mode errors
  }
}

/**
 * Retrieve business data from cache, returning null if not found or expired.
 */
export function getBusinessCacheItem<T>(key: string, maxAgeMs?: number): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.cachedAt && maxAgeMs && Date.now() - parsed.cachedAt > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value as T;
  } catch {
    return null;
  }
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created_at: string;
}

export async function listLocalBackups(): Promise<BackupInfo[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<BackupInfo[]>('list_local_backups');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DataService] Failed to list backups:', err);
      return [];
    }
  }
  return [];
}

export async function createLocalBackup(): Promise<BackupInfo> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<BackupInfo>('create_local_backup');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DataService] Failed to create backup:', err);
      throw new Error(String(err));
    }
  }
  throw new Error('Not running in Tauri environment');
}

export async function restoreFromBackup(filename: string): Promise<string> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<string>('restore_from_backup', { filename });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DataService] Failed to restore backup:', err);
      throw new Error(String(err));
    }
  }
  throw new Error('Not running in Tauri environment');
}

export async function dailyBackupIfNeeded(): Promise<BackupInfo | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<BackupInfo | null>('daily_backup_if_needed');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DataService] Daily backup failed:', err);
      return null;
    }
  }
  return null;
}
