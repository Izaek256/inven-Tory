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
});
