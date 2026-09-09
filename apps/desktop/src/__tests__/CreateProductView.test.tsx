/**
 * CreateProductView integration tests — Phase 1 Task B.
 *
 * Field order (7 columns, no separate SKU field — model IS the SKU):
 *   name → brand → model (= SKU) → category → unit → barcode → alternate_names
 *
 * Coverage:
 *   - Full row commit creates a product via createProduct(); model becomes SKU.
 *   - SKU sent to service is model.toUpperCase() with no prefix.
 *   - Stock = 0 (catalogue-only — no quantity field in the grid).
 *   - Committed row appears in the "Recently Created" table.
 *   - Required-field validation blocks commit for missing Name, Model, Category.
 *   - Duplicate SKU/model error is surfaced in the error banner.
 *   - All Tauri IPC is mocked at the service layer.
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
    sku: 'W1',
    name: 'Test Widget',
    category: 'General',
    unit: 'pcs',
    is_active: true,
    serial_tracking_enabled: false,
    barcode: null,
    alternate_names: null,
    brand: null,
    model: 'W1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Fill one grid row and commit it by pressing Enter on the last field.
 *
 * Field order matches CreateProductView (7 fields, indices 0–6):
 *   0 name  1 brand  2 model  3 category  4 unit  5 barcode  6 alternate_names
 *
 * Each field is focused before change so useGridKeyboardFlow tracks
 * activeFieldIndex correctly — commit only fires when Enter lands on index 6.
 */
async function fillAndCommitRow(
  overrides: {
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
    name = 'Test Widget',
    brand = '',
    model = 'W1',
    category = 'General',
    unit = 'pcs',
    barcode = '',
    alternate_names = '',
  } = overrides;

  function focusChange(el: HTMLElement, value: string): void {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
  }

  // getAllByTestId — grid renders 5 initial rows, [0] = row 0.
  act((): void => {
    focusChange(screen.getAllByTestId('field-name')[0], name);
  });
  act((): void => {
    focusChange(screen.getAllByTestId('field-brand')[0], brand);
  });
  act((): void => {
    focusChange(screen.getAllByTestId('field-model')[0], model);
  });
  act((): void => {
    focusChange(screen.getAllByTestId('field-category')[0], category);
  });
  act((): void => {
    focusChange(screen.getAllByTestId('field-unit')[0], unit);
  });
  act((): void => {
    focusChange(screen.getAllByTestId('field-barcode')[0], barcode);
  });

  const altFields = screen.getAllByTestId('field-alternate_names');
  act((): void => {
    focusChange(altFields[0], alternate_names);
  });

  // Enter on the last field (alternate_names, index 6) triggers commitRow.
  act((): void => {
    fireEvent.keyDown(altFields[0], { key: 'Enter' });
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('CreateProductView — Phase 1 Task B', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // Basic render
  // -------------------------------------------------------------------------

  it('renders the create-product view with grid and empty recently-created table', (): void => {
    render(<CreateProductView />);
    expect(screen.getByTestId('create-product-view')).toBeInTheDocument();
    expect(screen.getByTestId('create-product-grid')).toBeInTheDocument();
    expect(screen.getByTestId('recently-created-table')).toBeInTheDocument();
    expect(screen.getByTestId('recently-created-table')).toHaveTextContent(
      'No products created yet',
    );
  });

  it('no separate SKU column — model field is used as the SKU input', (): void => {
    render(<CreateProductView />);
    // model field present
    expect(screen.getAllByTestId('field-model')[0]).toBeInTheDocument();
    // no dedicated SKU input
    expect(screen.queryByTestId('field-sku')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Full row commit — model becomes SKU, no stock field
  // -------------------------------------------------------------------------

  it('full row commit: model becomes SKU (uppercased, no prefix), stock not included', async (): Promise<void> => {
    const createSpy = vi
      .spyOn(tauriProductService, 'createProduct')
      .mockResolvedValueOnce(makeProduct());

    render(<CreateProductView />);

    await fillAndCommitRow({
      name: 'Test Widget',
      brand: 'Acme',
      model: 'w1-pro',
      category: 'General',
      unit: 'pcs',
      barcode: '1234567890',
      alternate_names: 'TW, Widget',
    });

    await waitFor((): void => {
      expect(createSpy).toHaveBeenCalledOnce();
    });

    const arg = createSpy.mock.calls[0][0];
    // Model value uppercased becomes the SKU — no prefix added
    expect(arg.sku).toBe('W1-PRO');
    expect(arg.name).toBe('Test Widget');
    expect(arg.brand).toBe('Acme');
    expect(arg.model).toBe('w1-pro');
    expect(arg.category).toBe('General');
    expect(arg.unit).toBe('pcs');
    expect(arg.barcode).toBe('1234567890');
    expect(arg.alternate_names).toBe('TW, Widget');
    // Catalogue-only: no stock quantity sent
    expect(arg).not.toHaveProperty('quantity');
    expect(arg).not.toHaveProperty('stock');
    expect(arg.is_active).toBe(true);
    expect(arg.serial_tracking_enabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Committed row appears in "Recently Created" table
  // -------------------------------------------------------------------------

  it('committed row appears in the Recently Created table', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockResolvedValueOnce(
      makeProduct({ sku: 'SUPERWIDGET', name: 'Super Widget', category: 'Accessories' }),
    );

    render(<CreateProductView />);

    await fillAndCommitRow({ name: 'Super Widget', model: 'SUPERWIDGET', category: 'Accessories' });

    await waitFor((): void => {
      expect(screen.getByTestId('recently-created-table')).toHaveTextContent('Super Widget');
    });

    expect(screen.getByTestId('recently-created-table')).toHaveTextContent('SUPERWIDGET');
    expect(screen.getByTestId('recently-created-table')).toHaveTextContent('Accessories');
  });

  // -------------------------------------------------------------------------
  // Required-field validation — Product Name missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when Product Name is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    await fillAndCommitRow({ name: '', model: 'NONAME-MODEL', category: 'General' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /product name is required/i,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Required-field validation — Model (SKU) missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when Model (SKU) is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    await fillAndCommitRow({ name: 'No Model Product', model: '', category: 'General' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /model number is required/i,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Required-field validation — Category missing
  // -------------------------------------------------------------------------

  it('blocks commit and shows error when Category is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');

    render(<CreateProductView />);

    await fillAndCommitRow({ name: 'No Category Product', model: 'NOCAT-001', category: '' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(/category is required/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Duplicate model/SKU — service error surfaces in the UI
  // -------------------------------------------------------------------------

  it('surfaces duplicate model/SKU error from the service in the error banner', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockRejectedValueOnce(
      new Error('UNIQUE constraint failed: products.sku'),
    );

    render(<CreateProductView />);

    await fillAndCommitRow({ name: 'Duplicate Product', model: 'DUPE-MODEL', category: 'General' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /UNIQUE constraint failed/i,
    );
  });

  // -------------------------------------------------------------------------
  // Success banner
  // -------------------------------------------------------------------------

  it('shows success banner after a clean commit', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockResolvedValueOnce(makeProduct());

    render(<CreateProductView />);

    await fillAndCommitRow({ name: 'Good Product', model: 'GOOD-001', category: 'General' });

    await waitFor((): void => {
      expect(screen.getByTestId('create-product-success')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('create-product-error')).not.toBeInTheDocument();
  });
});
