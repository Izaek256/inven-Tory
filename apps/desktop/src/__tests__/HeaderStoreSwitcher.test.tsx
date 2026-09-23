import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '@invenTory/ui';
import { Header } from '../components/Header';
import { Store } from '../types/store';

function renderHeader(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  const onSelectStore = props.onSelectStore ?? vi.fn();
  const stores = (props.stores ?? [
    { id: 'STORE-MAIN', name: 'Main Store', store_code: 'MAIN' },
    { id: 'STORE-BRANCH', name: 'Branch Store', store_code: 'BRANCH' },
  ]) as Store[];
  const activeStoreId = props.activeStoreId ?? 'STORE-MAIN';

  return {
    onSelectStore,
    ...render(
      <ThemeProvider>
        <Header stores={stores} activeStoreId={activeStoreId} onSelectStore={onSelectStore} />
      </ThemeProvider>,
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
});
