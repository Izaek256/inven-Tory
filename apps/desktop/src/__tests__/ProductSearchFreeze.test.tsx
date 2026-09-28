/**
 * Issue #7 — product search field freeze after a no-result search.
 *
 * GUI repro: on Sale Stock, type "/" into the product field → the side panel
 * shows "No results found" → Backspace cannot delete the character and the
 * window hangs permanently (force-kill required). Same path on Receive Stock
 * and Physical Count (shared LinearGridEntry / useGridKeyboardFlow).
 *
 * The permanent hang itself was a Rust-side self-deadlock (now fixed on this
 * branch — search_products_fts5 fell through to search_products while still
 * holding the process-wide DB mutex, which std::sync::Mutex does not allow
 * from the same thread) plus the slow-keystroke path fixed alongside it:
 * search commands off the main thread, ensure_products_fts once at startup,
 * LIKE-only fallback that never re-locks or re-runs FTS. The Rust side is
 * covered by the seeded mpsc::recv_timeout regression test in lib.rs; jsdom
 * cannot reproduce the hang itself.
 *
 * These tests pin down the *frontend* contributions reported alongside the
 * hang:
 *   1. the product field must stay editable through a no-result search +
 *      Backspace (type → 0 results → Backspace → type again),
 *   2. a burst of keystrokes must not fan out into one backend IPC per
 *      keystroke (debounced search in useGridKeyboardFlow + the local-hit
 *      fast path in the view that skips the backend entirely),
 *   3. the pending debounced search must be cancelled when the view unmounts,
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
    console.log(
      'CALLS',
      JSON.stringify(vi.mocked(tauriProductService.searchProductsFts5).mock.calls),
    );
    expect(searchCalls()).toBeLessThanOrEqual(2);
  });

  it('burst of bad characters + Backspace keeps the field editable with bounded backend calls', async (): Promise<void> => {
    const { productCell } = await renderSale();

    vi.useFakeTimers();

    // A fast typist mashes characters that match nothing ("/zzz" — punctuation
    // strips to 0 FTS5 tokens, the rest miss entirely), then corrects with
    // Backspace and keeps typing. Every intermediate query is a local miss,
    // so each burst is debounced to a single backend round-trip — never one
    // IPC per keystroke.
    act(() => {
      fireEvent.focus(productCell);
      fireEvent.change(productCell, { target: { value: '/' } });
      fireEvent.change(productCell, { target: { value: '/z' } });
      fireEvent.change(productCell, { target: { value: '/zz' } });
      fireEvent.change(productCell, { target: { value: '/zzz' } });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(productCell.value).toBe('/zzz');

    // Backspace must delete characters (the reported "can't delete" symptom)
    act(() => {
      pressBackspace(productCell);
    });
    act(() => {
      pressBackspace(productCell);
    });
    expect(productCell.value).toBe('/z');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // …and the field keeps accepting new input afterwards
    act(() => {
      fireEvent.change(productCell, { target: { value: '/zq' } });
    });
    expect(productCell.value).toBe('/zq');
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Bounded: one debounced call per burst (3 bursts), not per keystroke.
    // Before the fixes every keystroke fired an immediate IPC → 4 + 2 + 1 = 7.
    expect(searchCalls()).toBeLessThanOrEqual(3);
    expect(productCell.value).toBe('/zq');
    expect(productCell).not.toBeDisabled();
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
