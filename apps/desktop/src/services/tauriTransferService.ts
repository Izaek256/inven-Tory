import { invoke } from '@tauri-apps/api/core';
import { Transfer, CreateTransferInput } from '../types/transfer';
import { isTauriEnvironment } from './tauriStoreService';

function _triggerAutoSync(): void {
  const envBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;
  const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

  import('./tauriSyncService')
    .then(({ triggerSync }) => {
      void triggerSync({ apiBaseUrl }).catch(() => undefined);
    })
    .catch(() => undefined);
}

/**
 * Fetch all multi-store transfers.
 */
export async function getTransfers(): Promise<Transfer[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer[]>('get_transfers');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking get_transfers:', err);
      throw new Error(`Failed to load transfers: ${String(err)}`);
    }
  }

  throw new Error('[TransferService] getTransfers() requires the desktop app runtime.');
}

/**
 * Create a new inter-store transfer in DRAFT status.
 */
export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('create_transfer', { input });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking create_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransferService] createTransfer() requires the desktop app runtime.');
}

/**
 * Dispatch a transfer (DRAFT -> DISPATCHED).
 * Deducts stock from source store (quantity_delta = -quantity).
 * Enforces strict-mode negative stock check.
 */
export async function dispatchTransfer(
  transferId: string,
  userId: string,
  deviceId: string,
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<Transfer>('dispatch_transfer', {
        transferId,
        transfer_id: transferId,
        userId,
        user_id: userId,
        deviceId,
        device_id: deviceId,
      });
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking dispatch_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransferService] dispatchTransfer() requires the desktop app runtime.');
}

/**
 * Confirm receipt of a transfer (DISPATCHED/EXCEPTION -> RECEIVED).
 * Increases stock at destination store (quantity_delta = +quantity).
 */
export async function receiveTransfer(
  transferId: string,
  userId: string,
  deviceId: string,
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<Transfer>('receive_transfer', {
        transferId,
        transfer_id: transferId,
        userId,
        user_id: userId,
        deviceId,
        device_id: deviceId,
      });
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking receive_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransferService] receiveTransfer() requires the desktop app runtime.');
}

/**
 * Cancel a transfer.
 * If already dispatched, restores stock to source store (+quantity).
 */
export async function cancelTransfer(
  transferId: string,
  userId: string,
  deviceId: string,
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<Transfer>('cancel_transfer', {
        transferId,
        transfer_id: transferId,
        userId,
        user_id: userId,
        deviceId,
        device_id: deviceId,
      });
      _triggerAutoSync();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking cancel_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransferService] cancelTransfer() requires the desktop app runtime.');
}

/**
 * Mark transfer exception (DISPATCHED -> EXCEPTION).
 */
export async function markTransferException(transferId: string, notes?: string): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('mark_transfer_exception', {
        transferId,
        transfer_id: transferId,
        notes,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TransferService] Error invoking mark_transfer_exception:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[TransferService] markTransferException() requires the desktop app runtime.');
}
