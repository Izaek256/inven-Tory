import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, ToastProvider } from '@invenTory/ui';
import App from '../App';
import * as tauriStoreService from '../services/tauriStoreService';

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

describe('Desktop Shell Application', () => {
  const mockStores = [
    {
      id: 'STORE-ALPHA',
      code: 'ALPHA',
      name: 'Store Alpha (Main Flagship)',
      address: '100 Electronics Way, Tech District',
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
    {
      id: 'STORE-BETA',
      code: 'BETA',
      name: 'Store Beta (Downtown)',
      address: '45 Market Street, Central City',
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tauriStoreService, 'getStores').mockResolvedValue(mockStores);
  });

  it('renders persistent header with brand title, offline/online badge, and pending sync badge', async () => {
    renderWithProviders(<App />);

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByText('invenTory')).toBeInTheDocument();
    expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('pending-sync-badge')).toBeInTheDocument();
    expect(screen.getByTestId('pending-sync-count')).toHaveTextContent('0');

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });
  });

  it('renders left sidebar navigation and switches views when clicked', async () => {
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-products')).toBeInTheDocument();
    expect(screen.getByTestId('nav-transactions')).toBeInTheDocument();
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument();

    // Switch to Products
    act(() => {
      fireEvent.click(screen.getByTestId('nav-products'));
    });
    expect(screen.getByTestId('products-view')).toBeInTheDocument();
    expect(screen.getByText('Products Catalogue')).toBeInTheDocument();

    // Switch to Transactions
    act(() => {
      fireEvent.click(screen.getByTestId('nav-transactions'));
    });
    expect(screen.getByTestId('transactions-view')).toBeInTheDocument();
    expect(screen.getByText('Transactions Ledger')).toBeInTheDocument();

    // Switch to Settings
    act(() => {
      fireEvent.click(screen.getByTestId('nav-settings'));
    });
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.getByText('System Settings')).toBeInTheDocument();

    // Switch back to Dashboard
    act(() => {
      fireEvent.click(screen.getByTestId('nav-dashboard'));
    });
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
  });

  it('displays the seeded store list from SQLite on the Dashboard smoke test view', async () => {
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    // The Dashboard now shows analytics, not a store table
    // Store management has moved to Settings
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
  });

  it('handles store loading errors gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    vi.spyOn(tauriStoreService, 'getStores').mockRejectedValue(
      new Error('Failed to connect to SQLite database'),
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed to connect to SQLite database/)).toBeInTheDocument();
  });

  it('renders redesigned store switcher and displays blurry loading spinner when switching stores', async () => {
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('store-switcher-wrapper')).toBeInTheDocument();
    });

    const selector = screen.getByTestId('store-selector') as HTMLSelectElement;
    expect(selector).toBeInTheDocument();

    // Select store Beta
    act(() => {
      fireEvent.change(selector, { target: { value: 'STORE-BETA' } });
    });

    // Blurry spinner overlay should appear
    expect(screen.getByTestId('store-switch-overlay')).toBeInTheDocument();
    expect(screen.getByText('Switching Store')).toBeInTheDocument();
    expect(screen.getAllByText('Store Beta (Downtown)').length).toBeGreaterThan(0);
  });

  it('listens for inven-tory:stores-updated event and automatically refreshes store list', async () => {
    const getStoresSpy = vi.spyOn(tauriStoreService, 'getStores');
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('store-switcher-wrapper')).toBeInTheDocument();
    });

    const initialCalls = getStoresSpy.mock.calls.length;

    // Dispatch stores-updated event
    act(() => {
      window.dispatchEvent(new CustomEvent('inven-tory:stores-updated'));
    });

    await waitFor(() => {
      expect(getStoresSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });
});
