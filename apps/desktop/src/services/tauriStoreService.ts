import { invoke } from '@tauri-apps/api/core';
import { Store, CreateStoreInput, UpdateStoreInput, Device } from '../types/store';
import * as self from './tauriStoreService';

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers,
        signal: options.signal ?? controller.signal,
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
    } finally {
      clearTimeout(timer);
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
  if (self.isTauriEnvironment()) {
    try {
      const stores = await invoke<Store[]>('get_stores');
      return stores;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Error invoking get_stores IPC command:', err);
      throw new Error(`Failed to load stores from database: ${String(err)}`);
    }
  }

  const apiStores = await _fetchApi<Store[]>('/stores');
  if (apiStores) {
    return apiStores;
  }

  throw new Error('[StoreService] getStores() requires the desktop app runtime.');
}

/**
 * Queue for failed store pushes to retry later.
 */
const _pendingPushQueue: Array<{
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  retries: number;
}> = [];

let _isProcessingQueue = false;
let _queueRetryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Process the pending push queue with retry logic.
 * Items that fail are re-queued for the next cycle (via online event or timer),
 * not retried in a tight loop.
 */
async function _processPushQueue(): Promise<void> {
  if (_isProcessingQueue || _pendingPushQueue.length === 0) return;
  _isProcessingQueue = true;

  const items = [..._pendingPushQueue];
  _pendingPushQueue.length = 0;

  for (const item of items) {
    let success = false;
    for (let attempt = 0; attempt <= item.retries; attempt++) {
      try {
        await _fetchApi<Store>(item.path, {
          method: item.method,
          body: JSON.stringify(item.body),
        });
        success = true;
        break;
      } catch {
        if (attempt < item.retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    if (!success) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Failed to push store after retries:', item.path, item.body);
      // Re-queue with reduced retry count for next processing cycle
      _pendingPushQueue.push({ ...item, retries: Math.max(0, item.retries - 1) });
    }
  }

  _isProcessingQueue = false;

  // If there are still items in the queue, schedule a retry
  if (_pendingPushQueue.length > 0) {
    _scheduleQueueRetry();
  }
}

function _scheduleQueueRetry(): void {
  if (_queueRetryTimer) {
    clearTimeout(_queueRetryTimer);
  }
  // Retry after 30 seconds, or on next online event
  _queueRetryTimer = setTimeout(() => {
    _queueRetryTimer = null;
    void _processPushQueue();
  }, 30_000);
}

/**
 * Best-effort push of a local store change to the central API so the server's
 * copy of the store (name/address/active state) stays in sync with the local
 * SQLite database. Without this, the next sync pull would overwrite local
 * renames or freshly created store names with stale server / auto-provisioned
 * placeholder data ("Auto Store (...)").
 *
 * Local SQLite is the source of truth while offline; failures here are non-fatal.
 * Now includes exponential backoff retry and persistent queue for offline scenarios.
 */
async function _pushStoreToApi(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  retries = 3,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await _fetchApi<Store>(path, { method, body: JSON.stringify(body) });
      return; // Success
    } catch {
      if (attempt === retries) {
        // eslint-disable-next-line no-console
        console.error('[StoreService] Failed to push store after retries, queueing:', body);
        // Queue for later retry when connectivity may be restored
        _pendingPushQueue.push({ method, path, body, retries: 2 });
        // Kick off queue processing
        void _processPushQueue();
        return;
      }
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

function _dispatchStoresUpdated(): void {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('inven-tory:stores-updated'));
    }, 0);
  }
}

// Process queued pushes when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void _processPushQueue();
  });
}

/**
 * Create a new store record.
 */
export async function createStore(input: CreateStoreInput): Promise<Store> {
  if (self.isTauriEnvironment()) {
    try {
      const created = await invoke<Store>('create_store', { input });
      // Mirror the new store to the server with the deterministic ID so the
      // server uses the same ID and avoids creating duplicate "Auto Store" entries.
      const payload = { ...input, id: created.id };
      void _pushStoreToApi('POST', '/stores', payload);
      _dispatchStoresUpdated();
      return created;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Error invoking create_store:', err);
      throw new Error(String(err));
    }
  }

  // For web/browser fallback, we need to generate the deterministic ID
  const payload = { ...input, id: `STORE-${input.code.trim().toUpperCase()}` };
  const created = await _fetchApi<Store>('/stores', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (created) {
    _dispatchStoresUpdated();
    return created;
  }

  throw new Error('[StoreService] createStore() requires the desktop app runtime.');
}

/**
 * Update existing store name & address (code/id remain immutable).
 */
export async function updateStore(input: UpdateStoreInput): Promise<Store> {
  if (self.isTauriEnvironment()) {
    try {
      const updated = await invoke<Store>('update_store', { input });
      // Keep the server's store row in sync so renames survive refresh/sync pulls.
      void _pushStoreToApi('PATCH', `/stores/${input.id}`, {
        name: input.name,
        address: input.address,
      });
      _dispatchStoresUpdated();
      return updated;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Error invoking update_store:', err);
      throw new Error(String(err));
    }
  }

  const updated = await _fetchApi<Store>(`/stores/${input.id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (updated) {
    _dispatchStoresUpdated();
    return updated;
  }

  throw new Error('[StoreService] updateStore() requires the desktop app runtime.');
}

/**
 * Activate or deactivate a store location.
 */
export async function toggleStoreActive(id: string, is_active: boolean): Promise<Store> {
  if (self.isTauriEnvironment()) {
    try {
      const toggled = await invoke<Store>('toggle_store_active', {
        id,
        isActive: is_active,
        is_active,
      });
      void _pushStoreToApi('PATCH', `/stores/${id}`, { is_active });
      _dispatchStoresUpdated();
      return toggled;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Error invoking toggle_store_active:', err);
      throw new Error(String(err));
    }
  }

  const toggled = await _fetchApi<Store>(`/stores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
  if (toggled) {
    _dispatchStoresUpdated();
    return toggled;
  }

  throw new Error('[StoreService] toggleStoreActive() requires the desktop app runtime.');
}

/**
 * Device registration.
 * Calls the register_device Tauri IPC command which writes to local SQLite.
 * The registered device_id is then used in the login flow.
 */
export async function registerDevice(storeId: string, deviceName: string): Promise<Device> {
  if (self.isTauriEnvironment()) {
    try {
      return await invoke<Device>('register_device', {
        storeId,
        store_id: storeId,
        deviceName,
        device_name: deviceName,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StoreService] Error invoking register_device:', err);
      throw new Error(String(err));
    }
  }

  const device = await _fetchApi<Device>('/devices/register', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, device_name: deviceName }),
  });
  if (device) return device;

  throw new Error('[StoreService] registerDevice() requires the desktop app runtime.');
}
