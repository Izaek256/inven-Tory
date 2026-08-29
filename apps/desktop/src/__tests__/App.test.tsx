import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import * as tauriStoreService from '../services/tauriStoreService';

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
    render(<App />);

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByText('INVENTORY Tory')).toBeInTheDocument();
    expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('pending-sync-badge')).toBeInTheDocument();
    expect(screen.getByTestId('pending-sync-count')).toHaveTextContent('0');

    await waitFor(() => {
      expect(screen.getByTestId('stores-table')).toBeInTheDocument();
    });
  });

  it('renders left sidebar navigation and switches views when clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('stores-table')).toBeInTheDocument();
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
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('stores-table')).toBeInTheDocument();
    });

    expect(screen.getByText('ALPHA')).toBeInTheDocument();
    expect(screen.getByText('Store Alpha (Main Flagship)')).toBeInTheDocument();
    expect(screen.getByText('BETA')).toBeInTheDocument();
    expect(screen.getByText('Store Beta (Downtown)')).toBeInTheDocument();
  });

  it('handles store loading errors gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(tauriStoreService, 'getStores').mockRejectedValueOnce(
      new Error('Failed to connect to SQLite database')
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed to connect to SQLite database/)).toBeInTheDocument();
  });
});
