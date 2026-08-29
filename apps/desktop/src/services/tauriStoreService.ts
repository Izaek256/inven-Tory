import { invoke } from '@tauri-apps/api/core';
import { Store } from '../types/store';

// Fallback seed data for browser vitest and web preview
const MOCK_STORES: Store[] = [
  {
    id: 'STORE-ALPHA',
    code: 'ALPHA',
    name: 'Store Alpha (Main Flagship)',
    address: '100 Electronics Way, Tech District',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'STORE-BETA',
    code: 'BETA',
    name: 'Store Beta (Downtown)',
    address: '45 Market Street, Central City',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'STORE-GAMMA',
    code: 'GAMMA',
    name: 'Store Gamma (Suburban)',
    address: '888 Commerce Blvd, Westside',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Check if current runtime environment is inside a Tauri shell.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Fetch all stores from the local SQLite database via Tauri IPC command 'get_stores'.
 * Falls back to mock data when running in browser or unit test environment.
 */
export async function getStores(): Promise<Store[]> {
  if (isTauriEnvironment()) {
    try {
      const stores = await invoke<Store[]>('get_stores');
      return stores;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking get_stores IPC command:', err);
      throw new Error(`Failed to load stores from database: ${String(err)}`);
    }
  }

  // Web / Test fallback mode
  // eslint-disable-next-line no-console
  console.info('[TauriStoreService] Running outside Tauri context. Returning web fallback stores.');
  return MOCK_STORES;
}
