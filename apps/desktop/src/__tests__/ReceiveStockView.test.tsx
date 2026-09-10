/**
 * ReceiveStockView frontend tests.
 *
 * AT-003: operator selects a product via the grid, commits the row →
 *         receiveStock is called with correct args; success banner is shown.
 * AT-013: receiveStock rejects with error → error banner shown,
 *         no success banner.
 *
 * Grid keyboard model (same LinearGridEntry as SaleStockView):
 *   - Product field is the first column.
 *   - Pressing Enter on Receipt No. (last field) commits the row.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiveStockView } from '../views/ReceiveStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriAuthService from '../services/tauriAuthService';
import { InventoryTransaction } from '../types/transaction';

// Mock StoreContext to provide activeStoreId
const mockStoreContextValue = {
  activeStoreId: 'STORE-A',
  setActiveStoreId: vi.fn(),
};
vi.mock('../context/StoreContext', () => ({
  useActiveStore: () => mockStoreContextValue,
  StoreContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/tauriAuthService', async () => {
  const actual = await vi.importActual('../services/tauriAuthService');
  return { ...actual, getSession: vi.fn() };
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

// ─── Fixtures ──────────────────────────────────────────────────────────────────

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
  stock_quantity: 6,
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

function makeReceiptTx(overrides: Partial<InventoryTransaction> = {}): InventoryTransaction {
  return {
    transaction_id: 'TX-RECEIVE-001',
    store_id: 'STORE-A',
    product_id: 'PROD-001',
    movement_type: 'RECEIPT' as const,
    stock_bucket: 'AVAILABLE' as const,
    quantity_delta: 1,
    occurred_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    user_id: 'TEST-USER-123',
    device_id: 'TEST-DEVICE-456',
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function setupAndCommitRow(qty: number = 1): Promise<void> {
  render(<ReceiveStockView />);

  await waitFor(() => {
    expect(screen.getByTestId('receive-grid')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
  });

  const productCell = screen.getByTestId('cell-0-product');
  act(() => {
    fireEvent.focus(productCell);
    fireEvent.change(productCell, { target: { value: 'Hisense' } });
  });

  await waitFor(() => {
    expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
  });

  act(() => {
    fireEvent.click(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`));
  });

  // Allow the delayed focusCell(0, 1) setTimeout to settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const qtyCell = screen.getByTestId('cell-0-quantity');
  act(() => {
    fireEvent.change(qtyCell, { target: { value: String(qty) } });
  });

  // Press Enter on quantity → advances to next field
  act(() => {
    fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
  });

  // Press Enter on Supplier → advances to Receipt No.
  const supplierCell = screen.getByTestId('cell-0-supplier');
  act(() => {
    fireEvent.keyDown(supplierCell, { key: 'Enter', code: 'Enter' });
  });

  // Press Enter on Receipt No. (last field) to commit
  const receiptCell = screen.getByTestId('cell-0-reference_number');
  await act(async () => {
    fireEvent.keyDown(receiptCell, { key: 'Enter', code: 'Enter' });
  });
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('ReceiveStockView — grid UI and transaction flow', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
    vi.spyOn(tauriAuthService, 'getSession').mockResolvedValue(MOCK_SESSION);
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(MOCK_STORES);
    vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriProductService, 'searchProductsFts5').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriTransactionService, 'updateTransaction').mockResolvedValue(
      makeReceiptTx({ quantity_delta: 1 }),
    );
    vi.spyOn(tauriTransactionService, 'deleteTransaction').mockResolvedValue();
  });

  // ─── Render checks ────────────────────────────────────────────────────────

  it('renders the receive-stock-view container', async (): Promise<void> => {
    render(<ReceiveStockView />);
    expect(screen.getByTestId('receive-stock-view')).toBeInTheDocument();
  });

  it('renders the grid with 9 numbered rows', async (): Promise<void> => {
    render(<ReceiveStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('receive-grid')).toBeInTheDocument();
    });
    for (let i = 0; i < 9; i++) {
      expect(screen.getByTestId(`cell-${i}-product`)).toBeInTheDocument();
    }
  });

  it('right panel is visible on mount and shows all products', async (): Promise<void> => {
    render(<ReceiveStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });
  });

  // ─── AT-003: receive 1 unit successfully ──────────────────────────────────

  it('AT-003: receives 1 unit successfully and shows success confirmation', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'receiveStock').mockResolvedValueOnce(makeReceiptTx());

    await setupAndCommitRow(1);

    await waitFor(() => {
      expect(screen.getByText(/Stock received successfully/)).toBeInTheDocument();
    });

    expect(tauriTransactionService.receiveStock).toHaveBeenCalledOnce();
    const callArg = vi.mocked(tauriTransactionService.receiveStock).mock.calls[0][0];
    expect(callArg.store_id).toBe('STORE-A');
    expect(callArg.product_id).toBe('PROD-001');
    expect(callArg.quantity).toBe(1);
    expect(callArg.movement_type).toBe('RECEIPT');
    expect(callArg.user_id).toBe('TEST-USER-123');
    expect(callArg.device_id).toBe('TEST-DEVICE-456');
  });

  it('AT-003: committed row is dimmed (opacity) after commit', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'receiveStock').mockResolvedValueOnce(makeReceiptTx());

    await setupAndCommitRow(1);

    await waitFor(() => {
      expect(screen.getByText(/Stock received successfully/)).toBeInTheDocument();
    });

    const productCell = screen.getByTestId('cell-0-product');
    expect(productCell).toBeDisabled();
  });

  // ─── AT-013: transaction error ───────────────────────────────────────────

  it('AT-013: rejects receive when server errors and shows error', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'receiveStock').mockRejectedValueOnce(
      new Error('Failed to receive stock: Store mismatch'),
    );

    await setupAndCommitRow(5);

    await waitFor(() => {
      expect(screen.getByTestId('receive-error-banner')).toBeInTheDocument();
    });

    const errorText = screen.getByTestId('receive-error-banner').textContent;
    expect(errorText).toContain('Failed to receive stock');
  });

  it('AT-013: no success banner shown when receive is rejected', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'receiveStock').mockRejectedValueOnce(
      new Error('Failed to receive stock: Store mismatch'),
    );

    await setupAndCommitRow(5);

    await waitFor(() => {
      expect(screen.getByTestId('receive-error-banner')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Stock received successfully/)).not.toBeInTheDocument();
  });

  // ─── Arrow key model ──────────────────────────────────────────────────────

  it('Arrow Down in product field increases panel highlight, does not move row focus', async (): Promise<void> => {
    render(<ReceiveStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });

    const productCell = screen.getByTestId('cell-0-product');
    act(() => {
      fireEvent.focus(productCell);
    });

    act(() => {
      fireEvent.keyDown(productCell, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    const row1ProductCell = screen.getByTestId('cell-1-product');
    expect(document.activeElement).not.toBe(row1ProductCell);
    expect(document.activeElement).toBe(productCell);
  });

  // ─── Backspace navigation ────────────────────────────────────────────────

  it('Backspace on empty Qty returns focus to Product field', async (): Promise<void> => {
    render(<ReceiveStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('receive-grid')).toBeInTheDocument();
    });

    const productCell = screen.getByTestId('cell-0-product');
    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: 'Hisense' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`));
    });

    const qtyCell = screen.getByTestId('cell-0-quantity');
    act(() => {
      fireEvent.focus(qtyCell);
      fireEvent.change(qtyCell, { target: { value: '' } });
      fireEvent.keyDown(qtyCell, { key: 'Backspace', code: 'Backspace' });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(productCell);
    });
  });
});
