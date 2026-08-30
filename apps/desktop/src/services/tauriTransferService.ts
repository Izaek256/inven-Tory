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

  // Mock implementation for web/test
  return Array.from(MOCK_TRANSFERS.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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

  // Mock validation for web/test
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  if (input.source_store_id === input.destination_store_id) {
    throw new Error('Source store and destination store must be different.');
  }

  const now = new Date().toISOString();
  const transferId = `TRF-${Date.now()}`;
  const transfer: Transfer = {
    id: transferId,
    source_store_id: input.source_store_id,
    destination_store_id: input.destination_store_id,
    product_id: input.product_id,
    quantity: input.quantity,
    status: 'DRAFT',
    created_by_user_id: input.created_by_user_id,
    notes: input.notes || null,
    created_at: now,
    updated_at: now,
  };

  MOCK_TRANSFERS.set(transferId, transfer);
  return transfer;
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

  const transfer = MOCK_TRANSFERS.get(transferId);
  if (!transfer) {
    throw new Error(`Transfer with ID '${transferId}' not found.`);
  }

  if (transfer.status !== 'DRAFT') {
    throw new Error(`Cannot dispatch transfer in '${transfer.status}' status. Must be in DRAFT.`);
  }

  const available = getMockBalance(transfer.source_store_id, transfer.product_id, 'AVAILABLE');
  if (transfer.quantity > available) {
    throw new Error(
      `Insufficient stock at source store. Available: ${available}, required: ${transfer.quantity}.`,
    );
  }

  // Deduct from source store
  setMockBalance(
    transfer.source_store_id,
    transfer.product_id,
    'AVAILABLE',
    available - transfer.quantity,
  );

  const updated: Transfer = {
    ...transfer,
    status: 'DISPATCHED',
    updated_at: new Date().toISOString(),
  };
  MOCK_TRANSFERS.set(transferId, updated);
  return updated;
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

  const transfer = MOCK_TRANSFERS.get(transferId);
  if (!transfer) {
    throw new Error(`Transfer with ID '${transferId}' not found.`);
  }

  if (transfer.status !== 'DISPATCHED' && transfer.status !== 'EXCEPTION') {
    throw new Error(`Cannot confirm receipt for transfer in '${transfer.status}' status.`);
  }

  // Increase stock at destination store
  const destCurrent = getMockBalance(
    transfer.destination_store_id,
    transfer.product_id,
    'AVAILABLE',
  );
  setMockBalance(
    transfer.destination_store_id,
    transfer.product_id,
    'AVAILABLE',
    destCurrent + transfer.quantity,
  );

  const updated: Transfer = {
    ...transfer,
    status: 'RECEIVED',
    updated_at: new Date().toISOString(),
  };
  MOCK_TRANSFERS.set(transferId, updated);
  return updated;
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

  const transfer = MOCK_TRANSFERS.get(transferId);
  if (!transfer) {
    throw new Error(`Transfer with ID '${transferId}' not found.`);
  }

  if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') {
    throw new Error(`Cannot cancel transfer in terminal status '${transfer.status}'.`);
  }

  if (transfer.status === 'DISPATCHED' || transfer.status === 'EXCEPTION') {
    const sourceCurrent = getMockBalance(
      transfer.source_store_id,
      transfer.product_id,
      'AVAILABLE',
    );
    setMockBalance(
      transfer.source_store_id,
      transfer.product_id,
      'AVAILABLE',
      sourceCurrent + transfer.quantity,
    );
  }

  const updated: Transfer = {
    ...transfer,
    status: 'CANCELLED',
    updated_at: new Date().toISOString(),
  };
  MOCK_TRANSFERS.set(transferId, updated);
  return updated;
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

  const transfer = MOCK_TRANSFERS.get(transferId);
  if (!transfer) {
    throw new Error(`Transfer with ID '${transferId}' not found.`);
  }

  if (transfer.status !== 'DISPATCHED') {
    throw new Error(
      `Cannot mark exception for transfer in '${transfer.status}' status. Must be DISPATCHED.`,
    );
  }

  const newNotes = notes
    ? transfer.notes
      ? `${transfer.notes}; EXCEPTION: ${notes}`
      : `EXCEPTION: ${notes}`
    : transfer.notes || 'EXCEPTION: Flagged for discrepancy review';

  const updated: Transfer = {
    ...transfer,
    status: 'EXCEPTION',
    notes: newNotes,
    updated_at: new Date().toISOString(),
  };
  MOCK_TRANSFERS.set(transferId, updated);
  return updated;
}
