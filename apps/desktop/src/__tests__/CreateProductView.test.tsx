/**
 * CreateProductView integration tests — Phase 1 Task B.
 *
 * Coverage:
 *   - Full row commit creates a product via createProduct() with stock = 0 (catalogue-only).
 *   - Committed row appears in the "Recently Created" table.
 *   - Required-field validation blocks commit for missing SKU and Product Name.
 *   - Duplicate SKU error is surfaced the same way as the current form behaviour.
 *   - All Tauri IPC is mocked at the service layer (same pattern as TransferStockView.test.tsx).
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateProductView } from '../views/CreateProductView';
import * as tauriProductService from '../services/tauriProductService';
import { Product } from '../types/product';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Product fixture (the type returned by createProduct). */
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'PROD-TEST-001',
    sku: 'TEST-SKU-001',
    name: 'Test Widget',
    category: 'General',
    unit: 'pcs',
    is_active: true,
    serial_tracking_enabled: false,
    barcode: null,
    alternate_names: null,
    brand: null,
    model: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Fill one grid row and commit it by pressing Enter on the last text field.
 * The grid uses LinearGridEntry: each field is a plain <input> (or <select>).
 * Tab/Enter advances to the next field; Enter on the last field commits.
 *
 * fieldTestIds in CreateProductView:
 *   sku → 'field-sku'
 *   name → 'field-name'
 *   brand → 'field-brand'
 *   model → 'field-model'
 *   category → 'field-category'   (select)
 *   unit → 'field-unit'           (select)
 *   barcode → 'field-barcode'
 *   alternate_names → 'field-alternate_names'  ← last field, Enter here commits
 *
 * Each field must be focused before being changed so that useGridKeyboardFlow
 * tracks the correct activeFieldIndex — commit only fires when Enter lands on
 * the last field (index 7).
 */
async function fillAndCommitRow(
  overrides: {
    sku?: string;
    name?: string;
    brand?: string;
    model?: string;
    category?: string;
    unit?: string;
    barcode?: string;
    alternate_names?: string;
  } = {},
): Promise<void> {
  const {
    sku = 'TEST-SKU-001',
    name = 'Test Widget',
    brand = '',
    model = '',
    category = 'General',
    unit = 'pcs',
    barcode = '',
    alternate_names = '',
  } = overrides;

  // Helper: focus + change an input element (updates hook's activeFieldIndex)
  function focusChange(el: HTMLElement, value: string): void {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
  }

  // Use getAllByTestId — grid renders 5 initial rows so [0] targets row 0.
  const skuFields = screen.getAllByTestId('field-sku');
  act((): void => {
    focusChange(skuFields[0], sku);
  });

  const nameFields = screen.getAllByTestId('field-name');
  act((): void => {
    focusChange(nameFields[0], name);
  });

  const brandFields = screen.getAllByTestId('field-brand');
  act((): void => {
    focusChange(brandFields[0], brand);
  });

  const modelFields = screen.getAllByTestId('field-model');
  act((): void => {
    focusChange(modelFields[0], model);
  });

  const categoryFields = screen.getAllByTestId('field-category');
  act((): void => {
    focusChange(categoryFields[0], category);
  });

  const unitFields = screen.getAllByTestId('field-unit');
  act((): void => {
    focusChange(unitFields[0], unit);
  });

  const barcodeFields = screen.getAllByTestId('field-barcode');
  act((): void => {
    focusChange(barcodeFields[0], barcode);
  });

  const altNameFields = screen.getAllByTestId('field-alternate_names');
  act((): void => {
    focusChange(altNameFields[0], alternate_names);
  });

  // Press Enter on the last field (alternate_names) to trigger commit.
  // At this point activeFieldIndex = 7 (last), so the grid's handleKeyDown
  // calls commitRow which fires onCommitRow → handleCommit.
  act((): void => {
    fireEvent.keyDown(altNameFields[0], { key: 'Enter' });
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('CreateProductView — Phase 1 Task B', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    // Polyfill Tauri environment detection used by service layer
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // Basic render
  // -------------------------------------------------------------------------

  it('renders the create-product view with the grid and empty recently-created table', (): void => {
    render(<CreateProductView />);
    expect(screen.getByTestId('create-product-view')).toBeInTheDocument();
    expect(screen.getByTestId('create-product-grid')).toBeInTheDocument();
    expect(screen.getByTestId('recently-created-table')).toBeInTheDocument();
    // Table should be empty on first render
    expect(screen.getByTestId('recently-created-table')).toHaveTextContent(
      'No products created yet',
    );
  });

  // -------------------------------------------------------------------------
  // Full row commit — product created with stock = 0 (catalogue-only)
  // -------------------------------------------------------------------------

  it('full row commit calls createProduct with the correct input and stock is not included (catalogue-only)', async (): Promise<void> => {
    const createSpy = vi
      .spyOn(tauriProductService, 'createProduct')
      .mockResolvedValueOnce(makeProduct());

    render(<CreateProductView />);

    await fillAndCommitRow({
      sku: 'WIDGET-001',
      name: 'Test Widget',
      brand: 'Acme',
      model: 'W1',
      category: 'General',
      unit: 'pcs',
      barcode: '1234567890',
      alternate_names: 'TW, Widget',
    });

    await waitFor((): void => {
      expect(createSpy).toHaveBeenCalledOnce();
    });

    const callArg = createSpy.mock.calls[0][0];
    expect(callArg.sku).toBe('WIDGET-001');
    expect(callArg.name).toBe('Test Widget');
    expect(callArg.brand).toBe('Acme');
    expect(callArg.model).toBe('W1');
    expect(callArg.category).toBe('General');
    expect(callArg.unit).toBe('pcs');
    expect(callArg.barcode).toBe('1234567890');
    expect(callArg.alternate_names).toBe('TW, Widget');
    // Stock / quantity fields must NOT be sent — this is catalogue-only
    expect(callArg).not.toHaveProperty('quantity');
    expect(callArg).not.toHaveProperty('stock');
    expect(callArg.is_active).toBe(true);
    expect(callArg.serial_tracking_enabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Committed row appears in "Recently Created" table
  // -------------------------------------------------------------------------

  it('committed row appears in the Recently Created table after successful commit', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockResolvedValueOnce(
      makeProduct({ sku: 'WIDGET-002', name: 'Super Widget', category: 'Accessories' }),
    );

    render(<CreateProductView />);

    await fillAndCommitRow({
      sku: 'WIDGET-002',
      name: 'Super Widget',
      category: 'Accessories',
    });

    await waitFor((): void => {
      expect(screen.getByTestId('recently-created-table')).toHaveTextContent('Super Widget');
    });

    expect(screen.getByTestId('recently-created-table')).toHaveTextContent('WIDGET-002');
    expect(screen.getByTestId('recently-created-table')).toHaveTextContent('Accessories');
  });

  // -------------------------------------------------------------------------
  // Required-field validation — SKU missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when SKU is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    // Fill all fields except SKU
    await fillAndCommitRow({ sku: '', name: 'No SKU Product', category: 'General', unit: 'pcs' });

    // createProduct must NOT have been called
    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(/sku is required/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Required-field validation — Product Name missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when Product Name is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    await fillAndCommitRow({ sku: 'NONAME-001', name: '', category: 'General', unit: 'pcs' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /product name is required/i,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Required-field validation — Category missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when Category is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    await fillAndCommitRow({ sku: 'NOCAT-001', name: 'No Category Product', category: '' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(/category is required/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Duplicate SKU — service error surfaces in the UI
  // -------------------------------------------------------------------------

  it('surfaces duplicate-SKU error from the service in the error banner', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockRejectedValueOnce(
      new Error('UNIQUE constraint failed: products.sku'),
    );

    render(<CreateProductView />);

    await fillAndCommitRow({
      sku: 'DUPE-SKU-001',
      name: 'Duplicate Product',
      category: 'General',
      unit: 'pcs',
    });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /UNIQUE constraint failed/i,
    );
  });

  // -------------------------------------------------------------------------
  // Success banner cleared after next valid commit
  // -------------------------------------------------------------------------

  it('shows success banner after commit and clears error state', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockResolvedValueOnce(makeProduct());

    render(<CreateProductView />);

    await fillAndCommitRow({ sku: 'OK-001', name: 'Good Product', category: 'General' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-success')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('create-product-error')).not.toBeInTheDocument();
  });
});
