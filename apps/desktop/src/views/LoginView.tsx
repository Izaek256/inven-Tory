/**
 * LoginView — real login screen that posts to /api/v1/auth/login.
 *
 * Single-user mode (Issue fix/auth-bootstrap-single-user):
 *   - deviceId is NOW ALWAYS available (App.tsx either reads it from secure
 *     store or generates a stable one on first launch).
 *   - The central API auto-registers any unknown device_id on first
 *     successful login, so the desktop app can be placed and used on ANY
 *     machine without a separate device-registration step.
 *
 * Offline behavior:
 *   - When offline with an expired token, users see a banner instead of this
 *     screen — local operations continue and the outbox keeps queuing.
 *   - This screen is only shown when there is NO cached session at all
 *     (first-time launch or after explicit logout).
 */

import React, { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { Button, TextInput } from '@invenTory/ui';
import type { AuthSession } from '../types/auth';

interface LoginViewProps {
  deviceId: string;
  onLoginSuccess: (session: AuthSession) => void;
  apiBaseUrl?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({
  deviceId,
  onLoginSuccess,
  apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    // In single-user mode, deviceId is guaranteed non-empty by App.tsx.
    // Keep the guard for safety (defensive).
    if (!deviceId) {
      setError('Device is initializing… please retry in a moment.');
      return;
    }

    setLoading(true);
    try {
      const { login } = await import('../services/tauriAuthService');
      const session = await login(username.trim(), password, deviceId, apiBaseUrl);
      onLoginSuccess(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg === 'Failed to fetch' ? 'Cannot reach the server. Check your network connection.' : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--it-bg)',
      }}
      data-testid="login-view"
    >
      {/* Topbar — reference .login-topbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 18px',
          height: '56px',
          background: 'var(--paper-raised)',
          borderBottom: '1px solid var(--it-border)',
          flex: '0 0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              background: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
              <path
                d="M4 7L12 3L20 7M4 7V17L12 21M4 7L12 11M20 7V17L12 21M20 7L12 11M12 11V21"
                stroke="#201200"
                strokeWidth="1.8"
                strokeLinejoin="miter"
                strokeLinecap="square"
              />
            </svg>
          </div>
          <strong style={{ fontSize: '14.5px', color: 'var(--it-text-primary)' }}>
            inven-Tory
          </strong>
          <span
            style={{
              fontFamily: 'var(--it-font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              background: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              padding: '2px 6px',
            }}
          >
            v1.2.0
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            padding: '7px 11px',
            color: 'var(--it-text-disabled)',
            fontFamily: 'var(--it-font-mono)',
            fontSize: '12.5px',
          }}
        >
          <span style={{ display: 'inline-flex' }}>
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M20 20L16.5 16.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          Search all stores
        </div>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--it-font-mono)',
            fontSize: '11px',
            padding: '5px 9px',
            border: '1px solid var(--it-border)',
            color: 'var(--it-text-secondary)',
            background: 'var(--it-card)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              background: 'var(--green)',
              display: 'inline-block',
            }}
          />
          Online
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '380px',
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            padding: '30px 32px',
          }}
        >
          {/* Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                background: 'var(--amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" width="17" height="17">
                <path
                  d="M4 7L12 3L20 7M4 7V17L12 21M4 7L12 11M20 7V17L12 21M20 7L12 11M12 11V21"
                  stroke="#201200"
                  strokeWidth="1.8"
                  strokeLinejoin="miter"
                  strokeLinecap="square"
                />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                inven-Tory
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--it-font-mono)',
                  color: 'var(--it-text-disabled)',
                }}
              >
                Desktop client
              </div>
            </div>
          </div>

          <h2
            style={{
              fontSize: '19px',
              fontWeight: 600,
              color: 'var(--it-text-primary)',
              marginBottom: '18px',
            }}
          >
            Sign in
          </h2>

          {/* Error banner */}
          {error && (
            <div
              className="it-toast it-toast--error"
              style={{ marginBottom: '20px' }}
              data-testid="login-error"
            >
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate data-testid="login-form">
            <div style={{ marginBottom: '16px' }}>
              <TextInput
                id="login-username"
                label="Username"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                data-testid="login-username-input"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <TextInput
                id="login-password"
                label="Password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                data-testid="login-password-input"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              style={{ width: '100%', justifyContent: 'center' }}
              data-testid="login-submit-btn"
            >
              <LogIn size={14} />
              <span>Sign in</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
