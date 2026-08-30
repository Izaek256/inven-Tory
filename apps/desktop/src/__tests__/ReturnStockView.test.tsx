/**
 * ReturnStockView frontend tests — Issue 08 acceptance criteria.
 *
 * Acceptance Criteria:
 *   - A customer return marked "damaged" increases the DAMAGED bucket, not AVAILABLE.
 *   - A supplier return decreases AVAILABLE (or the selected bucket) correctly.
 *   - Optional "original transaction reference" field is included in transaction submission.
 *   - Supplier return exceeding bucket balance displays error message.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReturnStockView } from '../views/ReturnStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import { InventoryTransaction, StockBucket } from '../types/transaction';

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
  name: 'LG Washing Machine 10kg',
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

function makeReturnTx(overrides: Partial<InventoryTransaction> = {}): InventoryTransaction {
  return {
    transaction_id: 'TX-RET-001',
    store_id: 'STORE-A',
    product_id: 'PROD-001',
    movement_type: 'RETURN' as const,
    stock_bucket: 'DAMAGED' as const,
    quantity_delta: 2,
    occurred_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    user_id: 'USER-DEMO',
    device_id: 'DEV-DEMO',
    reference_number: 'REF-SALE-1001',
    reason_code: 'Defective door seal',
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

describe('ReturnStockView — Issue 08 Acceptance Criteria', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'searchProducts').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriTransactionService, 'getStockBalanceForBucket').mockImplementation(
      async (_storeId: string, _productId: string, bucket: StockBucket) => {
        const qtyMap: Record<StockBucket, number> = {
          AVAILABLE: 5,
          DAMAGED: 0,
          QUARANTINE: 1,
          IN_TRANSIT: 0,
        };
        return {
          id: `SB-STORE-A-PROD-001-${bucket}`,
          store_id: 'STORE-A',
          product_id: 'PROD-001',
          stock_bucket: bucket,
          quantity: qtyMap[bucket] ?? 0,
          updated_at: new Date().toISOString(),
        };
      },
    );
  });

  async function setupForm(): Promise<void> {
    render(<ReturnStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('store-select')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.change(screen.getByTestId('product-search'), {
        target: { value: 'LG' },
      });
    });

    await waitFor((): void => {
      expect(screen.getByTestId('product-option-PROD-001')).toBeInTheDocument();
    });

    act((): void => {
      fireEvent.click(screen.getByTestId('product-option-PROD-001'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('selected-product-card')).toBeInTheDocument();
    });
  }

  it('customer return marked "damaged" increases the DAMAGED bucket, not AVAILABLE', async (): Promise<void> => {
    const returnStockSpy = vi
      .spyOn(tauriTransactionService, 'returnStock')
      .mockResolvedValue(makeReturnTx({ stock_bucket: 'DAMAGED', quantity_delta: 2 }));

    await setupForm();

    // Select DAMAGED condition bucket
    act((): void => {
      fireEvent.change(screen.getByTestId('bucket-select'), {
        target: { value: 'DAMAGED' },
      });
    });

    // Enter quantity 2
    act((): void => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: '2' },
      });
    });

    // Submit return
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-return-button'));
    });

    await waitFor((): void => {
      expect(returnStockSpy).toHaveBeenCalledWith({
        store_id: 'STORE-A',
        product_id: 'PROD-001',
        return_type: 'CUSTOMER',
        stock_bucket: 'DAMAGED',
        quantity: 2,
        reference_number: undefined,
        reason: undefined,
        user_id: 'USER-DEMO',
        device_id: 'DEV-DEMO',
      });
    });

    expect(screen.getByTestId('success-banner')).toBeInTheDocument();
  });

  it('supplier return decreases AVAILABLE bucket correctly', async (): Promise<void> => {
    const returnStockSpy = vi.spyOn(tauriTransactionService, 'returnStock').mockResolvedValue(
      makeReturnTx({
        stock_bucket: 'AVAILABLE',
        quantity_delta: -3,
      }),
    );

    await setupForm();

    // Toggle to Supplier Return
    act((): void => {
      fireEvent.click(screen.getByTestId('return-type-supplier'));
    });

    // Select AVAILABLE bucket
    act((): void => {
      fireEvent.change(screen.getByTestId('bucket-select'), {
        target: { value: 'AVAILABLE' },
      });
    });

    // Set quantity 3
    act((): void => {
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: '3' },
      });
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-return-button'));
    });

    await waitFor((): void => {
      expect(returnStockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          return_type: 'SUPPLIER',
          stock_bucket: 'AVAILABLE',
          quantity: 3,
        }),
      );
    });

    expect(screen.getByTestId('success-banner')).toBeInTheDocument();
  });

  it('preserves optional original transaction reference field on submit', async (): Promise<void> => {
    const returnStockSpy = vi
      .spyOn(tauriTransactionService, 'returnStock')
      .mockResolvedValue(makeReturnTx({ reference_number: 'TX-SALE-9912' }));

    await setupForm();

    act((): void => {
      fireEvent.change(screen.getByTestId('reference-input'), {
        target: { value: 'TX-SALE-9912' },
      });
      fireEvent.change(screen.getByTestId('reason-input'), {
        target: { value: 'Wrong item shipped' },
      });
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-return-button'));
    });

    await waitFor((): void => {
      expect(returnStockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reference_number: 'TX-SALE-9912',
          reason: 'Wrong item shipped',
        }),
      );
    });
  });

  it('supplier return exceeding bucket stock displays error message', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'returnStock').mockRejectedValue(
      new Error(
        'Insufficient stock in AVAILABLE bucket. Available quantity: 5. Cannot return 10 units to supplier.',
      ),
    );

    await setupForm();

    act((): void => {
      fireEvent.click(screen.getByTestId('return-type-supplier'));
      fireEvent.change(screen.getByTestId('quantity-input'), {
        target: { value: '10' },
      });
    });

    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByTestId('submit-return-button'));
    });

    await waitFor((): void => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Insufficient stock in AVAILABLE bucket. Available quantity: 5. Cannot return 10 units to supplier./i,
      ),
    ).toBeInTheDocument();
  });
});
