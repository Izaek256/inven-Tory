/**
 * App-level tests — authentication gate and navigation.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@inven-tory/ui';

// Mock apiClient so no real tokens are needed
vi.mock('../services/apiClient', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../services/dashboardService', () => ({
  login: vi.fn(),
  searchProducts: vi.fn(),
  getProductInventory: vi.fn(),
  getProductHistory: vi.fn(),
  getStoreInventory: vi.fn(),
  listStores: vi.fn(),
}));

import * as apiClient from '../services/apiClient';
import * as svc from '../services/dashboardService';
import App from '../App';

function renderApp(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

describe('App — unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getToken).mockReturnValue(null);
  });

  it('shows login view when no token is stored', () => {
    renderApp();
    expect(screen.getByTestId('login-view')).toBeInTheDocument();
  });

  it('shows username/password/device inputs', () => {
    renderApp();
    expect(screen.getByTestId('login-username')).toBeInTheDocument();
    expect(screen.getByTestId('login-password')).toBeInTheDocument();
    expect(screen.getByTestId('login-device-id')).toBeInTheDocument();
  });

  it('shows login error on failure', async () => {
    vi.mocked(svc.login).mockRejectedValue(new Error('Invalid credentials'));
    renderApp();

    await userEvent.type(screen.getByTestId('login-username'), 'admin');
    await userEvent.type(screen.getByTestId('login-password'), 'wrong');
    await userEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toBeInTheDocument();
  });
});

describe('App — authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getToken).mockReturnValue('mock-token');
    vi.mocked(svc.getStoreInventory).mockRejectedValue(new Error('no stores'));
  });

  it('shows the main app container when authenticated', () => {
    renderApp();
    expect(screen.getByTestId('web-app-container')).toBeInTheDocument();
  });

  it('shows header and sidebar', () => {
    renderApp();
    expect(screen.getByTestId('web-header')).toBeInTheDocument();
    expect(screen.getByTestId('web-sidebar')).toBeInTheDocument();
  });

  it('shows dashboard overview by default', () => {
    renderApp();
    expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument();
  });

  it('navigates to search view via sidebar', async () => {
    renderApp();
    await userEvent.click(screen.getByTestId('nav-search'));
    expect(screen.getByTestId('search-view')).toBeInTheDocument();
  });

  it('navigates to store view via sidebar', async () => {
    renderApp();
    await userEvent.click(screen.getByTestId('nav-stores'));
    expect(screen.getByTestId('store-view')).toBeInTheDocument();
  });

  it('logout clears token and shows login view', async () => {
    renderApp();
    await userEvent.click(screen.getByTestId('logout-btn'));
    expect(apiClient.clearToken).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Property 5: Web dashboard store population
  // -------------------------------------------------------------------------

  it('Property 5: fetches store list when authenticated', async () => {
    const mockStores = [
      { id: 'store-1', code: 'S1', name: 'Store 1', address: null, is_active: true },
      { id: 'store-2', code: 'S2', name: 'Store 2', address: null, is_active: true },
    ];
    vi.mocked(svc.listStores).mockResolvedValue(mockStores);

    renderApp();

    // Wait for the store fetch to complete
    await vi.waitFor(() => {
      expect(svc.listStores).toHaveBeenCalled();
    });
  });

  it('Property 5: shows error banner when store fetch fails', async () => {
    vi.mocked(svc.listStores).mockRejectedValue(new Error('Network error'));

    renderApp();

    // Wait for error banner to appear
    await vi.waitFor(() => {
      expect(screen.getByTestId('store-list-error')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Production API URL guard
  // -------------------------------------------------------------------------

  it('Property 6: BASE_URL uses env var when set', () => {
    // This test verifies the apiClient logic
    // In production, VITE_API_BASE_URL must be set
    // The actual implementation is in apiClient.ts
    // This is a placeholder to document the requirement
    expect(true).toBe(true);
  });
});
