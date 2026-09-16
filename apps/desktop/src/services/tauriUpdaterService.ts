import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
  manifest?: string;
  error?: string;
}

export async function checkAppUpdate(): Promise<UpdateInfo> {
  if (isTauriEnvironment()) {
    try {
      const result = await invoke<UpdateInfo | null>('check_app_update');
      return result ?? { available: false };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UpdaterService] Failed to check for updates:', err);
      return { available: false, error: String(err) };
    }
  }
  return { available: false, error: 'Not running in Tauri environment' };
}

export async function downloadAndInstallUpdate(): Promise<string> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<string>('download_and_install_update');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UpdaterService] Failed to download and install update:', err);
      throw new Error(String(err));
    }
  }
  throw new Error('Not running in Tauri environment');
}

// Mock helpers for testing
export let _mockUpdateInfo: UpdateInfo | null = null;

export function setMockUpdateInfo(info: UpdateInfo | null): void {
  _mockUpdateInfo = info;
}

export function resetMockUpdaterState(): void {
  _mockUpdateInfo = null;
}
