import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsView } from '../views/ProductsView';
import * as tauriProductService from '../services/tauriProductService';
import { Product } from '../types/product';

describe('Product CRUD & Master Catalog (FR-PROD-001–002)', () => {
  const initialProducts: Product[] = [
    {
      id: 'PROD-01',
      sku: 'ELEC-IPHONE15PRO',
      name: 'Apple iPhone 15 Pro 256GB',
      brand: 'Apple',
      model: 'A3102',
      category: 'Smartphones',
      unit: 'pcs',
      barcode: '195949012345',
      alternate_names: 'iPhone 15 Pro',
      serial_tracking_enabled: true,
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
    {
      id: 'PROD-02',
      sku: 'ELEC-SONY-XM5',
      name: 'Sony WH-1000XM5 Headphones',
      brand: 'Sony',
      model: 'XM5',
      category: 'Audio',
      unit: 'pcs',
      barcode: '027242922112',
      alternate_names: 'Sony XM5',
      serial_tracking_enabled: false,
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tauriProductService, 'getProducts').mockResolvedValue(initialProducts);
  });

  it('renders products catalogue and table', async () => {
    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    expect(screen.getByText('ELEC-IPHONE15PRO')).toBeInTheDocument();
    expect(screen.getByText('Apple iPhone 15 Pro 256GB')).toBeInTheDocument();
    expect(screen.getByText('ELEC-SONY-XM5')).toBeInTheDocument();
    expect(screen.getByText('Sony WH-1000XM5 Headphones')).toBeInTheDocument();
  });

  it('filters products by live search query', async () => {
    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('product-search-input'), {
      target: { value: 'iPhone' },
    });

    expect(screen.getByText('Apple iPhone 15 Pro 256GB')).toBeInTheDocument();
    expect(screen.queryByText('Sony WH-1000XM5 Headphones')).not.toBeInTheDocument();
  });

  it('opens modal and creates new product with v1.0.0 fields only', async () => {
    const createSpy = vi.spyOn(tauriProductService, 'createProduct').mockResolvedValue({
      id: 'PROD-03',
      sku: 'ELEC-SAMSUNG-S24',
      name: 'Samsung Galaxy S24',
      brand: 'Samsung',
      model: 'S928B',
      category: 'Smartphones',
      unit: 'pcs',
      barcode: '880609501234',
      alternate_names: 'S24',
      serial_tracking_enabled: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-btn'));
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('product-sku-input'), {
      target: { value: 'ELEC-SAMSUNG-S24' },
    });
    fireEvent.change(screen.getByTestId('product-name-input'), {
      target: { value: 'Samsung Galaxy S24' },
    });
    fireEvent.change(screen.getByTestId('product-brand-input'), {
      target: { value: 'Samsung' },
    });
    fireEvent.change(screen.getByTestId('product-model-input'), {
      target: { value: 'S928B' },
    });
    fireEvent.change(screen.getByTestId('product-category-input'), {
      target: { value: 'Smartphones' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('product-modal-submit'));
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'ELEC-SAMSUNG-S24',
        name: 'Samsung Galaxy S24',
        brand: 'Samsung',
        model: 'S928B',
        category: 'Smartphones',
      }),
    );
  });

  it('rejects creating a product with duplicate SKU', async () => {
    vi.spyOn(tauriProductService, 'createProduct').mockRejectedValue(
      new Error("Product SKU 'ELEC-IPHONE15PRO' already exists."),
    );

    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-product-btn'));
    fireEvent.change(screen.getByTestId('product-sku-input'), {
      target: { value: 'ELEC-IPHONE15PRO' },
    });
    fireEvent.change(screen.getByTestId('product-name-input'), {
      target: { value: 'Duplicate iPhone' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('product-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('product-modal-error')).toHaveTextContent(
        "Product SKU 'ELEC-IPHONE15PRO' already exists.",
      );
    });
  });

  it('edits an existing product with immutable SKU', async () => {
    const updateSpy = vi.spyOn(tauriProductService, 'updateProduct').mockResolvedValue({
      ...initialProducts[0],
      name: 'Apple iPhone 15 Pro 512GB',
    });

    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-product-btn-PROD-01'));
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();

    // Verify SKU input is disabled
    expect(screen.getByTestId('product-sku-input')).toBeDisabled();

    fireEvent.change(screen.getByTestId('product-name-input'), {
      target: { value: 'Apple iPhone 15 Pro 512GB' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('product-modal-submit'));
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'PROD-01',
        name: 'Apple iPhone 15 Pro 512GB',
      }),
    );
  });

  it('toggles product active state', async () => {
    const toggleSpy = vi.spyOn(tauriProductService, 'toggleProductActive').mockResolvedValue({
      ...initialProducts[0],
      is_active: false,
    });

    render(<ProductsView />);

    await waitFor(() => {
      expect(screen.getByTestId('products-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-product-btn-PROD-01'));

    expect(toggleSpy).toHaveBeenCalledWith('PROD-01', false);
  });
});
