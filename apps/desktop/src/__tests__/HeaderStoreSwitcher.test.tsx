import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '../components/Header';
import { Store } from '../types/store';

function renderHeader(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  const onSelectStore = props.onSelectStore ?? vi.fn();
  const stores = (props.stores ?? [
    { id: 'STORE-MAIN', name: 'Main Store', store_code: 'MAIN' },
    { id: 'STORE-BRANCH', name: 'Branch Store', store_code: 'BRANCH' },
  ]) as Store[];
  const activeStoreId = props.activeStoreId ?? 'STORE-MAIN';
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    onSelectStore,
    ...render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <Header stores={stores} activeStoreId={activeStoreId} onSelectStore={onSelectStore} />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('Header store switcher', () => {
  it('opens a styled dropdown with all stores', () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));

    const dropdown = screen.getByTestId('store-dropdown');
    expect(dropdown).toBeInTheDocument();
    expect(within(dropdown).getByText('Switch store')).toBeInTheDocument();
    expect(within(dropdown).getByTestId('store-option-STORE-MAIN')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(dropdown).getByTestId('store-option-STORE-BRANCH')).toBeInTheDocument();
    expect(screen.getByTestId('store-selector')).toHaveValue('STORE-MAIN');
  });

  it('selects another store and closes the dropdown', () => {
    const { onSelectStore } = renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    fireEvent.click(screen.getByTestId('store-option-STORE-BRANCH'));

    expect(onSelectStore).toHaveBeenCalledWith('STORE-BRANCH');
    expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
  });

  it('closes on Escape without changing the store', () => {
    const { onSelectStore } = renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    expect(screen.getByTestId('store-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
    expect(onSelectStore).not.toHaveBeenCalled();
    expect(screen.getByTestId('store-selector')).toHaveValue('STORE-MAIN');
  });

  it('closes when clicking outside', async () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    expect(screen.getByTestId('store-dropdown')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
    });
  });

  // ─── P1: keyboard navigation within the dropdown ──────────────────────────

  it('ArrowDown moves focus to the first store option', () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    expect(screen.getByTestId('store-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByTestId('store-option-STORE-MAIN')).toHaveFocus();
  });

  it('ArrowDown repeatedly walks through store options', () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByTestId('store-option-STORE-MAIN')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByTestId('store-option-STORE-BRANCH')).toHaveFocus();
  });

  it('ArrowUp wraps from the first option to the last', () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByTestId('store-option-STORE-MAIN')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(screen.getByTestId('store-option-STORE-BRANCH')).toHaveFocus();
  });

  it('Enter on a focused option selects it and closes the dropdown', () => {
    const { onSelectStore } = renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    const focused = screen.getByTestId('store-option-STORE-BRANCH');
    expect(focused).toHaveFocus();
    fireEvent.click(focused);

    expect(onSelectStore).toHaveBeenCalledWith('STORE-BRANCH');
    expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
  });

  it('Escape closes the store dropdown without selecting anything', () => {
    const { onSelectStore } = renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
    expect(onSelectStore).not.toHaveBeenCalled();
  });

  it('Escape only closes the open dropdown (no unrelated side effects)', () => {
    renderHeader();

    fireEvent.click(screen.getByTestId('store-tag-trigger'));
    expect(screen.getByTestId('store-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('store-dropdown')).not.toBeInTheDocument();
    // The store selector itself remains usable after closing.
    expect(screen.getByTestId('store-selector')).toHaveValue('STORE-MAIN');
  });
});
