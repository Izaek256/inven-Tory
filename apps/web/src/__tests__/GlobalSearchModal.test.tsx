/**
 * Web GlobalSearchModal — parity with the desktop Global search modal.
 *
 * Same flow/behavior: opens with the full catalogue across all stores,
 * filters by name/SKU/brand/model/category, renders Product | per-store
 * columns | Total, caps at 50 rows, and stays read-only.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import * as dashboardService from '../services/dashboardService';
import type { ProductSearchResult } from '../types/dashboard';

vi.mock('../services/dashboardService');
const mockSearchProducts = vi.mocked(dashboardService.searchProducts);

const STORES = [
  { id: 's1', name: 'Main Store' },
  { id: 's2', name: 'Depot' },
];

function result(overrides: Partial<ProductSearchResult> & { id: string }): ProductSearchResult {
  return {
    sku: `SKU-${overrides.id}`,
    name: `Product ${overrides.id}`,
    brand: null,
    model: null,
    category: 'General',
    unit: 'pcs',
    is_active: true,
    low_stock_threshold: null,
    total_quantity: 0,
    last_balance_update: null,
    store_quantities: [],
    ...overrides,
  };
}

describe('GlobalSearchModal (desktop parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the catalogue on open and renders the per-store breakdown table', async () => {
    mockSearchProducts.mockResolvedValue({
      results: [
        result({
          id: 'p1',
          name: 'Apple iPhone 15 Pro',
          brand: 'Apple',
          model: 'A3102',
          category: 'Smartphones',
          total_quantity: 8,
          store_quantities: [
            { store_id: 's1', store_name: 'Main Store', quantity: 5 },
            { store_id: 's2', store_name: 'Depot', quantity: 3 },
          ],
        }),
      ],
      total: 1,
      query: '',
    });

    render(<GlobalSearchModal isOpen={true} onClose={() => {}} stores={STORES} />);

    await waitFor(() => {
      expect(mockSearchProducts).toHaveBeenCalledWith('', 200, 'all-stores');
    });
    await waitFor(() => {
      expect(screen.getByTestId('global-search-results-table')).toBeInTheDocument();
    });

    expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument();
    expect(screen.getByTestId('qty-p1-s1')).toHaveTextContent('5');
    expect(screen.getByTestId('qty-p1-s2')).toHaveTextContent('3');
  });

  it('filters across all stores by name/sku/brand/model/category', async () => {
    mockSearchProducts.mockResolvedValue({
      results: [
        result({ id: 'p1', name: 'Apple iPhone', brand: 'Apple' }),
        result({ id: 'p2', name: 'Sony Headphones', sku: 'SONY-XM5' }),
      ],
      total: 2,
      query: '',
    });

    render(<GlobalSearchModal isOpen={true} onClose={() => {}} stores={STORES} />);

    await waitFor(() => {
      expect(screen.getByTestId('global-search-results-table')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'sony' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Apple iPhone')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Sony Headphones')).toBeInTheDocument();
  });

  it('prefills the query submitted from the header search bar', async () => {
    mockSearchProducts.mockResolvedValue({ results: [], total: 0, query: '' });

    render(
      <GlobalSearchModal isOpen={true} onClose={() => {}} stores={STORES} initialQuery="iphone" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('global-search-input')).toHaveValue('iphone');
    });
  });

  it('does not fetch while closed', () => {
    render(<GlobalSearchModal isOpen={false} onClose={() => {}} stores={STORES} />);
    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(screen.queryByTestId('global-search-modal')).not.toBeInTheDocument();
  });
});
