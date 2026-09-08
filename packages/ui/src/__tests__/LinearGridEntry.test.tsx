/**
 * LinearGridEntry — unit tests
 *
 * Tests the grid keyboard model in isolation:
 *   - Grid renders N empty rows by default
 *   - Enter on the last field commits the row and moves focus to the next row
 *   - Backspace on an empty field moves back to the previous field (value selected)
 *   - Arrow Up/Down changes the panel's highlighted index; does NOT change DOM focus
 *   - Clicking a panel item fills the product field and moves focus to the next field
 *   - Committed rows are disabled (cannot be edited via keyboard)
 */

import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearGridEntry } from '../components/LinearGridEntry';
import { GridFieldDef, GridRow } from '../hooks/useGridKeyboardFlow';
import { SearchResultItem } from '../components/LiveSearchPanel';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const FIELDS: GridFieldDef[] = [
  { id: 'product', type: 'text', label: 'Product', placeholder: 'Type product…' },
  { id: 'quantity', type: 'number', label: 'Qty', defaultValue: 1, min: 1 },
  { id: 'reference_number', type: 'text', label: 'Receipt No.', placeholder: 'Optional' },
];

const SAMPLE_ITEMS: SearchResultItem[] = [
  { id: 'P1', label: 'Apple', subtitle: 'APL-001', detail: 'Qty: 10' },
  { id: 'P2', label: 'Banana', subtitle: 'BAN-002', detail: 'Qty: 5' },
];

// ─── Controlled wrapper ────────────────────────────────────────────────────────

interface WrapperProps {
  onCommitRow?: (row: GridRow, idx: number) => void | Promise<void>;
  initialRowCount?: number;
  allItems?: SearchResultItem[];
}

function Wrapper({
  onCommitRow = vi.fn(),
  initialRowCount = 8,
  allItems = SAMPLE_ITEMS,
}: WrapperProps): React.ReactElement {
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const handleSearch = (query: string): void => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchResults(allItems.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())));
  };

  return (
    <LinearGridEntry
      fields={FIELDS}
      onCommitRow={onCommitRow}
      onSearch={handleSearch}
      onBarcodeScan={vi.fn()}
      searchResults={searchResults}
      allItems={allItems}
      initialRowCount={initialRowCount}
      dataTestid="grid"
    />
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('LinearGridEntry — keyboard model', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Render ────────────────────────────────────────────────────────────────

  it('renders the default number of empty rows', () => {
    render(<Wrapper initialRowCount={8} />);
    for (let i = 0; i < 8; i++) {
      expect(screen.getByTestId(`cell-${i}-product`)).toBeInTheDocument();
    }
  });

  it('renders correct column headers', () => {
    render(<Wrapper />);
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Receipt No.')).toBeInTheDocument();
  });

  it('right panel is rendered with all items on mount (no search query)', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('live-search-panel')).toBeInTheDocument();
    expect(screen.getByTestId('search-result-P1')).toBeInTheDocument();
    expect(screen.getByTestId('search-result-P2')).toBeInTheDocument();
  });

  // ── Panel selection ───────────────────────────────────────────────────────

  it('clicking a panel item fills the product field', async () => {
    render(<Wrapper />);

    const productCell = screen.getByTestId('cell-0-product');
    act(() => {
      fireEvent.focus(productCell);
    });

    act(() => {
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });

    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });
  });

  // ── Arrow keys stay in panel, not between rows ─────────────────────────────

  it('ArrowDown in product field highlights the first panel item (does not move to row 1)', async () => {
    render(<Wrapper />);

    const productCell0 = screen.getByTestId('cell-0-product') as HTMLInputElement;
    act(() => {
      productCell0.focus();
    });

    act(() => {
      fireEvent.keyDown(productCell0, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // DOM focus must remain on row 0's product cell
    expect(document.activeElement).toBe(productCell0);

    // Row 1's product cell must not be focused
    const productCell1 = screen.getByTestId('cell-1-product');
    expect(document.activeElement).not.toBe(productCell1);
  });

  it('ArrowUp in product field does not move DOM focus to another row', async () => {
    render(<Wrapper />);

    const productCell0 = screen.getByTestId('cell-0-product') as HTMLInputElement;
    act(() => {
      productCell0.focus();
    });

    // Press Down then Up
    act(() => {
      fireEvent.keyDown(productCell0, { key: 'ArrowDown', code: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(productCell0, { key: 'ArrowUp', code: 'ArrowUp' });
    });

    expect(document.activeElement).toBe(productCell0);
  });

  it('ArrowDown in Qty field does not move focus', async () => {
    render(<Wrapper />);

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
    });

    act(() => {
      fireEvent.keyDown(qtyCell, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Still focused on the same qty cell (not row 1)
    expect(document.activeElement).toBe(qtyCell);
    expect(document.activeElement).not.toBe(screen.getByTestId('cell-1-quantity'));
  });

  // ── Enter advances fields ─────────────────────────────────────────────────

  it('Enter in Qty field moves focus to Receipt No.', async () => {
    render(<Wrapper />);

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
    });

    act(() => {
      fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('cell-0-reference_number'));
    });
  });

  it('Enter in last field (Receipt No.) calls onCommitRow', async () => {
    const onCommitRow = vi.fn().mockResolvedValue(undefined);
    render(<Wrapper onCommitRow={onCommitRow} />);

    // Select a product first
    act(() => {
      fireEvent.focus(screen.getByTestId('cell-0-product'));
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });

    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });

    // Navigate to receipt field and commit
    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
      fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
    });

    const receiptCell = screen.getByTestId('cell-0-reference_number') as HTMLInputElement;
    await act(async () => {
      receiptCell.focus();
      fireEvent.keyDown(receiptCell, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(onCommitRow).toHaveBeenCalledOnce();
    });

    const [committedRow] = onCommitRow.mock.calls[0] as [GridRow, number];
    expect(committedRow.committed).toBe(true);
    expect(committedRow.values.product).toBe('Apple');
  });

  it('focus advances to row 1 after committing row 0', async () => {
    const onCommitRow = vi.fn().mockResolvedValue(undefined);
    render(<Wrapper onCommitRow={onCommitRow} />);

    act(() => {
      fireEvent.focus(screen.getByTestId('cell-0-product'));
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });

    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
      fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
    });

    const receiptCell = screen.getByTestId('cell-0-reference_number') as HTMLInputElement;
    await act(async () => {
      receiptCell.focus();
      fireEvent.keyDown(receiptCell, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(onCommitRow).toHaveBeenCalledOnce();
    });

    // After commit, focus should move to row 1's product cell
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('cell-1-product'));
    });
  });

  // ── Committed rows are locked ─────────────────────────────────────────────

  it('committed row inputs are disabled', async () => {
    const onCommitRow = vi.fn().mockResolvedValue(undefined);
    render(<Wrapper onCommitRow={onCommitRow} />);

    act(() => {
      fireEvent.focus(screen.getByTestId('cell-0-product'));
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });

    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
      fireEvent.keyDown(qtyCell, { key: 'Enter', code: 'Enter' });
    });

    const receiptCell = screen.getByTestId('cell-0-reference_number') as HTMLInputElement;
    await act(async () => {
      receiptCell.focus();
      fireEvent.keyDown(receiptCell, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(onCommitRow).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(screen.getByTestId('cell-0-product')).toBeDisabled();
      expect(screen.getByTestId('cell-0-quantity')).toBeDisabled();
      expect(screen.getByTestId('cell-0-reference_number')).toBeDisabled();
    });
  });

  // ── Backspace on empty field ──────────────────────────────────────────────

  it('Backspace on empty Qty moves focus back to Product', async () => {
    render(<Wrapper />);

    // Navigate to qty
    act(() => {
      fireEvent.focus(screen.getByTestId('cell-0-product'));
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });

    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
      // Clear the qty value so field is empty
      fireEvent.change(qtyCell, { target: { value: '' } });
      fireEvent.keyDown(qtyCell, { key: 'Backspace', code: 'Backspace' });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('cell-0-product'));
    });
  });

  it('Backspace on non-empty field does NOT navigate back', async () => {
    render(<Wrapper />);

    const qtyCell = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell.focus();
      // qty still has default value of 1
      fireEvent.keyDown(qtyCell, { key: 'Backspace', code: 'Backspace' });
    });

    // Focus should stay on qty (field was not empty)
    expect(document.activeElement).toBe(qtyCell);
  });

  // ── Auto-append row ───────────────────────────────────────────────────────

  it('appends a new row when the last visible row is committed', async () => {
    const onCommitRow = vi.fn().mockResolvedValue(undefined);
    render(<Wrapper onCommitRow={onCommitRow} initialRowCount={2} />);

    // Commit row 0
    act(() => {
      fireEvent.focus(screen.getByTestId('cell-0-product'));
      fireEvent.click(screen.getByTestId('search-result-P1'));
    });
    await waitFor(() => {
      expect((screen.getByTestId('cell-0-product') as HTMLInputElement).value).toBe('Apple');
    });

    const qtyCell0 = screen.getByTestId('cell-0-quantity') as HTMLInputElement;
    act(() => {
      qtyCell0.focus();
      fireEvent.keyDown(qtyCell0, { key: 'Enter', code: 'Enter' });
    });

    const receiptCell0 = screen.getByTestId('cell-0-reference_number') as HTMLInputElement;
    await act(async () => {
      receiptCell0.focus();
      fireEvent.keyDown(receiptCell0, { key: 'Enter', code: 'Enter' });
    });
    await waitFor(() => {
      expect(onCommitRow).toHaveBeenCalledTimes(1);
    });

    // Commit row 1
    act(() => {
      fireEvent.focus(screen.getByTestId('cell-1-product'));
      fireEvent.click(screen.getByTestId('search-result-P2'));
    });
    await waitFor(() => {
      expect((screen.getByTestId('cell-1-product') as HTMLInputElement).value).toBe('Banana');
    });

    const qtyCell1 = screen.getByTestId('cell-1-quantity') as HTMLInputElement;
    act(() => {
      qtyCell1.focus();
      fireEvent.keyDown(qtyCell1, { key: 'Enter', code: 'Enter' });
    });

    const receiptCell1 = screen.getByTestId('cell-1-reference_number') as HTMLInputElement;
    await act(async () => {
      receiptCell1.focus();
      fireEvent.keyDown(receiptCell1, { key: 'Enter', code: 'Enter' });
    });
    await waitFor(() => {
      expect(onCommitRow).toHaveBeenCalledTimes(2);
    });

    // Row 2 should have been auto-appended
    await waitFor(() => {
      expect(screen.getByTestId('cell-2-product')).toBeInTheDocument();
    });
  });
});
