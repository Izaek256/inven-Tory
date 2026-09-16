import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';

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
