import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AnalyticsDashboardView } from '../views/AnalyticsDashboardView';
import { RecentActivityView } from '../views/RecentActivityView';
import { RecentActivityList } from '../components/RecentActivityList';
import * as dashboardService from '../services/dashboardService';
import type {
  DashboardMetrics,
  RecentActivityItem,
  RecentActivityResponse,
} from '../types/dashboard';

vi.mock('../services/dashboardService');
const mockGetDashboardMetrics = vi.mocked(dashboardService.getDashboardMetrics);
const mockGetRecentActivity = vi.mocked(dashboardService.getRecentActivity);

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
    type: 'transfer_completed',
    product_id: 'prod-276',
    product_name: 'ADH 276L(Dispenser) Fridge',
    sku: 'ADH-276L',
    store_id: 'store-2',
    store_name: 'WEST-DEPOT',
    quantity: 2,
    occurred_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    reference_number: null,
  },
];

function mockDashboard(recentActivity: RecentActivityResponse): void {
  mockGetDashboardMetrics.mockResolvedValue(baseMetrics);
  mockGetRecentActivity.mockResolvedValue(recentActivity);
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

describe('Recent Activity - shared row component (dashboard preview + dedicated page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dashboard preview and dedicated page render the identical detail line', async () => {
    mockDashboard({ data: sampleActivity, total: 2 });
    vi.mocked(dashboardService.searchProducts).mockResolvedValue({
      query: '',
      total: 0,
      results: [],
    });
    const { unmount } = render(<AnalyticsDashboardView />);
    const preview = await screen.findByTestId('recent-activity-preview');
    const previewMeta = preview.querySelectorAll('.web-dashboard-preview-meta');
    expect(previewMeta[0]?.textContent).toContain('stock sold · ALGA-MAIN-STORE · −1 units');
    // transfer_completed must be fully humanized (both underscores -> spaces)
    expect(previewMeta[1]?.textContent).toContain('transfer completed · WEST-DEPOT · +2 units');
    unmount();

    render(<RecentActivityView />);
    const feed = await screen.findByTestId('recent-activity-feed');
    const feedMeta = feed.querySelectorAll('.web-dashboard-preview-meta');
    expect(feedMeta[0]?.textContent).toContain('stock sold · ALGA-MAIN-STORE · −1 units');
    expect(feedMeta[1]?.textContent).toContain('transfer completed · WEST-DEPOT · +2 units');
  });

  it('RecentActivityList renders the same markup standalone', () => {
    render(<RecentActivityList items={sampleActivity} />);
    expect(screen.getByText('ADH 158L Fridge')).toBeInTheDocument();
    expect(screen.getByText('stock sold · ALGA-MAIN-STORE · −1 units')).toBeInTheDocument();
  });

  // Task A regression: this is the kind of bug a snapshot test catches — the
  // name/detail lines were once two inline spans that rendered as one glued
  // string. If the row markup ever loses its block structure, this snapshot
  // diff will flag it. Both the occurred_at AND Date.now() are fixed so the
  // snapshot (including the relative-time text) is deterministic across runs.
  it('row structure snapshot (name line and meta line are separate nodes)', () => {
    const fixedNow = new Date('2026-09-12T20:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const fixedItem: RecentActivityItem = {
      ...sampleActivity[0],
      occurred_at: '2026-09-12T08:00:00.000Z',
    };
    const { asFragment } = render(<RecentActivityList items={[fixedItem]} />);
    expect(asFragment()).toMatchSnapshot();
    vi.restoreAllMocks();
  });
});
