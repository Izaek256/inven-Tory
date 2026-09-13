/**
 * SearchView component tests.
 * Mocks the dashboardService to avoid real API calls.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchView } from '../views/SearchView';
import type { ProductInventoryResponse, ProductSearchResponse } from '../types/dashboard';

// ── Service mock ────────────────────────────────────────────────────────────
vi.mock('../services/dashboardService', () => ({
  searchProducts: vi.fn(),
  getProductInventory: vi.fn(),
  getProductHistory: vi.fn(),
}));

import * as svc from '../services/dashboardService';

// Wrap in minimal providers (ThemeProvider injects tokens via JS — not needed for unit tests)
function renderSearch(): ReturnType<typeof render> {
  return render(<SearchView />);
}

const MOCK_RESULTS: ProductSearchResponse = {
  query: 'hisense',
  total: 2,
  results: [
    {
      id: 'prod-1',
      sku: 'HIS-120L',
      name: 'Hisense 120L Fridge',
      brand: 'Hisense',
      model: '120L',
      category: 'Appliances',
      unit: 'pcs',
      is_active: true,
      low_stock_threshold: 5,
      total_quantity: 42,
      last_balance_update: new Date(Date.now() - 3_600_000).toISOString(),
      store_quantities: [
        { store_id: 'store-a', store_name: 'Store Alpha', quantity: 24 },
        { store_id: 'store-b', store_name: 'Store Beta', quantity: 18 },
      ],
    },
    {
      id: 'prod-2',
      sku: 'HIS-150L',
      name: 'Hisense 150L Fridge',
      brand: 'Hisense',
      model: '150L',
      category: 'Appliances',
      unit: 'pcs',
      is_active: false,
      low_stock_threshold: null,
      total_quantity: 0,
      last_balance_update: null,
      store_quantities: [
        { store_id: 'store-a', store_name: 'Store Alpha', quantity: 0 },
        { store_id: 'store-b', store_name: 'Store Beta', quantity: 0 },
      ],
    },
  ],
};

/** Empty catalogue response — returned by default on mount (empty-query call). */
const EMPTY_CATALOGUE: ProductSearchResponse = {
  query: '',
  total: 0,
  results: [],
};

const MOCK_INVENTORY: ProductInventoryResponse = {
  product_id: 'prod-1',
  product_name: 'Hisense 120L Fridge',
  product_sku: 'HIS-120L',
  total_quantity: 200,
  stores: [
    {
      store_id: 'store-a',
      store_code: 'A01',
      store_name: 'Store Alpha',
      stock_bucket: 'AVAILABLE',
      quantity: 120,
      updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
    {
      store_id: 'store-b',
      store_code: 'B01',
      store_name: 'Store Beta',
      stock_bucket: 'AVAILABLE',
      quantity: 80,
      updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
  ],
};

describe('SearchView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: on-mount catalogue load returns empty list
    vi.mocked(svc.searchProducts).mockResolvedValue(EMPTY_CATALOGUE);
  });

  it('renders search input on mount', async () => {
    renderSearch();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    // Wait for the initial catalogue load to settle
    await waitFor(() => expect(screen.getByTestId('search-view')).toBeInTheDocument());
  });

  it('shows empty catalogue state after mount when no products exist', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText(/No products in catalogue/i)).toBeInTheDocument();
    });
  });

  it('shows search results after typing', async () => {
    vi.mocked(svc.searchProducts).mockResolvedValue(MOCK_RESULTS);
    renderSearch();

    // Wait for initial load to complete
    await waitFor(() => screen.getByTestId('search-results-table'));

    const input = screen.getByTestId('search-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'hisense');

    await waitFor(() => {
      expect(screen.getByText('Hisense 120L Fridge')).toBeInTheDocument();
    });
    expect(screen.getByText('Hisense 150L Fridge')).toBeInTheDocument();
  });

  it('shows "no products found" for empty results', async () => {
    vi.mocked(svc.searchProducts).mockResolvedValue({
      query: 'xyznotfound',
      total: 0,
      results: [],
    });
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText(/No products in catalogue/i)).toBeInTheDocument();
    });

    const input = screen.getByTestId('search-input');
    await userEvent.type(input, 'xyznotfound');

    await waitFor(() => {
      expect(screen.getByText(/No products found/i)).toBeInTheDocument();
    });
  });

  it('navigates to inventory panel when View is clicked', async () => {
    vi.mocked(svc.searchProducts).mockResolvedValue(MOCK_RESULTS);
    vi.mocked(svc.getProductInventory).mockResolvedValue(MOCK_INVENTORY);
    renderSearch();

    await waitFor(() => {
      expect(screen.getByTestId('view-product-prod-1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('view-product-prod-1'));

    await waitFor(() => {
      expect(screen.getByTestId('inventory-panel')).toBeInTheDocument();
    });
  });

  it('shows per-store quantities and global total in inventory panel', async () => {
    vi.mocked(svc.searchProducts).mockResolvedValue(MOCK_RESULTS);
    vi.mocked(svc.getProductInventory).mockResolvedValue(MOCK_INVENTORY);
    renderSearch();

    await waitFor(() => screen.getByTestId('view-product-prod-1'));
    await userEvent.click(screen.getByTestId('view-product-prod-1'));

    await waitFor(() => {
      expect(screen.getByTestId('total-quantity')).toBeInTheDocument();
    });

    expect(screen.getByTestId('total-quantity')).toHaveTextContent('200');
    expect(screen.getByTestId('inventory-table')).toBeInTheDocument();
    expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    expect(screen.getByText('Store Beta')).toBeInTheDocument();
  });

  it('back button returns to search results', async () => {
    vi.mocked(svc.searchProducts).mockResolvedValue(MOCK_RESULTS);
    vi.mocked(svc.getProductInventory).mockResolvedValue(MOCK_INVENTORY);
    renderSearch();

    await waitFor(() => screen.getByTestId('view-product-prod-1'));
    await userEvent.click(screen.getByTestId('view-product-prod-1'));
    await waitFor(() => screen.getByTestId('inventory-panel'));

    await userEvent.click(screen.getByTestId('back-btn'));
    expect(screen.getByTestId('search-view')).toBeInTheDocument();
  });
});
