/**
 * LoginView renders the sign-in form without the mini topbar header
 * (Issue: remove mini header from login page).
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { LoginView } from '../views/LoginView';

function renderLogin() {
  return render(
    <LoginView
      deviceId="device-1"
      onLoginSuccess={vi.fn()}
      apiBaseUrl="http://localhost:8000/api/v1"
    />,
  );
}

describe('LoginView (no mini header)', () => {
  it('renders the login view and form', () => {
    renderLogin();
    expect(screen.getByTestId('login-view')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByTestId('login-username-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-btn')).toBeInTheDocument();
  });

  it('does not render the mini topbar (version tag, search pill, Online chip)', () => {
    renderLogin();
    expect(screen.queryByText('v1.3.3')).not.toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.queryByText('Search all stores')).not.toBeInTheDocument();
  });
});
