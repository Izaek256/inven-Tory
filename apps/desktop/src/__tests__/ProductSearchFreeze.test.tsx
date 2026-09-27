/**
 * Issue #7 — product search field freeze after a no-result search.
 *
 * GUI repro: on Sale Stock, type "/" into the product field → the side panel
 * shows "No results found" → Backspace cannot delete the character and the
 * window hangs permanently (force-kill required). Same path on Receive Stock
 * and Physical Count (shared LinearGridEntry / useGridKeyboardFlow).
 *
 * The permanent hang itself is a Rust-side self-deadlock that cannot be
 * reproduced in jsdom:
 *   search_products_fts5 holds the process-wide DB mutex
 *   (apps/desktop/src-tauri/src/lib.rs:5437, static DB_CONN at :21) and, when
 *   FTS returns 0 rows (or the query has no tokens, e.g. "/"), falls through to
 *   its fallback `search_products(query, store_id, None)` (lib.rs:5519) — the
 *   sibling #[tauri::command], which calls get_conn() again (lib.rs:2083) and
 *   locks the same non-reentrant std::sync::Mutex from the same thread →
 *   permanent deadlock. Every later DB command then blocks forever.
 *
 * These tests pin down the *frontend* contributions reported alongside the
 * hang, all of which existed at HEAD:
 *   1. the product field must stay editable through a no-result search +
 *      Backspace (type → 0 results → Backspace → type again),
 *   2. a burst of keystrokes must not fan out into one backend IPC per
 *      keystroke (undebounced onBarcodeScan effect,
 *      packages/ui/src/hooks/useGridKeyboardFlow.ts:382-390 + the 100 ms
 *      debounced search in the view),
 *   3. the pending debounced search must be cancelled when the view unmounts
 *      (SaleStockView.tsx:167-224 had no timer cleanup),
 *   4. backend calls must stay bounded while the field is being edited — an
 *      infinite render/effect loop would blow this (or time the test out).
 */

import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaleStockView } from '../views/SaleStockView';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriAuthService from '../services/tauriAuthService';

vi.mock('../services/tauriAuthService', async () => {
  const actual = await vi.importActual('../services/tauriAuthService');
  return { ...actual, getSession: vi.fn() };
});

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => (key === 'device_id' ? 'TEST-DEVICE-456' : null)),
    }),
  ),
}));

vi.mock('../context/StoreContext', () => ({
  useActiveStore: (): { activeStoreId: string; setActiveStoreId: () => void } => ({
    activeStoreId: 'STORE-A',
    setActiveStoreId: vi.fn(),
  }),
  StoreContext: {
    Provider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  },
}));

const MOCK_STORE = {
  id: 'STORE-A',
  code: 'A',
  name: 'Store Alpha',
  address: '1 Main St',
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

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

/** Backspace as a browser would: keydown first, then the default edit action. */
function pressBackspace(el: HTMLInputElement): void {
  const notPrevented = fireEvent.keyDown(el, { key: 'Backspace', code: 'Backspace' });
  if (notPrevented) {
    fireEvent.change(el, { target: { value: el.value.slice(0, -1) } });
  }
}

async function renderSale(): Promise<{
  productCell: HTMLInputElement;
  unmount: () => void;
}> {
  const view = renderWithProviders(<SaleStockView />);
  await waitFor(() => {
    expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
  });
  return {
    productCell: screen.getByTestId('cell-0-product') as HTMLInputElement,
    unmount: view.unmount,
  };
}

function searchCalls(): number {
  return vi.mocked(tauriProductService.searchProductsFts5).mock.calls.length;
}

describe('Issue #7 — product search stays editable after a no-result search', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
    vi.spyOn(tauriAuthService, 'getSession').mockResolvedValue(MOCK_SESSION);
    vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriProductService, 'getProductsByStore').mockResolvedValue([MOCK_PRODUCT]);
    vi.spyOn(tauriTransactionService, 'sellStock').mockResolvedValue({
      transaction_id: 'TX-1',
      store_id: 'STORE-A',
      product_id: 'PROD-001',
      movement_type: 'SALE',
      stock_bucket: 'AVAILABLE',
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
      sync_status: 'PENDING',
      server_accepted_at: null,
      original_transaction_id: null,
    });
    // Behave like the real cascade: "/" has no FTS tokens → 0 results, and the
    // backend never answers (the Rust command is deadlocked in production).
    vi.spyOn(tauriProductService, 'searchProductsFts5').mockImplementation(
      (query: string) =>
        new Promise<never>((_resolve, reject) => {
          if (query.includes('/')) {
            // never settles — mirrors the permanent Rust-side deadlock
            return;
          }
          reject(new Error('no results'));
        }) as unknown as ReturnType<typeof tauriProductService.searchProductsFts5>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Backspace deletes the no-result character and the field stays editable', async (): Promise<void> => {
    const { productCell } = await renderSale();

    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: '/' } });
    });

    // Panel shows the empty state (this is what the user sees before the hang)
    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
    expect(productCell.value).toBe('/');

    // Backspace must delete the character (the reported "can't delete")
    act(() => {
      pressBackspace(productCell);
    });
    expect(productCell.value).toBe('');

    // …and the field must accept new input afterwards
    act(() => {
      fireEvent.change(productCell, { target: { value: 'H' } });
    });
    expect(productCell.value).toBe('H');
    act(() => {
      fireEvent.change(productCell, { target: { value: 'Hisense' } });
    });
    await waitFor(() => {
      expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
    });
    expect(productCell.value).toBe('Hisense');
  });

  it('keeps backend search calls bounded for a burst of keystrokes', async (): Promise<void> => {
    const { productCell } = await renderSale();

    vi.useFakeTimers();

    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: 'h' } });
      fireEvent.change(productCell, { target: { value: 'hi' } });
      fireEvent.change(productCell, { target: { value: 'his' } });
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // One debounced FTS search + at most one (debounced) barcode probe.
    // Before the fix every keystroke fired an immediate IPC from the
    // undebounced onBarcodeScan effect → 3 + 1 = 4 calls.
    // eslint-disable-next-line no-console
    console.log(
      'CALLS',
      JSON.stringify(vi.mocked(tauriProductService.searchProductsFts5).mock.calls),
    );
    expect(searchCalls()).toBeLessThanOrEqual(2);
  });

  it('cancels the pending debounced search when the view unmounts', async (): Promise<void> => {
    const { productCell, unmount } = await renderSale();

    vi.useFakeTimers();

    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: '/' } });
    });
    const callsAfterChange = searchCalls();

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // The 100 ms debounce in SaleStockView.handleProductSearch must not fire
    // after the view is gone (it had no clearTimeout-on-unmount cleanup).
    expect(searchCalls()).toBe(callsAfterChange);
  });

  it('clearing the query cancels the pending backend search', async (): Promise<void> => {
    const { productCell } = await renderSale();

    vi.useFakeTimers();

    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: '/' } });
    });
    const callsAfterChange = searchCalls();

    act(() => {
      pressBackspace(productCell);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(productCell.value).toBe('');
    expect(searchCalls()).toBe(callsAfterChange);
    // Empty query restores the full list instead of the empty state
    expect(screen.getByTestId(`search-result-${MOCK_PRODUCT.id}`)).toBeInTheDocument();
  });
});
