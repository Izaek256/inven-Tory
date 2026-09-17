/**
 * Store tabs — per-store scoped analytics (reiterated requirement).
 *
 * Clicking a store tab must refetch every analytics query scoped to that
 * store (?store_id=), not just visually toggle. Clicking again clears the
 * scope back to the global aggregate.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AnalyticsDashboardView } from '../views/AnalyticsDashboardView';
import * as dashboardService from '../services/dashboardService';
import type { DashboardMetrics, RecentActivityResponse } from '../types/dashboard';

vi.mock('../services/dashboardService');

const baseMetrics: DashboardMetrics = {
  total_products: 10,
  total_stock_units: 500,
  last_sync_at: new Date(Date.now() - 3600_000).toISOString(),
  most_sold: [],
  low_stock: [],
  cross_store: { products_in_multiple_stores: 2, stores_with_stock: 2, combined_quantity: 500 },
  receipt_linked_sales: [],
};

function mockAll(): void {
  vi.mocked(dashboardService.getDashboardMetrics).mockResolvedValue(baseMetrics);
  vi.mocked(dashboardService.getRecentActivity).mockResolvedValue({
    data: [],
    total: 0,
  } satisfies RecentActivityResponse);
  vi.mocked(dashboardService.getStockTrend).mockResolvedValue({
    data: [],
    date_range: { start: '', end: '' },
  });
  vi.mocked(dashboardService.getCategoryDistribution).mockResolvedValue({
    data: [],
    total_products: 0,
  });
  vi.mocked(dashboardService.getMostSoldExtended).mockResolvedValue({
    data: [],
    period: { start: '', end: '' },
  });
  vi.mocked(dashboardService.getKPIDeltas).mockResolvedValue({
    deltas: [],
    current_period: { start: '', end: '' },
    prior_period: { start: '', end: '' },
  });
  vi.mocked(dashboardService.getOperationsSummary).mockResolvedValue({
    total_transactions: 0,
    total_units_moved: 0,
    by_type: [],
    returns_count: 0,
    returns_units: 0,
    damage_count: 0,
    damage_units: 0,
  });
  vi.mocked(dashboardService.listStores).mockResolvedValue([
    { id: 's1', code: 'S1', name: 'Main Store', is_active: true },
    { id: 's2', code: 'S2', name: 'Depot', is_active: true },
  ]);
}

describe('Store tabs scope analytics per store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll();
  });

  it('refetches all analytics queries with the store id on tab click', async () => {
    render(<AnalyticsDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('store-tabs')).toBeInTheDocument();
    });

    // Initial load is global (no store scope).
    await waitFor(() => {
      expect(dashboardService.getDashboardMetrics).toHaveBeenCalledWith(null);
    });

    fireEvent.click(screen.getByTestId('store-tab-s1'));

    await waitFor(() => {
      expect(dashboardService.getDashboardMetrics).toHaveBeenCalledWith('s1');
    });
    expect(dashboardService.getCategoryDistribution).toHaveBeenCalledWith('s1');
    expect(dashboardService.getRecentActivity).toHaveBeenCalledWith(10, 's1');
    expect(dashboardService.getMostSoldExtended).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      5,
      's1',
    );
    expect(dashboardService.getStockTrend).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      's1',
    );
    expect(dashboardService.getKPIDeltas).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      's1',
    );
    expect(dashboardService.getOperationsSummary).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      's1',
    );

    // Subtitle reflects the scoped store.
    expect(screen.getByText("Here's what's happening at Main Store.")).toBeInTheDocument();
  });

  it('clicking the active tab again clears the scope', async () => {
    render(<AnalyticsDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('store-tabs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('store-tab-s2'));
    await waitFor(() => {
      expect(dashboardService.getDashboardMetrics).toHaveBeenCalledWith('s2');
    });

    fireEvent.click(screen.getByTestId('store-tab-s2'));
    await waitFor(() => {
      expect(dashboardService.getDashboardMetrics).toHaveBeenLastCalledWith(null);
    });
  });
});
