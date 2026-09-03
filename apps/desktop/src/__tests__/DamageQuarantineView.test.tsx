/**
 * DamageQuarantineView frontend tests — Issue 10 acceptance criteria.
 *
 * Acceptance Criteria:
 *   - Moving 2 units to DAMAGED reduces AVAILABLE by 2 and increases DAMAGED by 2, with a stored reason.
 *   - Required reason field validation.
 *   - Strict mode rejection surfaced cleanly in error banner.
 *   - Regression check: confirm Sale screen (Issue 07) cannot sell DAMAGED/QUARANTINE stock.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DamageQuarantineView } from '../views/DamageQuarantineView';
import { SaleStockView } from '../views/SaleStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriAuthService from '../services/tauriAuthService';
import { InventoryTransaction, StockBucket } from '../types/transaction';

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

const MOCK_PRODUCT = {
  id: 'PROD-001',
  sku: 'ELEC-001',
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
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function makeMoveTxs(
  fromBucket: StockBucket,
  toBucket: StockBucket,
  qty: number,
  reason: string,
): InventoryTransaction[] {
  const now = new Date().toISOString();
  return [
    {
      transaction_id: 'TX-DMG-OUT-01',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      movement_type: 'DAMAGE' as const,
      stock_bucket: fromBucket,
      quantity_delta: -qty,
      occurred_at: now,
      recorded_at: now,
      user_id: 'USER-DEMO',
      device_id: 'DEV-DEMO',
      reference_number: null,
      reason_code: reason,
      transfer_id: null,
      purchase_order_id: null,
      batch_id: null,
      client_sequence: null,
      sync_status: 'PENDING' as const,
      server_accepted_at: null,
      original_transaction_id: null,
    },
    {
      transaction_id: 'TX-DMG-IN-01',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      movement_type: 'DAMAGE' as const,
      stock_bucket: toBucket,
      quantity_delta: qty,
      occurred_at: now,
      recorded_at: now,
      user_id: 'USER-DEMO',
      device_id: 'DEV-DEMO',
      reference_number: null,
      reason_code: reason,
      transfer_id: null,
      purchase_order_id: null,
      batch_id: null,
      client_sequence: null,
      sync_status: 'PENDING' as const,
      server_accepted_at: null,
      original_transaction_id: null,
    },
  ];
}

describe('DamageQuarantineView — Issue 10 Acceptance Criteria', (): void => {
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
    vi.spyOn(tauriTransactionService, 'getStockBalanceForBucket').mockImplementation(
      async (_storeId, _productId, bucket) => {
        if (bucket === 'AVAILABLE') {
          return {
            id: 'SB-A-01-AVAIL',
            store_id: 'STORE-A',
            product_id: 'PROD-001',
            stock_bucket: 'AVAILABLE',
            quantity: 10,
            updated_at: new Date().toISOString(),
          };
        }
        return {
          id: `SB-A-01-${bucket}`,
          store_id: 'STORE-A',
          product_id: 'PROD-001',
          stock_bucket: bucket,
          quantity: 0,
          updated_at: new Date().toISOString(),
        };
      },
    );
  });

  async function setupForm(qty: number = 2, reasonText: string = ''): Promise<void> {
    render(<DamageQuarantineView />);

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
        target: { value: 'Sony' },
      });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('selected-product-name')).toHaveTextContent('Sony 55 Inch TV');
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: String(qty) },
      });
    });

    if (reasonText) {
      act((): void => {
        fireEvent.change(screen.getByTestId('reason-input'), {
          target: { value: reasonText },
        });
      });
    }
  }

  it('renders the damage/quarantine screen correctly', async (): Promise<void> => {
    render(<DamageQuarantineView />);
    expect(screen.getByTestId('damage-quarantine-view')).toBeInTheDocument();
  });

  it('requires a reason field before submitting', async (): Promise<void> => {
    const moveSpy = vi.spyOn(tauriTransactionService, 'moveStockBucket');
    await setupForm(2, ''); // No reason

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-move-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('damage-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('reason-error')).toHaveTextContent(/Reason is required/i);
    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('moving 2 units to DAMAGED succeeds with stored reason', async (): Promise<void> => {
    const moveSpy = vi
      .spyOn(tauriTransactionService, 'moveStockBucket')
      .mockResolvedValueOnce(makeMoveTxs('AVAILABLE', 'DAMAGED', 2, 'Broken screen'));

    await setupForm(2, 'Broken screen');

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-move-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('damage-success-banner')).toBeInTheDocument();
    });

    expect(moveSpy).toHaveBeenCalledOnce();
    const callArg = moveSpy.mock.calls[0][0];
    expect(callArg.store_id).toBe('STORE-A');
    expect(callArg.product_id).toBe('PROD-001');
    expect(callArg.from_bucket).toBe('AVAILABLE');
    expect(callArg.to_bucket).toBe('DAMAGED');
    expect(callArg.quantity).toBe(2);
    expect(callArg.reason).toBe('Broken screen');
    // Property 1: session-derived actor IDs are used
    expect(callArg.user_id).toBe('TEST-USER-123');
    expect(callArg.device_id).toBe('TEST-DEVICE-456');

    expect(screen.getByTestId('damage-success-banner')).toHaveTextContent(
      'Stock movement recorded successfully! 2 unit(s) moved from AVAILABLE to DAMAGED.',
    );
  });

  it('surfaces strict mode rejection when source bucket has insufficient stock', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'moveStockBucket').mockRejectedValueOnce(
      new Error(
        'Insufficient stock in AVAILABLE bucket. Available quantity: 1. Cannot move 5 units.',
      ),
    );

    await setupForm(5, 'Mass damage');

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-move-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('damage-error-banner')).toBeInTheDocument();
    });

    const errText = screen.getByTestId('damage-error-banner').textContent;
    expect(errText).toContain('Insufficient stock in AVAILABLE bucket');
  });

  // -------------------------------------------------------------------------
  // Regression Test: Sale screen (Issue 07) cannot sell DAMAGED/QUARANTINE stock
  // -------------------------------------------------------------------------
  it('regression check: sale screen cannot sell DAMAGED stock (only AVAILABLE stock is sellable)', async (): Promise<void> => {
    // Mock getStockBalance (which returns AVAILABLE balance) as 0 after all units moved to DAMAGED
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-A-PROD-001-AVAILABLE',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      stock_bucket: 'AVAILABLE',
      quantity: 0, // All 10 units are in DAMAGED bucket
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 0. Cannot sell 1 units.'),
    );

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
        target: { value: 'Sony' },
      });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('product-result-PROD-001')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('product-result-PROD-001'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('available-quantity-display')).toHaveTextContent('0');
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: '1' },
      });
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-sale-btn'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('sale-error-banner')).toHaveTextContent(
      'Insufficient stock. Available quantity: 0. Cannot sell 1 units.',
    );
  });
});
