/**
 * TransferStockView frontend unit and integration tests — Issue 09 acceptance criteria.
 *
 * Acceptance Criteria & DoD:
 *   - AT-005 reproduced: transferring units A->B creates linked transactions with shared transfer_id.
 *   - Full transfer lifecycle (DRAFT -> DISPATCHED -> RECEIVED) covered by tests.
 *   - EXCEPTION and CANCELLED paths covered by tests.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferStockView } from '../views/TransferStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriTransferService from '../services/tauriTransferService';
import { Transfer } from '../types/transfer';
import { StockBalance } from '../types/transaction';

const MOCK_STORES = [
  {
    id: 'STORE-A',
    code: 'STA',
    name: 'Store Alpha',
    address: '1 Main St',
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'STORE-B',
    code: 'STB',
    name: 'Store Beta',
    address: '2 Second St',
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

const MOCK_PRODUCT = {
  id: 'PROD-001',
  sku: 'ELEC-001',
  name: 'LG Washer 10kg',
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

const MOCK_TRANSFER: Transfer = {
  id: 'TRF-TEST-001',
  source_store_id: 'STORE-A',
  destination_store_id: 'STORE-B',
  product_id: 'PROD-001',
  quantity: 5,
  status: 'DRAFT',
  created_by_user_id: 'USER-DEMO',
  notes: 'Rebalance stock',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('TransferStockView — Issue 09 Acceptance Criteria', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'searchProducts').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-A-PROD-001-AVAILABLE',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      stock_bucket: 'AVAILABLE',
      quantity: 15,
      updated_at: new Date().toISOString(),
    } as StockBalance);
    vi.spyOn(tauriTransferService, 'getTransfers').mockResolvedValue([MOCK_TRANSFER]);
  });

  it('renders transfer list with loaded transfers', async (): Promise<void> => {
    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('transfer-stock-view')).toBeInTheDocument();
    });

    expect(screen.getByTestId('transfers-table')).toBeInTheDocument();
    expect(screen.getByText('TRF-TEST-001')).toBeInTheDocument();
    expect(screen.getAllByText('DRAFT').length).toBeGreaterThan(0);
  });

  it('allows creating a new transfer as draft', async (): Promise<void> => {
    const createSpy = vi
      .spyOn(tauriTransferService, 'createTransfer')
      .mockResolvedValue(MOCK_TRANSFER);

    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('tab-create')).toBeInTheDocument();
    });

    // Switch to create tab
    fireEvent.click(screen.getByTestId('tab-create'));

    await waitFor((): void => {
      expect(screen.getByTestId('create-transfer-card')).toBeInTheDocument();
    });

    // Search and select product
    const searchInput = screen.getByTestId('input-product-search');
    fireEvent.change(searchInput, { target: { value: 'LG Washer' } });

    await waitFor((): void => {
      expect(screen.getByTestId('product-option-PROD-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('product-option-PROD-001'));

    // Set quantity
    const qtyInput = screen.getByTestId('input-quantity');
    fireEvent.change(qtyInput, { target: { value: '5' } });

    // Submit draft
    fireEvent.click(screen.getByTestId('btn-create-draft'));

    await waitFor((): void => {
      expect(createSpy).toHaveBeenCalledWith({
        source_store_id: 'STORE-A',
        destination_store_id: 'STORE-B',
        product_id: 'PROD-001',
        quantity: 5,
        created_by_user_id: 'USER-DEMO',
        notes: undefined,
      });
    });
  });

  it('dispatches a draft transfer', async (): Promise<void> => {
    const dispatchSpy = vi
      .spyOn(tauriTransferService, 'dispatchTransfer')
      .mockResolvedValue({ ...MOCK_TRANSFER, status: 'DISPATCHED' });

    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('btn-dispatch-TRF-TEST-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-dispatch-TRF-TEST-001'));

    await waitFor((): void => {
      expect(dispatchSpy).toHaveBeenCalledWith('TRF-TEST-001', 'USER-DEMO', 'DEV-DEMO');
    });
  });

  it('confirms receipt of a dispatched transfer', async (): Promise<void> => {
    const dispatchedTransfer: Transfer = { ...MOCK_TRANSFER, status: 'DISPATCHED' };
    vi.spyOn(tauriTransferService, 'getTransfers').mockResolvedValue([dispatchedTransfer]);
    const receiveSpy = vi
      .spyOn(tauriTransferService, 'receiveTransfer')
      .mockResolvedValue({ ...dispatchedTransfer, status: 'RECEIVED' });

    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('btn-receive-TRF-TEST-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-receive-TRF-TEST-001'));

    await waitFor((): void => {
      expect(receiveSpy).toHaveBeenCalledWith('TRF-TEST-001', 'USER-DEMO', 'DEV-DEMO');
    });
  });

  it('flags an exception on a dispatched transfer', async (): Promise<void> => {
    const dispatchedTransfer: Transfer = { ...MOCK_TRANSFER, status: 'DISPATCHED' };
    vi.spyOn(tauriTransferService, 'getTransfers').mockResolvedValue([dispatchedTransfer]);
    const exceptionSpy = vi
      .spyOn(tauriTransferService, 'markTransferException')
      .mockResolvedValue({ ...dispatchedTransfer, status: 'EXCEPTION' });

    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('btn-exception-TRF-TEST-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-exception-TRF-TEST-001'));

    await waitFor((): void => {
      expect(exceptionSpy).toHaveBeenCalledWith('TRF-TEST-001', 'Flagged by operator');
    });
  });

  it('cancels a transfer', async (): Promise<void> => {
    const cancelSpy = vi
      .spyOn(tauriTransferService, 'cancelTransfer')
      .mockResolvedValue({ ...MOCK_TRANSFER, status: 'CANCELLED' });

    render(<TransferStockView />);

    await waitFor((): void => {
      expect(screen.getByTestId('btn-cancel-TRF-TEST-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-cancel-TRF-TEST-001'));

    await waitFor((): void => {
      expect(cancelSpy).toHaveBeenCalledWith('TRF-TEST-001', 'USER-DEMO', 'DEV-DEMO');
    });
  });
});
