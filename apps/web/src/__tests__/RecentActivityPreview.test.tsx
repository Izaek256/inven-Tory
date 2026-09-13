import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AnalyticsDashboardView } from '../views/AnalyticsDashboardView';
import * as dashboardService from '../services/dashboardService';
import type {
  DashboardMetrics,
  RecentActivityResponse,
  RecentActivityItem,
} from '../types/dashboard';

// Mock the dashboard service so the hook-backed queries resolve synchronously.
vi.mock('../services/dashboardService');
const mockGetDashboardMetrics = vi.mocked(dashboardService.getDashboardMetrics);
const mockGetRecentActivity = vi.mocked(dashboardService.getRecentActivity);

function mockAllQueries(overrides: {
  metrics?: DashboardMetrics;
  recentActivity?: RecentActivityResponse;
}): void {
  mockGetDashboardMetrics.mockResolvedValue(overrides.metrics ?? baseMetrics);
  mockGetRecentActivity.mockResolvedValue(overrides.recentActivity ?? { data: [], total: 0 });
  // Other service functions are auto-mocked but must return Promises for the hook.
  vi.mocked(dashboardService.getStockTrend).mockResolvedValue({
    data: [],
    date_range: { start: '', end: '' },
  });
  vi.mocked(dashboardService.getCategoryDistribution).mockResolvedValue({
    data: [],
    total_products: 0,
  });
  vi.mocked(dashboardService.getStockStatusByCategory).mockResolvedValue({ data: [] });
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
  vi.mocked(dashboardService.listStores).mockResolvedValue([]);
}

const baseMetrics: DashboardMetrics = {
  total_products: 10,
  total_stock_units: 500,
  last_sync_at: new Date(Date.now() - 3600_000).toISOString(),
  most_sold: [],
  low_stock: [],
  cross_store: { products_in_multiple_stores: 0, stores_with_stock: 0, combined_quantity: 0 },
  receipt_linked_sales: [],
};

const sampleActivity: RecentActivityItem[] = [
  {
    id: 'txn-1',
    type: 'stock_sold',
    product_id: 'prod-158',
    product_name: 'ADH 158L Fridge',
    sku: 'ADH-158L',
    store_id: 'store-1',
    store_name: 'ALGA-MAIN-STORE',
    quantity: 1,
    occurred_at: new Date(Date.now() - 8 * 3600_000).toISOString(),
    reference_number: null,
  },
  {
    id: 'txn-2',
    type: 'stock_added',
    product_id: 'prod-276',
    product_name: 'ADH 276L(Dispenser) Fridge',
    sku: 'ADH-276L',
    store_id: 'store-2',
    store_name: 'WEST-DEPOT',
    quantity: 5,
    occurred_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    reference_number: null,
  },
];

describe('Recent Activity preview — row detail regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders product name, action type, store name, and signed unit delta together', async () => {
    mockAllQueries({
      metrics: baseMetrics,
      recentActivity: { data: sampleActivity, total: 2 },
    });

    render(<AnalyticsDashboardView />);

    // Wait for the async query to resolve and the preview to populate.
    const preview = await screen.findByTestId('recent-activity-preview');

    expect(await screen.findByText('ADH 158L Fridge')).toBeInTheDocument();

    const rows = preview.querySelectorAll('.web-dashboard-preview-item');
    expect(rows.length).toBe(2);

    const row0Meta = rows[0].querySelector('.web-dashboard-preview-meta');
    expect(row0Meta?.textContent).toContain('stock sold');
    expect(row0Meta?.textContent).toContain('ALGA-MAIN-STORE');
    expect(row0Meta?.textContent).toContain('−1 units');

    const row1Meta = rows[1].querySelector('.web-dashboard-preview-meta');
    expect(row1Meta?.textContent).toContain('stock added');
    expect(row1Meta?.textContent).toContain('WEST-DEPOT');
    expect(row1Meta?.textContent).toContain('+5 units');
  });

  it('shows relative time (not absolute datetime) as the visible timestamp', async () => {
    mockAllQueries({
      metrics: baseMetrics,
      recentActivity: { data: sampleActivity, total: 2 },
    });

    render(<AnalyticsDashboardView />);

    const preview = await screen.findByTestId('recent-activity-preview');
    const timeElements = preview.querySelectorAll('.web-dashboard-preview-time');

    // Relative strings — NOT absolute "9/12/2026, 10:43:39 AM".
    expect(timeElements[0].textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(timeElements[1].textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(timeElements[0].textContent).toContain('ago');
    expect(timeElements[1].textContent).toContain('ago');
  });

  it('absolute timestamp is available via title/hover tooltip', async () => {
    mockAllQueries({
      metrics: baseMetrics,
      recentActivity: { data: sampleActivity, total: 2 },
    });

    render(<AnalyticsDashboardView />);

    const preview = await screen.findByTestId('recent-activity-preview');
    const timeElements = preview.querySelectorAll('.web-dashboard-preview-time');

    expect(timeElements[0].getAttribute('title')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(timeElements[1].getAttribute('title')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('does NOT show raw product IDs or bare underscored type in the meta line', async () => {
    mockAllQueries({
      metrics: baseMetrics,
      recentActivity: { data: sampleActivity, total: 2 },
    });

    render(<AnalyticsDashboardView />);

    const preview = await screen.findByTestId('recent-activity-preview');
    const metaLines = preview.querySelectorAll('.web-dashboard-preview-meta');

    for (const meta of metaLines) {
      expect(meta.textContent).not.toContain('prod-');
      // Underscores should be humanized to spaces.
      expect(meta.textContent).not.toContain('stock_sold');
      expect(meta.textContent).not.toContain('stock_added');
    }
  });
});
