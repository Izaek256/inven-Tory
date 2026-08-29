import { invoke } from '@tauri-apps/api/core';
import { Store, CreateStoreInput, UpdateStoreInput, Device } from '../types/store';

// Fallback seed data for browser vitest and web preview
let MOCK_STORES: Store[] = [
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

const MOCK_DEVICES: Device[] = [];

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

  return [...MOCK_STORES];
}

/**
 * Create a new store record (FR-STORE-001, FR-STORE-002).
 */
export async function createStore(input: CreateStoreInput): Promise<Store> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Store>('create_store', { input });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking create_store:', err);
      throw new Error(String(err));
    }
  }

  // Mock implementation for web/test
  const codeClean = input.code.trim().toUpperCase();
  if (!codeClean) throw new Error('Store code cannot be empty.');
  if (!input.name.trim()) throw new Error('Store name cannot be empty.');

  if (MOCK_STORES.some((s) => s.code.toUpperCase() === codeClean)) {
    throw new Error(`Store code '${codeClean}' already exists.`);
  }

  const newStore: Store = {
    id: `STORE-${codeClean}`,
    code: codeClean,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  MOCK_STORES = [newStore, ...MOCK_STORES];
  return newStore;
}

/**
 * Update existing store name & address (code/id remain immutable per FR-STORE-002).
 */
export async function updateStore(input: UpdateStoreInput): Promise<Store> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Store>('update_store', { input });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking update_store:', err);
      throw new Error(String(err));
    }
  }

  // Mock implementation for web/test
  const index = MOCK_STORES.findIndex((s) => s.id === input.id);
  if (index === -1) throw new Error(`Store with ID '${input.id}' not found.`);

  if (!input.name.trim()) throw new Error('Store name cannot be empty.');

  const updatedStore: Store = {
    ...MOCK_STORES[index],
    name: input.name.trim(),
    address: input.address?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  MOCK_STORES[index] = updatedStore;
  return updatedStore;
}

/**
 * Activate or deactivate a store location (FR-STORE-001).
 */
export async function toggleStoreActive(id: string, is_active: boolean): Promise<Store> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Store>('toggle_store_active', { id, isActive: is_active });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking toggle_store_active:', err);
      throw new Error(String(err));
    }
  }

  // Mock implementation for web/test
  const index = MOCK_STORES.findIndex((s) => s.id === id);
  if (index === -1) throw new Error(`Store with ID '${id}' not found.`);

  const updatedStore: Store = {
    ...MOCK_STORES[index],
    is_active,
    updated_at: new Date().toISOString(),
  };

  MOCK_STORES[index] = updatedStore;
  return updatedStore;
}

/**
 * Device registration stub (FR-STORE-003).
 * TODO(issue-13): Replace with full server-side OAuth device pairing in Issue 13
 */
export async function registerDevice(storeId: string, deviceName: string): Promise<Device> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Device>('register_device', {
        storeId,
        deviceName,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking register_device:', err);
      throw new Error(String(err));
    }
  }

  if (!deviceName.trim()) throw new Error('Device name cannot be empty.');

  const device: Device = {
    id: `DEV-${Date.now()}`,
    store_id: storeId,
    device_name: deviceName.trim(),
    is_active: true,
    registered_at: new Date().toISOString(),
    last_seen_at: null,
  };

  MOCK_DEVICES.push(device);
  return device;
}

