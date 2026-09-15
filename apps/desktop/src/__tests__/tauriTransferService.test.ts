import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('../services/tauriSyncService', () => ({
  triggerSync: vi.fn().mockResolvedValue(undefined),
}));

import {
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  markTransferException,
} from '../services/tauriTransferService';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(() => Promise.resolve(undefined));
});

describe('tauriTransferService IPC argument naming', () => {
  it('dispatch_transfer receives camelCase transferId/userId/deviceId keys', async () => {
    await dispatchTransfer('TRF-1', 'USER-1', 'DEV-1');
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'dispatch_transfer');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({
      transferId: 'TRF-1',
      userId: 'USER-1',
      deviceId: 'DEV-1',
    });
  });

  it('receive_transfer receives camelCase transferId/userId/deviceId keys', async () => {
    await receiveTransfer('TRF-1', 'USER-1', 'DEV-1');
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'receive_transfer');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({
      transferId: 'TRF-1',
      userId: 'USER-1',
      deviceId: 'DEV-1',
    });
  });

  it('cancel_transfer receives camelCase transferId/userId/deviceId keys', async () => {
    await cancelTransfer('TRF-1', 'USER-1', 'DEV-1');
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'cancel_transfer');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({
      transferId: 'TRF-1',
      userId: 'USER-1',
      deviceId: 'DEV-1',
    });
  });

  it('mark_transfer_exception receives camelCase transferId key', async () => {
    await markTransferException('TRF-1', 'damaged');
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'mark_transfer_exception');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({
      transferId: 'TRF-1',
      notes: 'damaged',
    });
  });
});
