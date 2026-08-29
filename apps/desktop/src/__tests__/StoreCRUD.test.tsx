import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardView } from '../views/DashboardView';
import * as tauriStoreService from '../services/tauriStoreService';
import { Store } from '../types/store';

describe('Store CRUD & Device Registration (FR-STORE-001–003)', () => {
  const initialStores: Store[] = [
    {
      id: 'STORE-ALPHA',
      code: 'ALPHA',
      name: 'Store Alpha (Main Flagship)',
      address: '100 Electronics Way',
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
    {
      id: 'STORE-BETA',
      code: 'BETA',
      name: 'Store Beta (Downtown)',
      address: '45 Market Street',
      is_active: true,
      created_at: '2026-08-29T10:00:00Z',
      updated_at: '2026-08-29T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders store list correctly', () => {
    render(
      <DashboardView stores={initialStores} loading={false} error={null} onRetry={vi.fn()} />,
    );

    expect(screen.getByText('ALPHA')).toBeInTheDocument();
    expect(screen.getByText('Store Alpha (Main Flagship)')).toBeInTheDocument();
    expect(screen.getByText('BETA')).toBeInTheDocument();
    expect(screen.getByText('Store Beta (Downtown)')).toBeInTheDocument();
  });

  it('opens store modal and successfully creates a new store', async () => {
    const onRetry = vi.fn();
    const createSpy = vi.spyOn(tauriStoreService, 'createStore').mockResolvedValue({
      id: 'STORE-GAMMA',
      code: 'GAMMA',
      name: 'Store Gamma',
      address: '888 Commerce Blvd',
      is_active: true,
      created_at: '2026-08-29T12:00:00Z',
      updated_at: '2026-08-29T12:00:00Z',
    });

    render(<DashboardView stores={initialStores} loading={false} error={null} onRetry={onRetry} />);

    // Click Add Store
    fireEvent.click(screen.getByTestId('add-store-btn'));
    expect(screen.getByTestId('store-modal')).toBeInTheDocument();
    expect(screen.getByText('Create New Store')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByTestId('store-code-input'), { target: { value: 'GAMMA' } });
    fireEvent.change(screen.getByTestId('store-name-input'), { target: { value: 'Store Gamma' } });
    fireEvent.change(screen.getByTestId('store-address-input'), {
      target: { value: '888 Commerce Blvd' },
    });

    // Submit form
    await act(async () => {
      fireEvent.click(screen.getByTestId('store-modal-submit'));
    });

    expect(createSpy).toHaveBeenCalledWith({
      code: 'GAMMA',
      name: 'Store Gamma',
      address: '888 Commerce Blvd',
    });
    expect(onRetry).toHaveBeenCalled();
  });

  it('rejects creating a store with a duplicate store code', async () => {
    vi.spyOn(tauriStoreService, 'createStore').mockRejectedValue(
      new Error("Store code 'ALPHA' already exists."),
    );

    render(<DashboardView stores={initialStores} loading={false} error={null} onRetry={vi.fn()} />);

    fireEvent.click(screen.getByTestId('add-store-btn'));
    fireEvent.change(screen.getByTestId('store-code-input'), { target: { value: 'ALPHA' } });
    fireEvent.change(screen.getByTestId('store-name-input'), { target: { value: 'Duplicate Alpha' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('store-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('store-modal-error')).toHaveTextContent(
        "Store code 'ALPHA' already exists.",
      );
    });
  });

  it('edits an existing store while code remains immutable (FR-STORE-002)', async () => {
    const onRetry = vi.fn();
    const updateSpy = vi.spyOn(tauriStoreService, 'updateStore').mockResolvedValue({
      ...initialStores[0],
      name: 'Store Alpha Renamed',
    });

    render(<DashboardView stores={initialStores} loading={false} error={null} onRetry={onRetry} />);

    // Click Edit button for Store Alpha
    fireEvent.click(screen.getByTestId('edit-store-btn-STORE-ALPHA'));
    expect(screen.getByTestId('store-modal')).toBeInTheDocument();
    expect(screen.getByText('Edit Store Location')).toBeInTheDocument();

    // Verify store code input is disabled (immutable)
    expect(screen.getByTestId('store-code-input')).toBeDisabled();

    // Modify store name
    fireEvent.change(screen.getByTestId('store-name-input'), {
      target: { value: 'Store Alpha Renamed' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('store-modal-submit'));
    });

    expect(updateSpy).toHaveBeenCalledWith({
      id: 'STORE-ALPHA',
      name: 'Store Alpha Renamed',
      address: '100 Electronics Way',
    });
    expect(onRetry).toHaveBeenCalled();
  });

  it('toggles store active state', async () => {
    const onRetry = vi.fn();
    const toggleSpy = vi.spyOn(tauriStoreService, 'toggleStoreActive').mockResolvedValue({
      ...initialStores[0],
      is_active: false,
    });

    render(<DashboardView stores={initialStores} loading={false} error={null} onRetry={onRetry} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('toggle-store-btn-STORE-ALPHA'));
    });

    expect(toggleSpy).toHaveBeenCalledWith('STORE-ALPHA', false);
    await waitFor(() => {
      expect(onRetry).toHaveBeenCalled();
    });
  });

  it('registers a device using the device stub (FR-STORE-003)', async () => {
    const registerSpy = vi.spyOn(tauriStoreService, 'registerDevice').mockResolvedValue({
      id: 'DEV-101',
      store_id: 'STORE-ALPHA',
      device_name: 'POS Terminal 1',
      is_active: true,
      registered_at: new Date().toISOString(),
    });

    render(<DashboardView stores={initialStores} loading={false} error={null} onRetry={vi.fn()} />);

    fireEvent.click(screen.getByTestId('register-device-btn-STORE-ALPHA'));
    expect(screen.getByTestId('device-modal')).toBeInTheDocument();
    expect(screen.getByText(/FR-STORE-003 Stub/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('device-name-input'), {
      target: { value: 'POS Terminal 1' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('device-modal-submit'));
    });

    expect(registerSpy).toHaveBeenCalledWith('STORE-ALPHA', 'POS Terminal 1');
  });

  it('disables modification buttons when user role is restricted', () => {
    render(
      <DashboardView
        stores={initialStores}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        userRole="CASHIER"
      />,
    );

    expect(screen.getByTestId('add-store-btn')).toBeDisabled();
    expect(screen.getByTestId('edit-store-btn-STORE-ALPHA')).toBeDisabled();
    expect(screen.getByTestId('toggle-store-btn-STORE-ALPHA')).toBeDisabled();
  });
});
