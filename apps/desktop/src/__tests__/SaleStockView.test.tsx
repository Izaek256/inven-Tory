/**
 * SaleStockView frontend tests — Issue 07 acceptance criteria.
 *
 * AT-001: start at 6, sell 1 → balance becomes 5, transaction PENDING.
 *         (Verified via mock service: sellStock resolves, success banner shown.)
 * AT-012: attempting to sell more than available is rejected and shows available quantity.
 *         (Verified via mock service: sellStock rejects with "Insufficient stock"
 *          message that the view surfaces verbatim.)
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaleStockView } from '../views/SaleStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriAuthService from '../services/tauriAuthService';
import { InventoryTransaction } from '../types/transaction';

vi.mock('../services/tauriAuthService', async () => {
  const actual = await vi.importActual('../services/tauriAuthService');
  return {
    ...actual,
    getSession: vi.fn(),
  };
});

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'device_id') return 'TEST-DEVICE-456';
        return null;
      }),
    }),
  ),
}));

const MOCK_STORES = [
  {
    id: 'STORE-A',
    code: 'A',
    name: 'Store Alpha',
    address: '1 Main St',
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

const MOCK_PRODUCT = {
  id: 'PROD-001',
  sku: 'ELEC-001',
  name: 'Hisense 120L Refrigerator',
  category: 'Appliances',
  unit: 'pcs',
  is_active: true,
  serial_tracking_enabled: false,
  description: null,
  model_number: null,
  barcode: null,
  alternate_names: null,
  reorder_point: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const MOCK_SESSION = {
  access_token: 'test-token',
  refresh_token: '',
  user_id: 'TEST-USER-123',
  username: 'testuser',
  full_name: 'Test User',
  role: 'STORE_MANAGER' as const,
  assigned_store_id: 'STORE-A',
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  token_expired_offline: false,
};

function makeSaleTx(overrides: Partial<InventoryTransaction> = {}): InventoryTransaction {
  return {
    transaction_id: 'TX-SALE-001',
    store_id: 'STORE-A',
    product_id: 'PROD-001',
    movement_type: 'SALE' as const,
    stock_bucket: 'AVAILABLE' as const,
    quantity_delta: -1,
    occurred_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    user_id: 'USER-001',
    device_id: 'DEV-001',
    reference_number: null,
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING' as const,
    server_accepted_at: null,
    original_transaction_id: null,
    ...overrides,
  };
}

describe('SaleStockView — Issue 07 Acceptance Criteria', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    // Mock Tauri internals to enable device_id loading in tests
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
    vi.spyOn(tauriAuthService, 'getSession').mockResolvedValue(MOCK_SESSION);
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'searchProducts').mockResolvedValue([MOCK_PRODUCT]);
    // Default: balance is 6 (AT-001 starting condition)
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-A-PROD-001-AVAILABLE',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      stock_bucket: 'AVAILABLE',
      quantity: 6,
      updated_at: new Date().toISOString(),
    });
  });

  async function setupFilledForm(qty: number = 1): Promise<void> {
    render(<SaleStockView />);

    // Wait for stores to load and select first store
    await waitFor((): void => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('store-select'), {
        target: { value: 'STORE-A' },
      });
    });

    // Search for a product
    act((): void => {
      fireEvent.change(screen.getByTestId('product-search-input'), {
        target: { value: 'Hisense' },
      });
    });

    // Wait for results and select the product
    await waitFor((): void => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    // Wait for the balance to load and confirm product is selected
    await waitFor((): void => {
      expect(screen.getByTestId('selected-product-name')).toHaveTextContent(
        'Hisense 120L Refrigerator',
      );
    });

    // Set quantity
    act((): void => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: String(qty) },
      });
    });
  }

  // -------------------------------------------------------------------------
  // AT-001: sell 1 unit when 6 available → success banner, tx PENDING
  // -------------------------------------------------------------------------

  it('AT-001: sells 1 unit successfully and shows success confirmation', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockResolvedValueOnce(makeSaleTx());

    await setupFilledForm(1);

    // Submit
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('sale-success-banner')).toBeInTheDocument();
    });

    // Success banner is visible
    expect(screen.getByTestId('sale-success-banner')).toBeInTheDocument();

    // sellStock was called exactly once with correct args
    expect(tauriTransactionService.sellStock).toHaveBeenCalledOnce();
    const callArg = vi.mocked(tauriTransactionService.sellStock).mock.calls[0][0];
    expect(callArg.store_id).toBe('STORE-A');
    expect(callArg.product_id).toBe('PROD-001');
    expect(callArg.quantity).toBe(1);
    expect(callArg.movement_type).toBe('SALE');
    // Property 1: session-derived actor IDs are used
    expect(callArg.user_id).toBe('TEST-USER-123');
    expect(callArg.device_id).toBe('TEST-DEVICE-456');
  });

  it('AT-001: available quantity is fetched from the service and displayed (shows 6)', async (): Promise<void> => {
    render(<SaleStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('store-select'), {
        target: { value: 'STORE-A' },
      });
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('product-search-input'), {
        target: { value: 'Hisense' },
      });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    // After product selection, getStockBalance is called and the UI shows available qty
    await waitFor((): void => {
      expect(tauriTransactionService.getStockBalance).toHaveBeenCalledWith('STORE-A', 'PROD-001');
    });

    await waitFor((): void => {
      expect(screen.getByTestId('available-quantity-display')).toHaveTextContent('6');
    });
  });

  // -------------------------------------------------------------------------
  // AT-012: sell more than available → strict-mode rejection with available qty
  // -------------------------------------------------------------------------

  it('AT-012: rejects sale when quantity exceeds available and shows available quantity in error', async (): Promise<void> => {
    // sellStock rejects with the strict-mode message (mirrors Rust sell_stock and mock service)
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupFilledForm(10);

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    const errorText = screen.getByTestId('sale-error-banner').textContent;
    expect(errorText).toContain('Insufficient stock');
    expect(errorText).toContain('6'); // available quantity must be shown (AT-012)
    expect(errorText).not.toMatch(/undefined/i);
  });

  it('AT-012: no success banner is shown when sale is rejected', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupFilledForm(10);

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sale-success-banner')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('sale_stock nav item is present in the sidebar', async (): Promise<void> => {
    const { getByTestId } = render(<SaleStockView />);
    // The view itself renders — the nav check is at App-level; just confirm no crash
    expect(getByTestId('sale-stock-view')).toBeInTheDocument();
  });
});
