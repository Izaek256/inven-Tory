/**
 * dashboardService.listStores must never surface auto-provisioned
 * "Auto Store (...)" placeholders as real stores.
 *
 * Regression test: with 3 real stores + 1 ingestion placeholder in the
 * database, the dashboard rendered 4 store tabs. The placeholder (created
 * when the desktop pushes an unknown store id) must be filtered out so the
 * dashboard shows exactly the 3 real stores.
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
  { id: 'STORE-MAIN', code: 'MAIN', name: 'ALGA-MAIN-STORE', is_active: true },
  { id: 'STORE-KATWE', code: 'KATWE', name: 'ALGA-KATWE-MUSISI', is_active: true },
  { id: 'c78c77b6', code: 'ALGA-YAMAHA', name: 'ALGA-YAMAHA-STORE', is_active: true },
  {
    id: 'STORE-ALGA-YAMAHA',
    code: 'STORE-ALGA-YAMAHA',
    name: 'Auto Store (STORE-ALGA-YAMAHA)',
    is_active: true,
  },
];

describe('listStores placeholder filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(SERVER_ROWS);
  });

  it('excludes "Auto Store" placeholders by default', async () => {
    const stores = await listStores();
    expect(mockGet).toHaveBeenCalledWith('/stores');
    expect(stores).toHaveLength(3);
    expect(stores.map((s) => s.id)).toEqual(['STORE-MAIN', 'STORE-KATWE', 'c78c77b6']);
    expect(stores.some((s) => s.name.startsWith('Auto Store ('))).toBe(false);
  });

  it('returns placeholders when explicitly requested', async () => {
    const stores = await listStores(true);
    expect(stores).toHaveLength(4);
  });
});
