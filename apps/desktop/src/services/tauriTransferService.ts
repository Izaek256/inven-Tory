import { invoke } from '@tauri-apps/api/core';
import { Transfer, CreateTransferInput } from '../types/transfer';
import { isTauriEnvironment } from './tauriStoreService';
import { getMockBalance, setMockBalance } from './tauriTransactionService';

/**
 * In-memory mock transfers storage for web/testing environment.
 */
export const MOCK_TRANSFERS = new Map<string, Transfer>();

/**
 * Fetch all multi-store transfers (Section 11).
 */
export async function getTransfers(): Promise<Transfer[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer[]>('get_transfers');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransferService] Error invoking get_transfers:', err);
      throw new Error(`Failed to load transfers: ${String(err)}`);
    }
  }

  throw new Error(
    '[TauriTransferService] getTransfers() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
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
      console.error('[TauriTransferService] Error invoking create_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransferService] createTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Dispatch a transfer (DRAFT -> DISPATCHED).
 * Deducts stock from source store (quantity_delta = -quantity).
 * Enforces strict-mode negative stock check.
 */
export async function dispatchTransfer(
  transferId: string,
  userId: string = 'USER-DEMO',
  deviceId: string = 'DEV-DEMO',
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('dispatch_transfer', {
        transfer_id: transferId,
        user_id: userId,
        device_id: deviceId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransferService] Error invoking dispatch_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransferService] dispatchTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Confirm receipt of a transfer (DISPATCHED/EXCEPTION -> RECEIVED).
 * Increases stock at destination store (quantity_delta = +quantity).
 */
export async function receiveTransfer(
  transferId: string,
  userId: string = 'USER-DEMO',
  deviceId: string = 'DEV-DEMO',
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('receive_transfer', {
        transfer_id: transferId,
        user_id: userId,
        device_id: deviceId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransferService] Error invoking receive_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransferService] receiveTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Cancel a transfer.
 * If already dispatched, restores stock to source store (+quantity).
 */
export async function cancelTransfer(
  transferId: string,
  userId: string = 'USER-DEMO',
  deviceId: string = 'DEV-DEMO',
): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('cancel_transfer', {
        transfer_id: transferId,
        user_id: userId,
        device_id: deviceId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransferService] Error invoking cancel_transfer:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransferService] cancelTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Mark transfer exception (DISPATCHED -> EXCEPTION).
 */
export async function markTransferException(transferId: string, notes?: string): Promise<Transfer> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Transfer>('mark_transfer_exception', {
        transfer_id: transferId,
        notes,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriTransferService] Error invoking mark_transfer_exception:', err);
      throw new Error(String(err));
    }
  }

  throw new Error(
    '[TauriTransferService] markTransferException() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}
