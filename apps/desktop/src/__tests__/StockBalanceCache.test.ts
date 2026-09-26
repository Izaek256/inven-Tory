/**
 * P2 (optimization plan): in-memory stock balance cache.
 *
 * Balances are cached per (store, product, bucket) so list-heavy views don't
 * re-fetch from SQLite on every pass. The cache is invalidated on local
 * mutations, on business-cache wipes, and after a sync pull.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../services/tauriStoreService', () => ({
  isTauriEnvironment: vi.fn().mockReturnValue(true),
}));
// Keep the auto-sync side-effect out of the tests.
vi.mock('../services/tauriSyncService', () => ({
  triggerSync: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from '@tauri-apps/api/core';
import { clearLocalBusinessCaches } from '../services/tauriDataService';
import {
  getStockBalance,
  getStockBalanceForBucket,
  getStockBalancesForStore,
  invalidateStockBalanceCache,
  sellStock,
} from '../services/tauriTransactionService';

const invokeMock = vi.mocked(invoke);

function commandCallCount(cmd: string): number {
  return invokeMock.mock.calls.filter((c) => c[0] === cmd).length;
}

describe('stock balance cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateStockBalanceCache();
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'get_stock_balance':
          return 7;
        case 'get_stock_balances_for_store':
          return [
            { product_id: 'P1', quantity: 5 },
            { product_id: 'P2', quantity: 9 },
          ];
        case 'get_stock_balance_for_bucket':
          return 3;
        case 'sell_stock':
          return { id: 'TX-1', transaction_id: 'TX-1' };
        default:
          return undefined;
      }
    });
  });

  it('serves repeated getStockBalance reads from memory (one IPC call)', async () => {
    const a = await getStockBalance('STORE-A', 'P1');
    const b = await getStockBalance('STORE-A', 'P1');
    const c = await getStockBalance('STORE-A', 'P1');

    expect(commandCallCount('get_stock_balance')).toBe(1);
    expect(a.quantity).toBe(7);
    expect(b.quantity).toBe(7);
    expect(c.quantity).toBe(7);
  });

  it('keys the cache per store — different stores are separate entries', async () => {
    await getStockBalance('STORE-A', 'P1');
    await getStockBalance('STORE-B', 'P1');
    await getStockBalance('STORE-A', 'P1');
    await getStockBalance('STORE-B', 'P1');

    expect(commandCallCount('get_stock_balance')).toBe(2);
  });

  it('caches getStockBalanceForBucket lookups per bucket', async () => {
    await getStockBalanceForBucket('STORE-A', 'P1', 'AVAILABLE');
    await getStockBalanceForBucket('STORE-A', 'P1', 'AVAILABLE');
    expect(commandCallCount('get_stock_balance_for_bucket')).toBe(1);

    await getStockBalanceForBucket('STORE-A', 'P1', 'QUARANTINE');
    expect(commandCallCount('get_stock_balance_for_bucket')).toBe(2);
  });

  it('getStockBalancesForStore primes the per-product cache', async () => {
    const map = await getStockBalancesForStore('STORE-A');
    expect(map.get('P1')).toBe(5);

    // These hit the cache primed by the bulk fetch — no extra IPC.
    const p1 = await getStockBalance('STORE-A', 'P1');
    const p2 = await getStockBalance('STORE-A', 'P2');

    expect(commandCallCount('get_stock_balances_for_store')).toBe(1);
    expect(commandCallCount('get_stock_balance')).toBe(0);
    expect(p1.quantity).toBe(5);
    expect(p2.quantity).toBe(9);
  });

  it('a local mutation invalidates the cache (next read refetches)', async () => {
    await getStockBalance('STORE-A', 'P1');
    expect(commandCallCount('get_stock_balance')).toBe(1);

    await sellStock({
      store_id: 'STORE-A',
      product_id: 'P1',
      movement_type: 'SALE',
      quantity: 1,
      user_id: 'USER-1',
      device_id: 'DEV-1',
    });

    await getStockBalance('STORE-A', 'P1');
    expect(commandCallCount('get_stock_balance')).toBe(2);
  });

  it('clearLocalBusinessCaches (wipe) also drops cached balances', async () => {
    await getStockBalance('STORE-A', 'P1');
    expect(commandCallCount('get_stock_balance')).toBe(1);

    clearLocalBusinessCaches();

    await getStockBalance('STORE-A', 'P1');
    expect(commandCallCount('get_stock_balance')).toBe(2);
  });
});
