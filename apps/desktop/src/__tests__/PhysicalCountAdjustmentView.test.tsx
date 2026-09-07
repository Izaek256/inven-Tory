/**
 * PhysicalCountAdjustmentView integration tests — Issue 11 (AT-008).
 *
 * Acceptance Criteria (AT-008):
 *   System quantity = 18, physical count = 17
 *   → Approved reconciliation creates ADJUSTMENT −1
 *     with reason, responsible user, and audit trail.
 *
 * Additional coverage:
 *   - Step 1: renders count session with linear entry form and count sheet.
 *   - Step 2: requires reason + elevated-permission flag; rejects on either missing.
 *   - Step 3: done panel shows the confirmed ADJUSTMENT transaction details.
 *   - Negative-stock guard: adjustment that would go below 0 is rejected cleanly.
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

/** Build a mock ADJUSTMENT transaction for AT-008 (delta = −1). */
function makeAdjustmentTx(delta: number, reason: string): InventoryTransaction {
  const now = new Date().toISOString();
  return {
    transaction_id: 'TX-ADJ-AT008',
    store_id: 'STORE-001',
    product_id: 'PROD-TV-55',
    movement_type: 'ADJUSTMENT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: delta,
    occurred_at: now,
    recorded_at: now,
    user_id: 'USER-DEMO',
    device_id: 'DEV-DEMO',
    reference_number: 'COUNT-STORE-001-PROD-TV-55-001',
    reason_code: reason,
    transfer_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING',
    server_accepted_at: null,
    original_transaction_id: null,
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

describe('PhysicalCountAdjustmentView — Issue 11 (AT-008)', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'searchProductsFts5').mockResolvedValue([MOCK_PRODUCT]);
  });

  /** Renders the view and walks through Step 1 to select store + product. */
  async function selectProductWithBalance(systemQty: number): Promise<void> {
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-001-PROD-TV-55-AVAILABLE',
      store_id: 'STORE-001',
      product_id: 'PROD-TV-55',
      stock_bucket: 'AVAILABLE',
      quantity: systemQty,
      updated_at: new Date().toISOString(),
    });

    render(<PhysicalCountAdjustmentView />);

    await waitFor((): void => {
      expect(screen.getByTestId('field-store')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('field-product'), {
        target: { value: 'Sony' },
      });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('search-result-PROD-TV-55')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('search-result-PROD-TV-55'));
    });
  }

  // -------------------------------------------------------------------------
  // Basic render
  // -------------------------------------------------------------------------

  it('renders the physical-count view with step indicator', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-001-PROD-TV-55',
      store_id: 'STORE-001',
      product_id: 'PROD-TV-55',
      stock_bucket: 'AVAILABLE',
      quantity: 0,
      updated_at: new Date().toISOString(),
    });
    render(<PhysicalCountAdjustmentView />);
    expect(screen.getByTestId('physical-count-view')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('count-session-panel')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Step 1 — count entry and sheet
  // -------------------------------------------------------------------------

  it('Step 1: adds a count line to the sheet when product and counted qty are entered', async (): Promise<void> => {
    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });
  });

  // -------------------------------------------------------------------------
  // AT-008 — full end-to-end integration test
  // -------------------------------------------------------------------------

  it('AT-008: system qty 18, physical count 17 → ADJUSTMENT −1 with reason, user, audit trail', async (): Promise<void> => {
    const adjustSpy = vi
      .spyOn(tauriTransactionService, 'adjustStock')
      .mockResolvedValueOnce(makeAdjustmentTx(-1, 'Cycle count: one unit missing'));

    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('summary-system-qty')).toHaveTextContent('18');
    expect(screen.getByTestId('summary-counted-qty')).toHaveTextContent('17');
    expect(screen.getByTestId('summary-variance')).toHaveTextContent('-1');
    expect(screen.getByTestId('summary-user')).toHaveTextContent('USER-DEMO');

    act((): void => {
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Cycle count: one unit missing' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('elevated-permission-checkbox'));
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('adjustment-done-panel')).toBeInTheDocument();
    });

    expect(adjustSpy).toHaveBeenCalledOnce();
    const callArg = adjustSpy.mock.calls[0][0];
    expect(callArg.store_id).toBe('STORE-001');
    expect(callArg.product_id).toBe('PROD-TV-55');
    expect(callArg.quantity_delta).toBe(-1);
    expect(callArg.reason).toBe('Cycle count: one unit missing');
    expect(callArg.user_id).toBe('USER-DEMO');

    expect(screen.getByTestId('result-transaction-id')).toHaveTextContent('TX-ADJ-AT008');
    expect(screen.getByTestId('result-movement-type')).toHaveTextContent('ADJUSTMENT');
    expect(screen.getByTestId('result-quantity-delta')).toHaveTextContent('-1');
    expect(screen.getByTestId('result-reason')).toHaveTextContent('Cycle count: one unit missing');
    expect(screen.getByTestId('result-user')).toHaveTextContent('USER-DEMO');
  });

  // -------------------------------------------------------------------------
  // Reason required validation
  // -------------------------------------------------------------------------

  it('Step 2: rejects approval when reason is blank', async (): Promise<void> => {
    const adjustSpy = vi.spyOn(tauriTransactionService, 'adjustStock');

    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('elevated-permission-checkbox'));
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('count-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('reason-error')).toHaveTextContent(/reason is required/i);
    expect(adjustSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Elevated-permission required (provisional check)
  // -------------------------------------------------------------------------

  it('Step 2: rejects approval when elevated-permission checkbox is not ticked', async (): Promise<void> => {
    const adjustSpy = vi.spyOn(tauriTransactionService, 'adjustStock');

    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Missing unit found' },
      });
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('count-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('permission-error')).toHaveTextContent(
      /elevated permission is required/i,
    );
    expect(adjustSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Positive variance (surplus)
  // -------------------------------------------------------------------------

  it('positive variance: system 5, counted 8 → ADJUSTMENT +3', async (): Promise<void> => {
    const adjustSpy = vi
      .spyOn(tauriTransactionService, 'adjustStock')
      .mockResolvedValueOnce(makeAdjustmentTx(3, 'Three extra units found in storeroom'));

    await selectProductWithBalance(5);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '8' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Three extra units found in storeroom' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('elevated-permission-checkbox'));
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('adjustment-done-panel')).toBeInTheDocument();
    });

    const callArg = adjustSpy.mock.calls[0][0];
    expect(callArg.quantity_delta).toBe(3);
    expect(screen.getByTestId('result-quantity-delta')).toHaveTextContent('+3');
  });

  // -------------------------------------------------------------------------
  // Back-button returns to Step 1
  // -------------------------------------------------------------------------

  it('back button on Step 2 returns user to Step 1', async (): Promise<void> => {
    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('back-to-count-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('count-session-panel')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Start New Count resets to Step 1
  // -------------------------------------------------------------------------

  it('Start New Count button resets the workflow to Step 1', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'adjustStock').mockResolvedValueOnce(
      makeAdjustmentTx(-1, 'Reset test reason'),
    );

    await selectProductWithBalance(18);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '17' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Reset test reason' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('elevated-permission-checkbox'));
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('adjustment-done-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('new-count-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('count-session-panel')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Negative-stock rejection
  // -------------------------------------------------------------------------

  it('surfaces error when adjustment would drive stock negative', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'adjustStock').mockRejectedValueOnce(
      new Error(
        "Adjustment would drive stock negative (-5) for store 'STORE-001', product 'PROD-TV-55'. Cannot apply delta -5.",
      ),
    );

    await selectProductWithBalance(0);

    act((): void => {
      fireEvent.change(screen.getByTestId('field-countedQty'), {
        target: { value: '0' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('linear-entry-submit'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('session-table')).toHaveTextContent('Sony 55 Inch TV');
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('proceed-to-approval-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('approval-panel')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Stock error test' },
      });
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('elevated-permission-checkbox'));
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('approve-adjustment-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('count-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('count-error-banner')).toHaveTextContent(/drive stock negative/i);
  });
});
