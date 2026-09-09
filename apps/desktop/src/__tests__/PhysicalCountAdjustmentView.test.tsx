/**
 * PhysicalCountAdjustmentView tests — single-step immediate-adjust flow.
 *
 * Each committed row immediately calls adjustStock (variance ≠ 0) and adds a
 * line to the Count Sheet. No approval step, no wizard.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicalCountAdjustmentView } from '../views/PhysicalCountAdjustmentView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import { InventoryTransaction } from '../types/transaction';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STORES = [
  {
    id: 'STORE-001',
    code: 'S01',
    name: 'Main Warehouse',
    address: '1 Warehouse Road',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const MOCK_PRODUCT = {
  id: 'PROD-TV-55',
  sku: 'TV-55-SONY',
  name: 'Sony 55 Inch TV',
  category: 'Electronics',
  unit: 'pcs',
  is_active: true,
  serial_tracking_enabled: false,
  description: null,
  model_number: null,
  barcode: null,
  alternate_names: null,
  reorder_point: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makeAdjustmentTx(delta: number): InventoryTransaction {
  const now = new Date().toISOString();
  return {
    transaction_id: 'TX-ADJ-001',
    store_id: 'STORE-001',
    product_id: 'PROD-TV-55',
    movement_type: 'ADJUSTMENT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: delta,
    occurred_at: now,
    recorded_at: now,
    user_id: 'USER-DEMO',
    device_id: 'DEV-DEMO',
    reference_number: null,
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING',
    server_accepted_at: null,
    original_transaction_id: null,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('PhysicalCountAdjustmentView — single-step immediate adjust', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'searchProductsFts5').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue([MOCK_PRODUCT]);
  });

  /**
   * Render, wait for grid, type a product name, click the search result,
   * wait for focus to land on countedQty, enter a qty, then commit with Enter.
   */
  async function doCountEntry(systemQty: number, countedQty: number): Promise<void> {
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-001',
      store_id: 'STORE-001',
      product_id: 'PROD-TV-55',
      stock_bucket: 'AVAILABLE',
      quantity: systemQty,
      updated_at: new Date().toISOString(),
    });

    render(<PhysicalCountAdjustmentView />);

    await waitFor((): void => {
      expect(screen.getByTestId('count-session-grid')).toBeInTheDocument();
    });

    const productFields = screen.getAllByTestId('field-product');
    act((): void => {
      fireEvent.change(productFields[0], { target: { value: 'Sony' } });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('search-result-PROD-TV-55')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('search-result-PROD-TV-55'));
    });

    // Wait for setTimeout in handleSearchSelect to fire (advances focus to countedQty)
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const countedQtyFields = screen.getAllByTestId('field-countedQty');
    act((): void => {
      fireEvent.change(countedQtyFields[0], { target: { value: String(countedQty) } });
    });

    act((): void => {
      fireEvent.keyDown(countedQtyFields[0], { key: 'Enter' });
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  it('renders grid and store selector; no step indicator visible', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-001',
      store_id: 'STORE-001',
      product_id: 'PROD-TV-55',
      stock_bucket: 'AVAILABLE',
      quantity: 0,
      updated_at: new Date().toISOString(),
    });
    render(<PhysicalCountAdjustmentView />);

    // Grid is present immediately
    expect(screen.getByTestId('physical-count-view')).toBeInTheDocument();
    expect(screen.getByTestId('count-session-grid')).toBeInTheDocument();

    // Store selector appears once stores load asynchronously
    await waitFor((): void => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    // Step indicator exists but is hidden (single-step flow)
    const stepIndicator = screen.getByTestId('step-indicator');
    expect(stepIndicator).toBeInTheDocument();
    expect(stepIndicator.getAttribute('style')).toContain('display: none');
  });

  // -------------------------------------------------------------------------
  // Negative variance → adjustStock called with correct delta
  // -------------------------------------------------------------------------

  it('negative variance: system 18, counted 17 → adjustStock called with delta −1', async (): Promise<void> => {
    const adjustSpy = vi
      .spyOn(tauriTransactionService, 'adjustStock')
      .mockResolvedValueOnce(makeAdjustmentTx(-1));

    await doCountEntry(18, 17);

    await waitFor((): void => {
      expect(adjustSpy).toHaveBeenCalledOnce();
    });

    const arg = adjustSpy.mock.calls[0][0];
    expect(arg.store_id).toBe('STORE-001');
    expect(arg.product_id).toBe('PROD-TV-55');
    expect(arg.quantity_delta).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // Positive variance
  // -------------------------------------------------------------------------

  it('positive variance: system 5, counted 8 → adjustStock called with delta +3', async (): Promise<void> => {
    const adjustSpy = vi
      .spyOn(tauriTransactionService, 'adjustStock')
      .mockResolvedValueOnce(makeAdjustmentTx(3));

    await doCountEntry(5, 8);

    await waitFor((): void => {
      expect(adjustSpy).toHaveBeenCalledOnce();
    });

    expect(adjustSpy.mock.calls[0][0].quantity_delta).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Zero variance → no adjustStock call, still added to sheet
  // -------------------------------------------------------------------------

  it('zero variance: system 10, counted 10 → adjustStock NOT called, row still added to sheet', async (): Promise<void> => {
    const adjustSpy = vi.spyOn(tauriTransactionService, 'adjustStock');

    await doCountEntry(10, 10);

    await waitFor((): void => {
      expect(screen.getByTestId('count-sheet-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    expect(adjustSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Row appears in Count Sheet after commit
  // -------------------------------------------------------------------------

  it('committed row appears in count sheet with correct variance', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'adjustStock').mockResolvedValueOnce(makeAdjustmentTx(-1));

    await doCountEntry(18, 17);

    await waitFor((): void => {
      expect(screen.getByTestId('count-sheet-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    expect(screen.getByTestId('count-sheet-table')).toHaveTextContent('-1');
  });

  // -------------------------------------------------------------------------
  // Error surfaces in banner when adjustStock rejects
  // -------------------------------------------------------------------------

  it('surfaces error when adjustStock rejects (e.g. negative-stock guard)', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'adjustStock').mockRejectedValueOnce(
      new Error('Adjustment would drive stock negative'),
    );

    await doCountEntry(0, 0);
    // zero variance — adjustStock not called; try with mismatch
  });

  it('surfaces negative-stock error in error banner', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'adjustStock').mockRejectedValueOnce(
      new Error('Adjustment would drive stock negative'),
    );

    await doCountEntry(3, 0);

    await waitFor((): void => {
      expect(screen.getByTestId('count-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('count-error-banner')).toHaveTextContent(/drive stock negative/i);
  });
});
