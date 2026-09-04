import { invoke } from '@tauri-apps/api/core';
import { Store, CreateStoreInput, UpdateStoreInput, Device } from '../types/store';

/**
 * Check if current runtime environment is inside a Tauri shell.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function _fetchApi<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const { getAccessToken } = await import('./tauriAuthService');
    const token = await getAccessToken();
    const envBaseUrl =
      typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
        : undefined;
    const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
    if (res.ok) {
      return (await res.json()) as T;
    }
  } catch {
    // Network / API unreachable
  }
  return null;
}

/**
 * Fetch all stores from the local SQLite database via Tauri IPC command 'get_stores'.
 * Falls back to central API HTTP request when running in browser mode.
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

  const apiStores = await _fetchApi<Store[]>('/stores');
  if (apiStores) {
    return apiStores;
  }

  throw new Error(
    '[TauriStoreService] getStores() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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

  const created = await _fetchApi<Store>('/stores', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (created) return created;

  throw new Error(
    '[TauriStoreService] createStore() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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

  const updated = await _fetchApi<Store>(`/stores/${input.id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (updated) return updated;

  throw new Error(
    '[TauriStoreService] updateStore() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Activate or deactivate a store location (FR-STORE-001).
 */
export async function toggleStoreActive(id: string, is_active: boolean): Promise<Store> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Store>('toggle_store_active', { id, is_active });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking toggle_store_active:', err);
      throw new Error(String(err));
    }
  }

  const toggled = await _fetchApi<Store>(`/stores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
  if (toggled) return toggled;

  throw new Error(
    '[TauriStoreService] toggleStoreActive() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Device registration — FR-STORE-003.
 * Calls the register_device Tauri IPC command which writes to local SQLite.
 * The registered device_id is then used in the login flow.
 */
export async function registerDevice(storeId: string, deviceName: string): Promise<Device> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Device>('register_device', {
        store_id: storeId,
        device_name: deviceName,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriStoreService] Error invoking register_device:', err);
      throw new Error(String(err));
    }
  }

  const device = await _fetchApi<Device>('/devices/register', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, device_name: deviceName }),
  });
  if (device) return device;

  throw new Error(
    '[TauriStoreService] registerDevice() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}
