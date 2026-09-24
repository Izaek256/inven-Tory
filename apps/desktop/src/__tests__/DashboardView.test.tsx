import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import { StoreProvider } from '../context/StoreContext';
import { DashboardView } from '../views/DashboardView';
import * as tauriDashboardService from '../services/tauriDashboardService';
import * as tauriSyncService from '../services/tauriSyncService';
import { ClientSyncState } from '../types/sync';
import { DashboardAnalytics } from '../types/dashboard';

// Mock Recharts to avoid width/height warnings in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactElement }): React.ReactElement =>
    React.cloneElement(children, { width: 400, height: 300 } as Record<string, unknown>),
  LineChart: ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: (): React.ReactElement => <line />,
  XAxis: (): React.ReactElement => <g />,
  YAxis: (): React.ReactElement => <g />,
  CartesianGrid: (): React.ReactElement => <g />,
  Tooltip: (): React.ReactElement => <g />,
  Legend: (): React.ReactElement => <g />,
  PieChart: ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: (): React.ReactElement => <g />,
  Cell: (): React.ReactElement => <g />,
  BarChart: ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: (): React.ReactElement => <rect />,
  ReferenceLine: (): React.ReactElement => <line />,
}));

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

const now = Date.now();

const mockAnalytics: DashboardAnalytics = {
  kpis: {
    total_products_current: 3,
    total_products_prior: 1,
    total_stock_units: 153,
    stock_delta_current: 143,
    stock_delta_prior: -5,
    products_in_multiple_stores: 2,
    receipt_linked_sales_current: 4,
    receipt_linked_sales_prior: 1,
  },
  stock_trend: [
    { date: '2026-09-17', total_stock_units: 153 },
    { date: '2026-09-18', total_stock_units: 153 },
    { date: '2026-09-19', total_stock_units: 153 },
    { date: '2026-09-20', total_stock_units: 153 },
    { date: '2026-09-21', total_stock_units: 153 },
    { date: '2026-09-22', total_stock_units: 153 },
    { date: '2026-09-23', total_stock_units: 153 },
  ],
  category_distribution: [
    { category: 'Electronics', count: 2, percentage: 50 },
    { category: 'Accessories', count: 2, percentage: 50 },
  ],
  stock_status_by_category: [
    { category: 'Electronics', in_stock: 1, low_stock: 1, out_of_stock: 0, total: 2 },
    { category: 'Accessories', in_stock: 1, low_stock: 0, out_of_stock: 1, total: 2 },
  ],
  most_sold_products: [
    {
      product_id: 'PROD-1',
      product_name: 'Widget Alpha',
      category: 'Electronics',
      units_sold: 5,
      trend_direction: 'up',
      trend_percentage: 25,
    },
  ],
  low_stock_alerts: [
    {
      product_id: 'PROD-2',
      product_name: 'Gadget Beta',
      current_stock: 3,
      threshold: 5,
      category: 'Electronics',
    },
  ],
  recent_activity: [
    {
      id: 'TXN-4',
      type: 'stock_added',
      product_id: 'PROD-3',
      product_name: 'Cable Gamma',
      sku: 'CABLE-C',
      store_id: 'STORE-2',
      store_name: 'Store Beta',
      quantity: 100,
      occurred_at: new Date(now - 1 * 86_400_000).toISOString(),
      reference_number: 'PO-002',
    },
    {
      id: 'TXN-2',
      type: 'stock_sold',
      product_id: 'PROD-1',
      product_name: 'Widget Alpha',
      sku: 'WIDGET-A',
      store_id: 'STORE-1',
      store_name: 'Store Alpha',
      quantity: -5,
      occurred_at: new Date(now - 3 * 86_400_000).toISOString(),
      reference_number: 'SL-001',
    },
    {
      id: 'TXN-3',
      type: 'stock_sold',
      product_id: 'PROD-2',
      product_name: 'Gadget Beta',
      sku: 'GADGET-B',
      store_id: 'STORE-1',
      store_name: 'Store Alpha',
      quantity: -2,
      occurred_at: new Date(now - 2 * 86_400_000).toISOString(),
      reference_number: null,
    },
  ],
};

const mockStores = [
  {
    id: 'STORE-1',
    code: 'ALPHA',
    name: 'Store Alpha',
    address: '100 Main St',
    is_active: true,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 'STORE-2',
    code: 'BETA',
    name: 'Store Beta',
    address: '200 Side Ave',
    is_active: true,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  if (typeof window !== 'undefined') {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = vi
      .fn()
      .mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }));
  }
  vi.spyOn(tauriDashboardService, 'getDashboardAnalytics').mockResolvedValue(mockAnalytics);
  vi.spyOn(tauriSyncService, 'getLastSyncTimestamp').mockResolvedValue('2026-09-12T08:00:00Z');
  vi.spyOn(tauriSyncService, 'triggerSync').mockResolvedValue({
    lastSyncAt: '2026-09-12T08:00:00Z',
    pendingCount: 0,
    isOnline: true,
    lastOutcome: 'success',
    lastError: null,
  } as ClientSyncState);
});

describe('DashboardView — Analytics Dashboard', () => {
  it('renders analytics dashboard with KPIs from the aggregated payload', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-products')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-total-stock')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-last-sync')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-cross-store')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-receipt-sales')).toBeInTheDocument();
    });
  });

  it('displays correct KPI values from the analytics payload', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-products')).toHaveTextContent('3');
      expect(screen.getByTestId('kpi-total-stock')).toHaveTextContent('153');
      expect(screen.getByTestId('kpi-cross-store')).toHaveTextContent('2');
      expect(screen.getByTestId('kpi-receipt-sales')).toHaveTextContent('4');
    });
  });

  it('renders stock trend chart', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-trend-chart')).toBeInTheDocument();
    });
  });

  it('renders category donut chart', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('category-donut-chart')).toBeInTheDocument();
    });
  });

  it('renders stock status stacked bar chart', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-status-chart')).toBeInTheDocument();
    });
  });

  it('renders most-sold products table', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('most-sold-table')).toBeInTheDocument();
    });
  });

  it('renders low-stock alerts table', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('low-stock-table')).toBeInTheDocument();
    });
  });

  it('renders recent activity preview', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument();
    });
  });

  it('shows date range filter in top-right of dashboard', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('date-range-start')).toBeInTheDocument();
      expect(screen.getByTestId('date-range-end')).toBeInTheDocument();
    });
  });

  it('refetches analytics when the date range changes', async () => {
    const fetchSpy = vi.spyOn(tauriDashboardService, 'getDashboardAnalytics');
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const firstCall = fetchSpy.mock.calls[0];

    await act(async () => {
      fireEvent.change(screen.getByTestId('date-range-start'), {
        target: { value: '2026-09-01' },
      });
    });

    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    });
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    expect(lastCall![1]).toBe('2026-09-01');
    // End date carried over from the default range.
    expect(lastCall![2]).toBe(firstCall![2]);
  });

  it('has a Sync Now button wired to triggerSync', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sync-now-btn')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-now-btn'));
    });

    expect(tauriSyncService.triggerSync).toHaveBeenCalled();
  });

  it('renders dashboard even when analytics fetch fails', async () => {
    vi.spyOn(tauriDashboardService, 'getDashboardAnalytics').mockRejectedValue(
      new Error('DB locked'),
    );

    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
  });

  it('shows error state when analytics fetch fails', async () => {
    vi.spyOn(tauriDashboardService, 'getDashboardAnalytics').mockRejectedValue(
      new Error('Failed to read local database'),
    );

    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(
      () => {
        const errEl = screen.queryByTestId('sync-error');
        const actionErr = screen.queryByTestId('dashboard-action-error');
        expect(errEl || actionErr).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('displays product names in Recent Activity, not raw IDs (regression test)', async () => {
    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      const activityList = screen.getByTestId('recent-activity-list');
      expect(activityList).toBeInTheDocument();
    });

    expect(screen.getAllByText('Widget Alpha')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Gadget Beta')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Cable Gamma')[0]).toBeInTheDocument();
    expect(screen.queryByText('PROD-1')).not.toBeInTheDocument();
    expect(screen.queryByText('PROD-2')).not.toBeInTheDocument();
  });

  it('handles deleted products with fallback in Recent Activity', async () => {
    const withDeletedProduct: DashboardAnalytics = {
      ...mockAnalytics,
      recent_activity: [
        {
          id: 'TXN-DELETED',
          type: 'stock_sold',
          product_id: 'PROD-DELETED',
          product_name: '',
          sku: '',
          store_id: 'STORE-1',
          store_name: 'Store Alpha',
          quantity: -1,
          occurred_at: new Date(now - 3600_000).toISOString(),
          reference_number: null,
        },
      ],
    };

    vi.spyOn(tauriDashboardService, 'getDashboardAnalytics').mockResolvedValueOnce(
      withDeletedProduct,
    );

    renderWithProviders(
      <DashboardView
        stores={mockStores}
        loading={false}
        error={null}
        onRetry={() => {}}
        userRole="ADMIN"
      />,
    );

    await waitFor(() => {
      const activityList = screen.getByTestId('recent-activity-list');
      expect(activityList).toBeInTheDocument();
    });

    expect(screen.getByText(/Unknown Product.*PROD-DELETED/)).toBeInTheDocument();
  });
});

describe('DashboardView — active-store scoping', () => {
  function renderScoped(activeStoreId: string | null): void {
    render(
      <ThemeProvider>
        <ToastProvider>
          <StoreProvider activeStoreId={activeStoreId} setActiveStoreId={() => {}}>
            <DashboardView
              stores={mockStores}
              loading={false}
              error={null}
              onRetry={() => {}}
              userRole="ADMIN"
            />
          </StoreProvider>
        </ToastProvider>
      </ThemeProvider>,
    );
  }

  it('requests analytics scoped to the active store only', async () => {
    const fetchSpy = vi.spyOn(tauriDashboardService, 'getDashboardAnalytics');
    renderScoped('STORE-1');

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    // Every analytics request is scoped to the active store, never STORE-2.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.every((call) => call[0] === 'STORE-1')).toBe(true);
  });

  it('scopes tile and subtitle to the active store', async () => {
    renderScoped('STORE-1');

    // Scoped subtitle names the store.
    await waitFor(() => {
      expect(screen.getByText('Live overview of Store Alpha')).toBeInTheDocument();
    });
    // Cross-store tile is replaced by Low Stock in scoped view.
    await waitFor(() => {
      expect(screen.getByTestId('kpi-low-stock')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kpi-cross-store')).not.toBeInTheDocument();
    // Fixed payload values still render from the aggregated result.
    expect(screen.getByTestId('kpi-total-products')).toHaveTextContent('3');
    expect(screen.getByTestId('kpi-total-stock')).toHaveTextContent('153');
    // Recent activity reflects the store-scoped payload (no STORE-2 rows needed).
    await waitFor(() => {
      expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument();
    });
    expect(screen.queryByText('PROD-DELETED')).not.toBeInTheDocument();
  });

  it('aggregates globally without an active store', async () => {
    renderScoped(null);

    await waitFor(() => {
      expect(screen.getByText('Live overview of your stock, sales and stores')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kpi-cross-store')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-low-stock')).not.toBeInTheDocument();
  });
});
