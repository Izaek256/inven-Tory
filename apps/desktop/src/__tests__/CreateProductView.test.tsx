/**
 * CreateProductView integration tests — Phase 1 Task B.
 *
 * Field order (5 columns — no category, no unit in grid):
 *   name → brand → model (= SKU) → barcode → alternate_names
 *
 * Category defaults to 'General', unit defaults to 'pcs' at commit time.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateProductView } from '../views/CreateProductView';
import * as tauriProductService from '../services/tauriProductService';
import { Product } from '../types/product';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Fill a grid row (5 fields: name, brand, model, barcode, alternate_names)
 * and commit by pressing Enter on the last field.
 * Each field is focused before change so activeFieldIndex is tracked correctly.
 */
async function fillAndCommitRow(
  overrides: {
    name?: string;
    brand?: string;
    model?: string;
    barcode?: string;
    alternate_names?: string;
  } = {},
): Promise<void> {
  const {
    name = 'Test Widget',
    brand = '',
    model = 'W1',
    barcode = '',
    alternate_names = '',
  } = overrides;

  function focusChange(el: HTMLElement, value: string): void {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
  }

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
    focusChange(screen.getAllByTestId('field-barcode')[0], barcode);
  });

  const altFields = screen.getAllByTestId('field-alternate_names');
  act((): void => {
    focusChange(altFields[0], alternate_names);
  });

  // Enter on the last field (alternate_names, index 4) triggers commitRow.
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

  it('no separate SKU column and no category/unit columns in grid', (): void => {
    render(<CreateProductView />);
    expect(screen.getAllByTestId('field-model')[0]).toBeInTheDocument();
    expect(screen.queryByTestId('field-sku')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-category')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-unit')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Full row commit — model becomes SKU, category/unit defaulted
  // -------------------------------------------------------------------------

  it('full row commit: model uppercased becomes SKU, category=General, unit=pcs', async (): Promise<void> => {
    const createSpy = vi
      .spyOn(tauriProductService, 'createProduct')
      .mockResolvedValueOnce(makeProduct());

    render(<CreateProductView />);

    await fillAndCommitRow({
      name: 'Test Widget',
      brand: 'Acme',
      model: 'w1-pro',
      barcode: '1234567890',
      alternate_names: 'TW',
    });

    await waitFor((): void => {
      expect(createSpy).toHaveBeenCalledOnce();
    });

    const arg = createSpy.mock.calls[0][0];
    expect(arg.sku).toBe('W1-PRO');
    expect(arg.name).toBe('Test Widget');
    expect(arg.brand).toBe('Acme');
    expect(arg.model).toBe('w1-pro');
    expect(arg.category).toBe('General');
    expect(arg.unit).toBe('pcs');
    expect(arg.barcode).toBe('1234567890');
    expect(arg).not.toHaveProperty('quantity');
    expect(arg).not.toHaveProperty('stock');
    expect(arg.is_active).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Committed row in "Recently Created" table
  // -------------------------------------------------------------------------

  it('committed row appears in the Recently Created table', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockResolvedValueOnce(
      makeProduct({ sku: 'SUPERWIDGET', name: 'Super Widget', category: 'Accessories' }),
    );

    render(<CreateProductView />);
    await fillAndCommitRow({ name: 'Super Widget', model: 'SUPERWIDGET' });

    await waitFor((): void => {
      expect(screen.getByTestId('recently-created-table')).toHaveTextContent('Super Widget');
    });
    expect(screen.getByTestId('recently-created-table')).toHaveTextContent('SUPERWIDGET');
  });

  // -------------------------------------------------------------------------
  // Required-field validation
  // -------------------------------------------------------------------------

  it('blocks commit when Product Name is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');
    render(<CreateProductView />);
    await fillAndCommitRow({ name: '', model: 'NONAME-MODEL' });
    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /product name is required/i,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('blocks commit when Model (SKU) is missing', async (): Promise<void> => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct');
    render(<CreateProductView />);
    await fillAndCommitRow({ name: 'No Model', model: '' });
    await waitFor((): void => {
      expect(screen.getByTestId('create-product-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-product-error')).toHaveTextContent(
      /model number is required/i,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Duplicate model/SKU
  // -------------------------------------------------------------------------

  it('surfaces duplicate SKU error from the service', async (): Promise<void> => {
    vi.spyOn(tauriProductService, 'createProduct').mockRejectedValueOnce(
      new Error('UNIQUE constraint failed: products.sku'),
    );
    render(<CreateProductView />);
    await fillAndCommitRow({ name: 'Duplicate', model: 'DUPE-001' });
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
    await fillAndCommitRow({ name: 'Good Product', model: 'GOOD-001' });
    await waitFor((): void => {
      expect(screen.getByTestId('create-product-success')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('create-product-error')).not.toBeInTheDocument();
  });
});
