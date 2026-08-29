import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductPicker } from '../components/ProductPicker';
import * as tauriProductService from '../services/tauriProductService';
import { Product } from '../types/product';

describe('Search-First Reusable ProductPicker (FR-PROD-003, Section 18)', () => {
  const mockProducts: Product[] = [
    {
      id: 'PROD-01',
      sku: 'ELEC-IPHONE15PRO',
      name: 'Apple iPhone 15 Pro',
      brand: 'Apple',
      model: 'A3102',
      category: 'Smartphones',
      unit: 'pcs',
      barcode: '195949012345',
      alternate_names: 'iPhone 15, Apple Phone',
      serial_tracking_enabled: true,
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
    {
      id: 'PROD-02',
      sku: 'ELEC-SAMSUNG-S24',
      name: 'Samsung Galaxy S24 Ultra',
      brand: 'Samsung',
      model: 'SM-S928B',
      category: 'Smartphones',
      unit: 'pcs',
      barcode: '880609501234',
      alternate_names: 'S24 Ultra',
      serial_tracking_enabled: true,
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tauriProductService, 'searchProducts').mockImplementation(async (q: string) => {
      const term = q.toLowerCase().trim();
      if (!term) return mockProducts;
      return mockProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.model && p.model.toLowerCase().includes(term)) ||
          (p.barcode && p.barcode.toLowerCase().includes(term)) ||
          (p.alternate_names && p.alternate_names.toLowerCase().includes(term)),
      );
    });
  });

  it('auto-focuses search input field upon mount (scanner input ready)', async () => {
    render(<ProductPicker onSelectProduct={vi.fn()} />);

    const input = screen.getByTestId('picker-search-input');
    expect(input).toHaveFocus();
  });

  it('performs live multi-field matching against name, SKU, model, barcode, and alternate names', async () => {
    render(<ProductPicker onSelectProduct={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('picker-item-PROD-01')).toBeInTheDocument();
      expect(screen.getByTestId('picker-item-PROD-02')).toBeInTheDocument();
    });

    const input = screen.getByTestId('picker-search-input');

    // Match by model
    fireEvent.change(input, { target: { value: 'A3102' } });
    await waitFor(() => {
      expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument();
      expect(screen.queryByText('Samsung Galaxy S24 Ultra')).not.toBeInTheDocument();
    });

    // Match by barcode
    fireEvent.change(input, { target: { value: '880609501234' } });
    await waitFor(() => {
      expect(screen.getByText('Samsung Galaxy S24 Ultra')).toBeInTheDocument();
      expect(screen.queryByText('Apple iPhone 15 Pro')).not.toBeInTheDocument();
    });

    // Match by alternate name / alias
    fireEvent.change(input, { target: { value: 'Apple Phone' } });
    await waitFor(() => {
      expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument();
      expect(screen.queryByText('Samsung Galaxy S24 Ultra')).not.toBeInTheDocument();
    });
  });

  it('supports keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', async () => {
    const onSelectSpy = vi.fn();
    const onCloseSpy = vi.fn();

    render(<ProductPicker onSelectProduct={onSelectSpy} onClose={onCloseSpy} />);

    await waitFor(() => {
      expect(screen.getByTestId('picker-item-PROD-01')).toBeInTheDocument();
    });

    const input = screen.getByTestId('picker-search-input');

    // Down Arrow to highlight second item
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const secondItem = screen.getByTestId('picker-item-PROD-02');
    expect(secondItem).toHaveClass('selected');

    // Up Arrow to highlight first item
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const firstItem = screen.getByTestId('picker-item-PROD-01');
    expect(firstItem).toHaveClass('selected');

    // Press Enter to select highlighted item
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectSpy).toHaveBeenCalledWith(mockProducts[0]);

    // Press Escape to dismiss picker
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCloseSpy).toHaveBeenCalled();
  });
});
