import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';

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
