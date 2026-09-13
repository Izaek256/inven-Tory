import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '@invenTory/ui';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { Header } from '../components/Header';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import { Product } from '../types/product';
import { Store } from '../types/store';

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const stores: Store[] = [
  { id: 'STORE-MAIN', name: 'Main Store', store_code: 'MAIN' },
  { id: 'STORE-BRANCH', name: 'Branch Store', store_code: 'BRANCH' },
  { id: 'STORE-DEPOT', name: 'Depot', store_code: 'DEPOT' },
] as unknown as Store[];

const products: Product[] = [
  {
    id: 'PROD-01',
    sku: 'ELEC-IPHONE15PRO',
    name: 'Apple iPhone 15 Pro',
    brand: 'Apple',
    model: 'A3102',
    category: 'Smartphones',
    unit: 'pcs',
    serial_tracking_enabled: true,
    is_active: true,
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  },
  {
    id: 'PROD-02',
    sku: 'FURN-DESK-01',
    name: 'Office Desk',
    brand: 'Ikea',
    model: 'BEKANT',
    category: 'Furniture',
    unit: 'pcs',
    serial_tracking_enabled: false,
    is_active: true,
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  },
];

// Per-store quantities: PROD-01 in Main=5, Branch=2, Depot=0 (total 7);
// PROD-02 only in Depot=4 (single-store product — other columns show 0).
const qtyMatrix: Record<string, number> = {
  'STORE-MAIN::PROD-01': 5,
  'STORE-BRANCH::PROD-01': 2,
  'STORE-DEPOT::PROD-01': 0,
  'STORE-MAIN::PROD-02': 0,
  'STORE-BRANCH::PROD-02': 0,
  'STORE-DEPOT::PROD-02': 4,
};

describe('Global cross-store product search (Phase 3, Task G)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue(products);
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockImplementation(
      async (storeId: string, productId: string) => ({
        id: `SB-${storeId}-${productId}`,
        store_id: storeId,
        product_id: productId,
        stock_bucket: 'AVAILABLE',
        quantity: qtyMatrix[`${storeId}::${productId}`] ?? 0,
        updated_at: new Date().toISOString(),
      }),
    );
  });

  it('renders the cross-store breakdown table with one dynamic column per store', async () => {
    renderWithProviders(<GlobalSearchModal isOpen onClose={vi.fn()} stores={stores} />);

    const table = await screen.findByTestId('global-search-results-table');

    // Store columns now render as colored chip clusters (one chip per store with
    // quantity on hover via title) — store names also appear in the legend badges
    // above the table.
    const scoped = within(table);
    expect(scoped.getByText('Main Store')).toBeInTheDocument();
    expect(scoped.getByText('Branch Store')).toBeInTheDocument();
    expect(scoped.getByText('Depot')).toBeInTheDocument();
    expect(scoped.getByText('Total')).toBeInTheDocument();
  });

  it('shows per-store quantities and correct totals, with 0 for absent stores', async () => {
    renderWithProviders(<GlobalSearchModal isOpen onClose={vi.fn()} stores={stores} />);

    await screen.findByTestId('global-search-results-table');

    // Each store column renders a chip with the quantity as text and the full
    // "store: qty unit" string in the title attribute.
    await waitFor(() => {
      expect(screen.getByTestId('qty-PROD-01-STORE-MAIN')).toHaveTextContent('5');
    });
    expect(screen.getByTestId('qty-PROD-01-STORE-BRANCH')).toHaveTextContent('2');
    expect(screen.getByTestId('qty-PROD-01-STORE-DEPOT')).toHaveTextContent('0');

    // PROD-02 exists only in Depot
    expect(screen.getByTestId('qty-PROD-02-STORE-DEPOT')).toHaveTextContent('4');
    expect(screen.getByTestId('qty-PROD-02-STORE-MAIN')).toHaveTextContent('0');
  });

  it('filters by name/SKU/brand/model/category across all stores', async () => {
    renderWithProviders(<GlobalSearchModal isOpen onClose={vi.fn()} stores={stores} />);

    await waitFor(() => {
      expect(screen.getByTestId('global-search-results-table')).toBeInTheDocument();
    });

    // Filter by category term
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'Smartphones' },
    });

    await waitFor(() => {
      expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument();
    });
    expect(screen.queryByText('Office Desk')).not.toBeInTheDocument();
  });

  it('does not change the active store when opened and closed (read-only lookup)', async () => {
    const onSelectStore = vi.fn();
    renderWithProviders(
      <Header stores={stores} activeStoreId="STORE-MAIN" onSelectStore={onSelectStore} />,
    );

    // Open the modal from the header entry point
    fireEvent.click(screen.getByTestId('global-search-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('global-search-modal')).toBeInTheDocument();
    });

    // Close it
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByTestId('global-search-modal')).not.toBeInTheDocument();
    });

    // The active store was never touched
    expect(onSelectStore).not.toHaveBeenCalled();
    expect(screen.getByTestId('store-selector')).toHaveValue('STORE-MAIN');
  });
});
