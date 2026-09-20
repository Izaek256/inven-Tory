/**
 * Data-wipe regression guard: clearing business caches must remove every
 * locally cached business-data entry while preserving app/auth state.
 *
 * If a cache key survives the wipe, its page keeps showing stale records
 * after the database tables are empty.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalBusinessCaches } from '../services/tauriDataService';

describe('clearLocalBusinessCaches — wipe integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes transactions + all per-store day-book caches', () => {
    localStorage.setItem('inven_tory_transactions_cache_v1', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('inven_tory_daybooks_STORE-A', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('inven_tory_daybooks_STORE-B', JSON.stringify([{ id: 2 }]));
    localStorage.setItem('inven_tory_daybook_detail_DB-1', JSON.stringify({ id: 'DB-1' }));
    localStorage.setItem('inven_tory_daybook_detail_DB-2', JSON.stringify({ id: 'DB-2' }));

    clearLocalBusinessCaches();

    expect(localStorage.getItem('inven_tory_transactions_cache_v1')).toBeNull();
    expect(localStorage.getItem('inven_tory_daybooks_STORE-A')).toBeNull();
    expect(localStorage.getItem('inven_tory_daybooks_STORE-B')).toBeNull();
    expect(localStorage.getItem('inven_tory_daybook_detail_DB-1')).toBeNull();
    expect(localStorage.getItem('inven_tory_daybook_detail_DB-2')).toBeNull();
  });

  it('preserves app state and never touches session/auth storage', () => {
    const appState = JSON.stringify({ currentView: 'products', activeStoreId: 'STORE-A' });
    localStorage.setItem('inven_tory_app_state_v1', appState);
    localStorage.setItem('unrelated_key', 'keep');
    sessionStorage.setItem('inven_tory_device_id', 'DEV-1');

    clearLocalBusinessCaches();

    expect(localStorage.getItem('inven_tory_app_state_v1')).toBe(appState);
    expect(localStorage.getItem('unrelated_key')).toBe('keep');
    expect(sessionStorage.getItem('inven_tory_device_id')).toBe('DEV-1');
  });

  it('is a no-op on empty storage and never throws', () => {
    expect(() => clearLocalBusinessCaches()).not.toThrow();
  });
});
