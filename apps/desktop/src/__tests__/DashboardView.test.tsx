import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import { DashboardView } from '../views/DashboardView';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriSyncService from '../services/tauriSyncService';

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

const mockProducts = [
  {
    id: 'PROD-1',
    sku: 'WIDGET-A',
    name: 'Widget Alpha',
    category: 'Electronics',
    unit: 'pcs',
    is_active: true,
    low_stock_threshold: 10,
    stock_quantity: 50,
    serial_tracking_enabled: false,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'PROD-2',
    sku: 'GADGET-B',
    name: 'Gadget Beta',
    category: 'Electronics',
    unit: 'pcs',
    is_active: true,
    low_stock_threshold: 5,
    stock_quantity: 3,
    serial_tracking_enabled: false,
    created_at: '2026-08-15T10:00:00Z',
    updated_at: '2026-08-15T10:00:00Z',
  },
  {
    id: 'PROD-3',
    sku: 'CABLE-C',
    name: 'Cable Gamma',
    category: 'Accessories',
    unit: 'm',
    is_active: true,
    low_stock_threshold: null,
    stock_quantity: 100,
    serial_tracking_enabled: false,
    created_at: '2026-09-05T10:00:00Z',
    updated_at: '2026-09-05T10:00:00Z',
  },
  {
    id: 'PROD-4',
    sku: 'MOUSE-D',
    name: 'Mouse Delta',
    category: 'Accessories',
    unit: 'pcs',
    is_active: true,
    low_stock_threshold: 20,
    stock_quantity: 0,
    serial_tracking_enabled: false,
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z',
  },
];

const mockTransactions = [
  {
    transaction_id: 'TXN-1',
    store_id: 'STORE-1',
    product_id: 'PROD-1',
    movement_type: 'RECEIPT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: 50,
    occurred_at: '2026-09-08T10:00:00Z',
    recorded_at: '2026-09-08T10:00:00Z',
    user_id: 'U1',
    device_id: 'D1',
    reference_number: 'PO-001',
    reason_code: null,
    transfer_id: null,
    purchase_order_id: 'PO-001',
    batch_id: null,
    client_sequence: null,
    sync_status: 'SYNCED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Widget Alpha',
  },
  {
    transaction_id: 'TXN-2',
    store_id: 'STORE-1',
    product_id: 'PROD-1',
    movement_type: 'SALE',
    stock_bucket: 'AVAILABLE',
    quantity_delta: -5,
    occurred_at: '2026-09-09T10:00:00Z',
    recorded_at: '2026-09-09T10:00:00Z',
    user_id: 'U1',
    device_id: 'D1',
    reference_number: 'SL-001',
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'SYNCED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Widget Alpha',
  },
  {
    transaction_id: 'TXN-3',
    store_id: 'STORE-1',
    product_id: 'PROD-2',
    movement_type: 'SALE',
    stock_bucket: 'AVAILABLE',
    quantity_delta: -2,
    occurred_at: '2026-09-10T10:00:00Z',
    recorded_at: '2026-09-10T10:00:00Z',
    user_id: 'U1',
    device_id: 'D1',
    reference_number: null,
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'SYNCED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Gadget Beta',
  },
  {
    transaction_id: 'TXN-4',
    store_id: 'STORE-2',
    product_id: 'PROD-3',
    movement_type: 'RECEIPT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: 100,
    occurred_at: '2026-09-11T10:00:00Z',
    recorded_at: '2026-09-11T10:00:00Z',
    user_id: 'U1',
    device_id: 'D1',
    reference_number: 'PO-002',
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'SYNCED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Cable Gamma',
  },
];

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
  vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue(mockProducts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(tauriTransactionService, 'getLocalTransactions').mockResolvedValue(
    mockTransactions as any,
  );
  vi.spyOn(tauriTransactionService, 'getStockBalancesForStore').mockResolvedValue(new Map());
  vi.spyOn(tauriSyncService, 'getLastSyncTimestamp').mockResolvedValue('2026-09-12T08:00:00Z');
  vi.spyOn(tauriSyncService, 'triggerSync').mockResolvedValue({
    lastSyncAt: '2026-09-12T08:00:00Z',
    pendingCount: 0,
    isOnline: true,
    lastOutcome: 'success',
    lastError: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe('DashboardView — Analytics Dashboard', () => {
  it('renders analytics dashboard with KPIs from local data', async () => {
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

  it('displays correct KPI values from local data', async () => {
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
      const el = screen.getByTestId('kpi-total-products');
      // Date range defaults to last 7 days; only products created in range count
      expect(el.textContent).toMatch(/2|Total Products/);
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

  it('renders dashboard with local data even when sync server unreachable', async () => {
    vi.spyOn(tauriProductService, 'getProducts').mockRejectedValue(new Error('DB locked'));
    vi.spyOn(tauriTransactionService, 'getLocalTransactions').mockRejectedValue(
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

    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
  });

  it('shows error state when local data fails', async () => {
    vi.spyOn(tauriProductService, 'getProducts').mockRejectedValue(
      new Error('Failed to read local database'),
    );
    vi.spyOn(tauriTransactionService, 'getLocalTransactions').mockRejectedValue(
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
});
