/**
 * dashboardService.listStores must correctly handle auto-provisioned
 * "Auto Store (...)" placeholders.
 *
 * Placeholder stores with actual data (inventory/transactions) should be visible
 * in the dashboard. The backend marks these with is_placeholder=true.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { api } from '../services/apiClient';
import { listStores } from '../services/dashboardService';

vi.mock('../services/apiClient', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockGet = vi.mocked(api.get);

const SERVER_ROWS = [
  {
    id: 'STORE-MAIN',
    code: 'MAIN',
    name: 'ALGA-MAIN-STORE',
    is_active: true,
    is_placeholder: false,
  },
  {
    id: 'STORE-KATWE',
    code: 'KATWE',
    name: 'ALGA-KATWE-MUSISI',
    is_active: true,
    is_placeholder: false,
  },
  {
    id: 'c78c77b6',
    code: 'ALGA-YAMAHA',
    name: 'ALGA-YAMAHA-STORE',
    is_active: true,
    is_placeholder: false,
  },
  {
    id: 'STORE-ALGA-YAMAHA',
    code: 'STORE-ALGA-YAMAHA',
    name: 'Auto Store (STORE-ALGA-YAMAHA)',
    is_active: true,
    is_placeholder: true,
  },
];

describe('listStores placeholder filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(SERVER_ROWS);
  });

  it('keeps auto-provisioned placeholders so their stock stays visible', async () => {
    const stores = await listStores();
    // Placeholders must be requested explicitly — the server drops them otherwise.
    expect(mockGet).toHaveBeenCalledWith('/stores?include_placeholders=true');
    expect(stores).toHaveLength(4);
    expect(stores.map((s) => s.id)).toEqual([
      'STORE-MAIN',
      'STORE-KATWE',
      'c78c77b6',
      'STORE-ALGA-YAMAHA',
    ]);
    expect(stores.some((s) => s.name.startsWith('Auto Store ('))).toBe(true);
  });

  it('drops placeholders that are inactive, but keeps inactive real stores', async () => {
    mockGet.mockResolvedValue([
      { id: 'a', code: 'A', name: 'Real A', is_active: false, is_placeholder: false },
      { id: 'b', code: 'B', name: 'Auto Store (B)', is_active: false, is_placeholder: true },
      { id: 'c', code: 'C', name: 'Auto Store (C)', is_active: true, is_placeholder: true },
    ]);
    const stores = await listStores();
    expect(stores.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns the raw server list when includePlaceholders=true', async () => {
    const stores = await listStores(true);
    expect(stores).toHaveLength(4);
    expect(mockGet).toHaveBeenCalledWith('/stores?include_placeholders=true');
  });
});
