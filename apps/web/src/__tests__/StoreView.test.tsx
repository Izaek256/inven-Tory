/**
 * StoreView component tests.
 * Verifies freshness badge rendering and store drill-down.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreView } from '../views/StoreView';
import type { StoreInventoryResponse } from '../types/dashboard';

vi.mock('../services/dashboardService', () => ({
  getStoreInventory: vi.fn(),
}));

import * as svc from '../services/dashboardService';

const FRESH_STORE: StoreInventoryResponse = {
  store_id: 'store-a',
  store_code: 'A01',
  store_name: 'Store Alpha',
  is_active: true,
  last_sync_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  freshness: 'FRESH',
  products: [
    {
      product_id: 'prod-1',
      product_sku: 'SKU-001',
      product_name: 'Widget One',
      category: 'Electronics',
      unit: 'pcs',
      stock_bucket: 'AVAILABLE',
      quantity: 100,
      balance_updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ],
  total_products: 1,
  total_quantity: 100,
};

const STALE_STORE: StoreInventoryResponse = {
  store_id: 'store-b',
  store_code: 'B01',
  store_name: 'Store Beta',
  is_active: true,
  last_sync_at: new Date(Date.now() - 48 * 3_600_000).toISOString(),
  freshness: 'VERY_STALE',
  products: [],
  total_products: 0,
  total_quantity: 0,
};

function renderStoreView(storeIds: string[] = ['store-a', 'store-b']): ReturnType<typeof render> {
  return render(<StoreView storeIds={storeIds} loading={false} onRefresh={vi.fn()} />);
}

describe('StoreView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(svc.getStoreInventory).mockImplementation(async (id: string) => {
      if (id === 'store-a') return FRESH_STORE;
      if (id === 'store-b') return STALE_STORE;
      throw new Error('Unknown store');
    });
  });

  it('renders store view with heading', () => {
    renderStoreView();
    expect(screen.getByTestId('store-view')).toBeInTheDocument();
    expect(screen.getByText(/Store Inventory/i)).toBeInTheDocument();
  });

  it('shows stores table after loading', async () => {
    renderStoreView();
    await waitFor(() => {
      expect(screen.getByTestId('stores-table')).toBeInTheDocument();
    });
  });

  it('shows FRESH badge for recently-synced store', async () => {
    renderStoreView(['store-a']);
    await waitFor(() => {
      expect(screen.getByTestId('freshness-store-a')).toBeInTheDocument();
    });
    expect(screen.getByTestId('freshness-store-a')).toHaveTextContent(/fresh/i);
  });

  it('shows VERY_STALE badge for disconnected store (AT-007)', async () => {
    renderStoreView(['store-b']);
    await waitFor(() => {
      expect(screen.getByTestId('freshness-store-b')).toBeInTheDocument();
    });
    expect(screen.getByTestId('freshness-store-b')).toHaveTextContent(/stale/i);
  });

  it('shows empty state when no store IDs provided', () => {
    renderStoreView([]);
    expect(screen.getByText(/No stores found/i)).toBeInTheDocument();
  });

  it('navigates to store panel on View click', async () => {
    renderStoreView(['store-a']);

    await waitFor(() => screen.getByTestId('view-store-store-a'));
    await userEvent.click(screen.getByTestId('view-store-store-a'));

    await waitFor(() => {
      expect(screen.getByTestId('store-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Store Alpha')).toBeInTheDocument();
  });

  it('shows store products in drill-down panel', async () => {
    renderStoreView(['store-a']);

    await waitFor(() => screen.getByTestId('view-store-store-a'));
    await userEvent.click(screen.getByTestId('view-store-store-a'));

    await waitFor(() => screen.getByTestId('store-products-table'));
    expect(screen.getByText('Widget One')).toBeInTheDocument();
  });

  it('back button returns to store list from drill-down', async () => {
    renderStoreView(['store-a']);

    await waitFor(() => screen.getByTestId('view-store-store-a'));
    await userEvent.click(screen.getByTestId('view-store-store-a'));
    await waitFor(() => screen.getByTestId('back-to-stores-btn'));

    await userEvent.click(screen.getByTestId('back-to-stores-btn'));
    expect(screen.getByTestId('store-view')).toBeInTheDocument();
  });

  it('shows last sync time for store (FR-SRCH-005)', async () => {
    renderStoreView(['store-a']);

    await waitFor(() => screen.getByTestId('view-store-store-a'));
    await userEvent.click(screen.getByTestId('view-store-store-a'));

    await waitFor(() => {
      expect(screen.getByTestId('store-last-sync')).toBeInTheDocument();
    });
    expect(screen.getByTestId('store-last-sync')).toHaveTextContent(/last sync/i);
  });
});
