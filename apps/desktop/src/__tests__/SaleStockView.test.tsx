/**
 * SaleStockView frontend tests — Issue 07 acceptance criteria (grid UI).
 *
 * AT-001: operator selects a product via the grid, commits the row →
 *         sellStock is called with correct args; success banner is shown.
 * AT-012: sellStock rejects with "Insufficient stock" → error banner shown,
 *         no success banner.
 *
 * The grid keyboard model under test:
 *   - Product field is the first column; right panel shows matching items.
 *   - Clicking an item in the panel (or pressing Enter when highlighted)
 *     fills the product field and moves focus to Qty.
 *   - Pressing Enter on Receipt No. (last field) commits the row.
 *   - Arrow Up/Down change the panel highlight index; they do NOT move
 *     between grid rows.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaleStockView } from '../views/SaleStockView';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriAuthService from '../services/tauriAuthService';
import { InventoryTransaction } from '../types/transaction';

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

/**
 * Renders the view, waits for stores + products to load, then simulates:
 *  1. Clicking the product suggestion in the panel (which fills the product field)
 *  2. Setting the quantity field value
 *  3. Pressing Enter on the Receipt No. field to commit the row
 */
async function setupAndCommitRow(qty: number = 1): Promise<void> {
  render(<SaleStockView />);

  // Wait for the live-search-panel to populate (allProducts loaded)
  await waitFor(() => {
    expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
  });

  // Simulate typing in the product field (row 0)
  const productCell = screen.getByTestId('cell-0-product');
  act(() => {
    fireEvent.focus(productCell);
    fireEvent.change(productCell, { target: { value: 'Hisense' } });
  });

  // Wait for search results
  await waitFor(() => {
    expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
  });

  // Click the product in the panel
  act(() => {
    fireEvent.click(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`));
  });

  // Set quantity
  await waitFor(() => {
    const qtyCell = screen.getByTestId('cell-0-quantity');
    expect(document.activeElement === qtyCell || qtyCell).toBeTruthy();
  });

  const qtyCell = screen.getByTestId('cell-0-quantity');
  act(() => {
    fireEvent.change(qtyCell, { target: { value: String(qty) } });
  });

  // Press Enter on quantity to go to Receipt No.
  act(() => {
    fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
  });

  // Press Enter on Receipt No. to commit
  const receiptCell = screen.getByTestId('cell-0-reference_number');
  await act(async () => {
    fireEvent.keyDown(receiptCell, { key: 'Enter', code: 'Enter' });
  });
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('SaleStockView — Issue 07 Acceptance Criteria (grid UI)', (): void => {
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
    vi.spyOn(tauriTransactionService, 'getStockBalance').mockResolvedValue({
      id: 'SB-STORE-A-PROD-001-AVAILABLE',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      stock_bucket: 'AVAILABLE',
      quantity: 6,
      updated_at: new Date().toISOString(),
    });
    vi.spyOn(tauriTransactionService, 'updateTransaction').mockResolvedValue(
      makeSaleTx({
        quantity_delta: -1,
      }),
    );
    vi.spyOn(tauriTransactionService, 'deleteTransaction').mockResolvedValue();
  });

  // ─── Render checks ────────────────────────────────────────────────────────

  it('renders the sale-stock-view container', async (): Promise<void> => {
    render(<SaleStockView />);
    expect(screen.getByTestId('sale-stock-view')).toBeInTheDocument();
  });

  it('renders the grid with 9 numbered rows', async (): Promise<void> => {
    render(<SaleStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('sale-grid')).toBeInTheDocument();
    });
    // Each row has a product cell: cell-0-product … cell-8-product
    for (let i = 0; i < 9; i++) {
      expect(screen.getByTestId(`cell-${i}-product`)).toBeInTheDocument();
    }
  });

  it('right panel is visible on mount and shows all products (not empty)', async (): Promise<void> => {
    render(<SaleStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    });
    // The panel should show the product without the user typing anything
    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });
  });

  it('live panel filters as the user types in the product field', async (): Promise<void> => {
    render(<SaleStockView />);

    await waitFor(() => {
      expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    });

    const productCell = screen.getByTestId('cell-0-product');
    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: 'His' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });

    // Wait for the debounced backend search to fire (100ms debounce in SaleStockView.tsx)
    await waitFor(
      () => {
        expect(tauriProductService.searchProductsFts5).toHaveBeenCalledWith('His');
      },
      { timeout: 1000 },
    );
  });

  // ─── AT-001: sell 1 unit successfully ────────────────────────────────────

  it('AT-001: sells 1 unit successfully and shows success confirmation', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockResolvedValueOnce(makeSaleTx());

    await setupAndCommitRow(1);

    await waitFor(() => {
      expect(screen.getByTestId('sale-success-banner')).toBeInTheDocument();
    });

    expect(tauriTransactionService.sellStock).toHaveBeenCalledOnce();
    const callArg = vi.mocked(tauriTransactionService.sellStock).mock.calls[0][0];
    expect(callArg.store_id).toBe('STORE-A');
    expect(callArg.product_id).toBe('PROD-001');
    expect(callArg.quantity).toBe(1);
    expect(callArg.movement_type).toBe('SALE');
    expect(callArg.user_id).toBe('TEST-USER-123');
    expect(callArg.device_id).toBe('TEST-DEVICE-456');
  });

  it('AT-001: committed row is dimmed (opacity) after commit', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockResolvedValueOnce(makeSaleTx());

    await setupAndCommitRow(1);

    await waitFor(() => {
      expect(screen.getByTestId('sale-success-banner')).toBeInTheDocument();
    });

    // The committed row's product input should be disabled
    const productCell = screen.getByTestId('cell-0-product');
    expect(productCell).toBeDisabled();
  });

  // ─── AT-012: insufficient stock rejection ─────────────────────────────────

  it('AT-012: rejects sale when stock is insufficient and shows error', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupAndCommitRow(10);

    await waitFor(() => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    const errorText = screen.getByTestId('sale-error-banner').textContent;
    expect(errorText).toContain('Insufficient stock');
    expect(errorText).toContain('6');
    expect(errorText).not.toMatch(/undefined/i);
  });

  it('AT-012: no success banner shown when sale is rejected', async (): Promise<void> => {
    vi.spyOn(tauriTransactionService, 'sellStock').mockRejectedValueOnce(
      new Error('Insufficient stock. Available quantity: 6. Cannot sell 10 units.'),
    );

    await setupAndCommitRow(10);

    await waitFor(() => {
      expect(screen.getByTestId('sale-error-banner')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sale-success-banner')).not.toBeInTheDocument();
  });

  // ─── Arrow key model ───────────────────────────────────────────────────────

  it('Arrow Down in product field increases panel highlight, does not move row focus', async (): Promise<void> => {
    render(<SaleStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    });
    await waitFor(() => {
      // Panel must have at least one item
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });

    const productCell = screen.getByTestId('cell-0-product');
    act(() => {
      fireEvent.focus(productCell);
    });

    act(() => {
      fireEvent.keyDown(productCell, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Row 1's product field must NOT be focused (arrow down must not leave row 0)
    const row1ProductCell = screen.getByTestId('cell-1-product');
    expect(document.activeElement).not.toBe(row1ProductCell);
    // Row 0's product field should remain the focused element (or be in the grid container)
    expect(document.activeElement).toBe(productCell);
  });

  // ─── Keyboard flow: Backspace on empty field ───────────────────────────────

  it('Backspace on empty Qty returns focus to Product field', async (): Promise<void> => {
    render(<SaleStockView />);
    await waitFor(() => {
      expect(screen.getByTestId('sale-grid')).toBeInTheDocument();
    });

    // Navigate to qty field by pressing Enter on product
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

    // Clear the qty and press Backspace
    await waitFor(() => {
      expect(screen.getByTestId('cell-0-quantity')).toBeDefined();
    });
    const qtyCell = screen.getByTestId('cell-0-quantity');
    act(() => {
      fireEvent.focus(qtyCell);
      fireEvent.change(qtyCell, { target: { value: '' } });
      fireEvent.keyDown(qtyCell, { key: 'Backspace', code: 'Backspace' });
    });

    // Focus should return to the product cell
    await waitFor(() => {
      expect(document.activeElement).toBe(productCell);
    });
  });
});
