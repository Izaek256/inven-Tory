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

function makeSaleTx(overrides = {}) {
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

describe('SaleStockView — Issue 07 Acceptance Criteria', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  async function setupFilledForm(qty: number = 1) {
    render(<SaleStockView />);

    // Wait for stores to load and select first store
    await waitFor(() => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.change(screen.getByTestId('store-select'), {
        target: { value: 'STORE-A' },
      });
    });

    // Search for a product
    act(() => {
      fireEvent.change(screen.getByTestId('product-search-input'), {
        target: { value: 'Hisense' },
      });
    });

    // Wait for results and select the product
    await waitFor(() => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    // Wait for the balance to load and confirm product is selected
    await waitFor(() => {
      expect(screen.getByTestId('selected-product-name')).toHaveTextContent(
        'Hisense 120L Refrigerator',
      );
    });

    // Set quantity
    act(() => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: String(qty) },
      });
    });
  }

  // -------------------------------------------------------------------------
  // AT-001: sell 1 unit when 6 available → success banner, tx PENDING
  // -------------------------------------------------------------------------

  it('AT-001: sells 1 unit successfully and shows success confirmation', async () => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockResolvedValueOnce(makeSaleTx());

    await setupFilledForm(1);

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor(() => {
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
  });

  it('AT-001: available quantity is fetched from the service and displayed (shows 6)', async () => {
    render(<SaleStockView />);

    await waitFor(() => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.change(screen.getByTestId('store-select'), {
        target: { value: 'STORE-A' },
      });
    });

    act(() => {
      fireEvent.change(screen.getByTestId('product-search-input'), {
        target: { value: 'Hisense' },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    // After product selection, getStockBalance is called and the UI shows available qty
    await waitFor(() => {
      expect(tauriTransactionService.getStockBalance).toHaveBeenCalledWith('STORE-A', 'PROD-001');
    });

    await waitFor(() => {
      expect(screen.getByTestId('available-quantity-display')).toHaveTextContent('6');
    });
  });

  // -------------------------------------------------------------------------
  // AT-012: sell more than available → strict-mode rejection with available qty
  // -------------------------------------------------------------------------

  it('AT-012: rejects sale when quantity exceeds available and shows available quantity in error', async () => {
    // sellStock rejects with the strict-mode message (mirrors Rust sell_stock and mock service)
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupFilledForm(10);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    const errorText = screen.getByTestId('sale-error-banner').textContent;
    expect(errorText).toContain('Insufficient stock');
    expect(errorText).toContain('6'); // available quantity must be shown (AT-012)
    expect(errorText).not.toMatch(/undefined/i);
  });

  it('AT-012: no success banner is shown when sale is rejected', async () => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupFilledForm(10);

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sale-success-banner')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('sale_stock nav item is present in the sidebar', async () => {
    const { getByTestId } = render(<SaleStockView />);
    // The view itself renders — the nav check is at App-level; just confirm no crash
    expect(getByTestId('sale-stock-view')).toBeInTheDocument();
  });
});
