/**
 * Dashboard polish pass regression tests (v1.1 — Tasks A, B, C).
 *
 * Task A: Recent Activity rows must render the product name and the detail
 *         line as visually separate block elements, never a concatenated
 *         string ("...Fridgestock sold").
 * Task B: No KPI tile value may carry the stray mono/letter-spacing styling.
 * Task C: The tile grid must be a complete 2x5 grid of pure KPI tiles
 *         (list-style Most-Sold / Low-Stock tiles removed), and new tiles
 *         must render correctly on zero/empty data.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AnalyticsDashboardView } from '../views/AnalyticsDashboardView';
import { RecentActivityList } from '../components/RecentActivityList';
import * as dashboardService from '../services/dashboardService';
import type {
  DashboardMetrics,
  RecentActivityItem,
  RecentActivityResponse,
  OperationsSummaryResponse,
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
  cross_store: { products_in_multiple_stores: 2, stores_with_stock: 2, combined_quantity: 500 },
  receipt_linked_sales: [],
};

const EMPTY_OPS: OperationsSummaryResponse = {
  total_transactions: 0,
  total_units_moved: 0,
  by_type: [],
  returns_count: 0,
  returns_units: 0,
  damage_count: 0,
  damage_units: 0,
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
];

function mockAll(overrides?: {
  ops?: Partial<OperationsSummaryResponse>;
  activity?: RecentActivityItem[];
}): void {
  mockGetDashboardMetrics.mockResolvedValue(baseMetrics);
  mockGetRecentActivity.mockResolvedValue({
    data: overrides?.activity ?? sampleActivity,
    total: overrides?.activity?.length ?? 1,
  } satisfies RecentActivityResponse);
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
    ...EMPTY_OPS,
    ...overrides?.ops,
  });
  vi.mocked(dashboardService.listStores).mockResolvedValue([
    { id: 's1', code: 'S1', name: 'Main Store', is_active: true },
    { id: 's2', code: 'S2', name: 'Depot', is_active: true },
  ]);
}

// ---------------------------------------------------------------------------
// Task A — Recent Activity name/detail separation
// ---------------------------------------------------------------------------

describe('Task A - Recent Activity name/detail separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll();
  });

  it('renders the product name and detail line as distinct block-level nodes', () => {
    render(<RecentActivityList items={sampleActivity} />);

    const name = screen.getByText('ADH 158L Fridge');
    const meta = screen.getByText('stock sold · ALGA-MAIN-STORE · −1 units');

    // Distinct elements sharing one flex-column wrapper — never one string.
    expect(name).not.toBe(meta);
    expect(name.classList.contains('web-dashboard-preview-label')).toBe(true);
    expect(meta.classList.contains('web-dashboard-preview-meta')).toBe(true);
    expect(meta.textContent).not.toContain('ADH 158L Fridge');

    const wrapper = name.parentElement;
    expect(wrapper).toBe(meta.parentElement);
    expect(wrapper?.classList.contains('web-dashboard-preview-content')).toBe(true);
  });

  it('renders the same separated structure on the full dashboard view', async () => {
    render(<AnalyticsDashboardView />);
    const preview = await screen.findByTestId('recent-activity-preview');
    await waitFor(() => {
      expect(preview.querySelector('.web-dashboard-preview-label')?.textContent).toBe(
        'ADH 158L Fridge',
      );
    });
    const name = preview.querySelector('.web-dashboard-preview-label');
    const meta = preview.querySelector('.web-dashboard-preview-meta');
    expect(meta?.textContent).not.toContain(name?.textContent ?? '\u0000');
  });
});

// ---------------------------------------------------------------------------
// Task B — KPI value typography
// ---------------------------------------------------------------------------

describe('Task B - no stray letter-spacing/mono on KPI values', () => {
  // Read the shipped stylesheet at test time — this guard exists to catch the
  // exact regression where mono/tracking styles leak back into the KPI value.
  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8');

  function ruleBody(selector: string): string {
    const idx = css.indexOf(selector);
    expect(idx, `selector ${selector} should exist in index.css`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf('{', idx);
    const close = css.indexOf('}', open);
    return css.slice(open + 1, close);
  }

  it('tile value uses tabular UI numerals with no mono family or letter-spacing', () => {
    const body = ruleBody('.web-dashboard-tile__value');
    expect(body).not.toMatch(/font-family/);
    expect(body).not.toMatch(/letter-spacing/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('tile footer and delta carry no mono family either (they show "3 h ago"-style text)', () => {
    const footer = ruleBody('.web-dashboard-tile__footer');
    const delta = ruleBody('.web-dashboard-tile__delta');
    expect(footer).not.toMatch(/font-family/);
    expect(delta).not.toMatch(/font-family/);
  });

  it('exposes a shared type scale that new tiles must reference', () => {
    for (const cls of [
      '.web-type-kpi-label',
      '.web-type-kpi-value',
      '.web-type-delta',
      '.web-type-card-title',
      '.web-type-body',
    ]) {
      expect(css.includes(cls), `type-scale class ${cls} missing`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Task C — KPI grid completeness
// ---------------------------------------------------------------------------

describe('Task C - tile grid is a complete 2x5 grid of pure KPIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll();
  });

  it('renders exactly 10 KPI tiles and no list-style duplicates', async () => {
    render(<AnalyticsDashboardView />);
    const grid = await screen.findByTestId('analytics-tiles');
    await waitFor(() => {
      expect(grid.querySelectorAll('.web-dashboard-tile').length).toBe(10);
    });
    const titles = Array.from(grid.querySelectorAll('.web-dashboard-tile__title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual([
      'Total Products',
      'Total Stock Units',
      'Last Sync',
      'Cross-Store Products',
      'Receipt-Linked Sales',
      'Total Stores',
      'Units Sold',
      'Transactions',
      'Returns',
      'Damage & Quarantine',
    ]);
    // The redundant list tiles must be gone (detailed table cards remain below).
    expect(titles).not.toContain('Most-Sold Products');
    expect(titles).not.toContain('Low-Stock Alerts');
  });

  it('new tiles render correct values with real data', async () => {
    vi.mocked(dashboardService.getOperationsSummary).mockResolvedValue({
      total_transactions: 12,
      total_units_moved: 40,
      by_type: [
        { movement_type: 'SALE', count: 6, units: 20 },
        { movement_type: 'RECEIPT', count: 4, units: 15 },
        { movement_type: 'DAMAGE', count: 2, units: 5 },
      ],
      returns_count: 1,
      returns_units: 2,
      damage_count: 2,
      damage_units: 5,
    });
    vi.mocked(dashboardService.listStores).mockResolvedValue([
      { id: 's1', code: 'S1', name: 'Main Store', is_active: true },
      { id: 's2', code: 'S2', name: 'Depot', is_active: false },
    ]);

    render(<AnalyticsDashboardView />);
    const grid = await screen.findByTestId('analytics-tiles');

    const value = (tileId: string): string =>
      grid.querySelector(`[data-testid="${tileId}-value"]`)?.textContent ?? '';

    await waitFor(
      () => {
        // Mock has 2 stores, 1 inactive → 1 active store shown.
        expect(value('tile-total-stores')).toBe('1');
        expect(value('tile-transactions')).toBe('12');
        expect(value('tile-returns')).toBe('1');
        expect(value('tile-damage')).toBe('5');
      },
      // Count-up animations run on rAF; give them room to settle in jsdom.
      { timeout: 3000 },
    );
    expect(
      grid.querySelector('[data-testid="tile-total-stores"] .web-dashboard-tile__footer')
        ?.textContent,
    ).toContain('1 inactive');
    expect(
      grid.querySelector('[data-testid="tile-damage"] .web-dashboard-tile__footer')?.textContent,
    ).toContain('2 damage operations');
  });

  it('new tiles render zero/empty data without breaking', async () => {
    render(<AnalyticsDashboardView />);
    const grid = await screen.findByTestId('analytics-tiles');
    await waitFor(
      () => {
        expect(grid.querySelector('[data-testid="tile-transactions-value"]')?.textContent).toBe(
          '0',
        );
        expect(grid.querySelector('[data-testid="tile-returns-value"]')?.textContent).toBe('0');
        expect(grid.querySelector('[data-testid="tile-damage-value"]')?.textContent).toBe('0');
      },
      { timeout: 3000 },
    );
    expect(
      grid.querySelector('[data-testid="tile-transactions"] .web-dashboard-tile__footer')
        ?.textContent,
    ).toContain('No movements in range');
  });
});
