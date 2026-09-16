/**
 * GenesisWizard component tests
 *
 * Tests the enhanced GenesisWizard with setup path selection
 * (Fresh Setup vs Restore from Server) functionality.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenesisWizard } from '../views/GenesisWizard';
import type { GenesisState } from '../hooks/useGenesisState';

describe('GenesisWizard — Setup Path Selection', () => {
  const mockGenesisState: GenesisState = {
    ready: false,
    has_user_with_pin: false,
    has_any_store: false,
    has_tables: false,
  };

  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnRun = vi.fn();
  const mockOnValidateRestore = vi.fn();
  const mockOnStartRestore = vi.fn();

  it('shows setup path selection on initial render', () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    expect(screen.getByText('Choose Setup Path')).toBeInTheDocument();
    expect(screen.getByText('First-time Setup')).toBeInTheDocument();
    expect(screen.getByText('Restore from Server')).toBeInTheDocument();
  });

  it('navigates to fresh setup when First-time Setup is clicked', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const freshSetupButton = screen.getByText('First-time Setup');
    fireEvent.click(freshSetupButton);

    await waitFor(() => {
      expect(screen.getByText('Your Account')).toBeInTheDocument();
    });
  });

  it('navigates to restore mode when Restore from Server is clicked', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });
  });

  it('calls onCancel when Cancel is clicked in selection mode', () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });
});

describe('GenesisWizard — Fresh Setup Mode', () => {
  const mockGenesisState: GenesisState = {
    ready: false,
    has_user_with_pin: false,
    has_any_store: false,
    has_tables: false,
  };

  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnRun = vi.fn();
  const mockOnValidateRestore = vi.fn();
  const mockOnStartRestore = vi.fn();

  it('renders account setup step correctly', () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    // Navigate to fresh setup
    const freshSetupButton = screen.getByText('First-time Setup');
    fireEvent.click(freshSetupButton);

    expect(screen.getByText('Your Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('validates account form inputs', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const freshSetupButton = screen.getByText('First-time Setup');
    fireEvent.click(freshSetupButton);

    // Try to proceed without filling form
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should stay on same step (validation fails)
    expect(screen.getByText('Your Account')).toBeInTheDocument();
  });

  it('proceeds to store step when account form is valid', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const freshSetupButton = screen.getByText('First-time Setup');
    fireEvent.click(freshSetupButton);

    // Fill valid account form
    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Your Store')).toBeInTheDocument();
    });
  });
});

describe('GenesisWizard — Restore Mode', () => {
  const mockGenesisState: GenesisState = {
    ready: false,
    has_user_with_pin: false,
    has_any_store: false,
    has_tables: false,
  };

  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnRun = vi.fn();
  const mockOnValidateRestore = vi.fn();
  const mockOnStartRestore = vi.fn();

  it('renders server connection step correctly', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
      expect(screen.getByLabelText('API Base URL')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
  });

  it('calls validateRestore when Connect & Preview is clicked', async () => {
    mockOnValidateRestore.mockResolvedValue({
      success: true,
      preview: {
        stores_count: 5,
        products_count: 100,
        transactions_count: 1000,
        last_sync_timestamp: '2 hours ago',
        estimated_critical_time_seconds: 30,
        estimated_total_time_minutes: 15,
      },
      error: null,
    });

    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    // Fill connection form
    const apiUrlInput = screen.getByLabelText('API Base URL');
    fireEvent.change(apiUrlInput, { target: { value: 'http://localhost:8000/api/v1' } });

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const connectButton = screen.getByText('Connect & Preview');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockOnValidateRestore).toHaveBeenCalledWith({
        apiBaseUrl: 'http://localhost:8000/api/v1',
        username: 'testuser',
        password: 'password123',
      });
    });
  });

  it('shows restore preview when validation succeeds', async () => {
    mockOnValidateRestore.mockResolvedValue({
      success: true,
      preview: {
        stores_count: 5,
        products_count: 100,
        transactions_count: 1000,
        last_sync_timestamp: '2 hours ago',
        estimated_critical_time_seconds: 30,
        estimated_total_time_minutes: 15,
      },
      error: null,
    });

    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    // Fill and submit connection form
    const apiUrlInput = screen.getByLabelText('API Base URL');
    fireEvent.change(apiUrlInput, { target: { value: 'http://localhost:8000/api/v1' } });

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const connectButton = screen.getByText('Connect & Preview');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Restore Preview')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // stores count
      expect(screen.getByText('100')).toBeInTheDocument(); // products count
      expect(screen.getByText('1000')).toBeInTheDocument(); // transactions count
    });
  });

  it('shows error when validation fails', async () => {
    mockOnValidateRestore.mockResolvedValue({
      success: false,
      preview: null,
      error: 'Invalid credentials',
    });

    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    // Fill and submit connection form
    const apiUrlInput = screen.getByLabelText('API Base URL');
    fireEvent.change(apiUrlInput, { target: { value: 'http://localhost:8000/api/v1' } });

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    const connectButton = screen.getByText('Connect & Preview');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('calls startRestore when Start Restore is clicked', async () => {
    mockOnValidateRestore.mockResolvedValue({
      success: true,
      preview: {
        stores_count: 5,
        products_count: 100,
        transactions_count: 1000,
        last_sync_timestamp: '2 hours ago',
        estimated_critical_time_seconds: 30,
        estimated_total_time_minutes: 15,
      },
      error: null,
    });

    mockOnStartRestore.mockResolvedValue({
      success: true,
      error: null,
    });

    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    // Fill connection form
    const apiUrlInput = screen.getByLabelText('API Base URL');
    fireEvent.change(apiUrlInput, { target: { value: 'http://localhost:8000/api/v1' } });

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const connectButton = screen.getByText('Connect & Preview');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Restore Preview')).toBeInTheDocument();
    });

    const startRestoreButton = screen.getByText('Start Restore');
    fireEvent.click(startRestoreButton);

    await waitFor(() => {
      expect(mockOnStartRestore).toHaveBeenCalledWith({
        apiBaseUrl: 'http://localhost:8000/api/v1',
        username: 'testuser',
        password: 'password123',
      });
    });
  });

  it('shows restore progress step during restore', async () => {
    mockOnValidateRestore.mockResolvedValue({
      success: true,
      preview: {
        stores_count: 5,
        products_count: 100,
        transactions_count: 1000,
        last_sync_timestamp: '2 hours ago',
        estimated_critical_time_seconds: 30,
        estimated_total_time_minutes: 15,
      },
      error: null,
    });

    mockOnStartRestore.mockResolvedValue({
      success: true,
      error: null,
    });

    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    // Fill connection form
    const apiUrlInput = screen.getByLabelText('API Base URL');
    fireEvent.change(apiUrlInput, { target: { value: 'http://localhost:8000/api/v1' } });

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const connectButton = screen.getByText('Connect & Preview');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Restore Preview')).toBeInTheDocument();
    });

    const startRestoreButton = screen.getByText('Start Restore');
    fireEvent.click(startRestoreButton);

    await waitFor(() => {
      expect(screen.getByText('Restoring Your Data')).toBeInTheDocument();
    });
  });
});

describe('GenesisWizard — Navigation and States', () => {
  const mockGenesisState: GenesisState = {
    ready: false,
    has_user_with_pin: false,
    has_any_store: false,
    has_tables: false,
  };

  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnRun = vi.fn();
  const mockOnValidateRestore = vi.fn();
  const mockOnStartRestore = vi.fn();

  it('allows back navigation from restore to selection', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByText('Restore from Server');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Connect to Server')).toBeInTheDocument();
    });

    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText('Choose Setup Path')).toBeInTheDocument();
    });
  });

  it('disables buttons during running state', async () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={true}
        error={null}
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    const restoreButton = screen.getByTestId('select-restore');
    expect(restoreButton).toBeDisabled();
  });

  it('displays global error when provided', () => {
    render(
      <GenesisWizard
        state={mockGenesisState}
        onComplete={mockOnComplete}
        onCancel={mockOnCancel}
        running={false}
        error="Global error occurred"
        onRun={mockOnRun}
        onValidateRestore={mockOnValidateRestore}
        onStartRestore={mockOnStartRestore}
      />,
    );

    expect(screen.getByText('Global error occurred')).toBeInTheDocument();
  });
});
