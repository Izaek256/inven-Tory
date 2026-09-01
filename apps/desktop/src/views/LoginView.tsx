/**
 * LoginView — real login screen that posts to /api/v1/auth/login.
 *
 * Issue 25 — Auth consolidation.
 *
 * The device must already be registered with the central API before login
 * can succeed (device_id is required by the login endpoint, per FR-STORE-003).
 * The device_id is stored in Tauri's secure store alongside the JWT session.
 *
 * Offline behavior (Section 21):
 * - When offline with an expired token, users see a banner instead of this
 *   screen — local operations continue and the outbox keeps queuing.
 * - This screen is only shown when there is NO cached session at all
 *   (first-time launch or after explicit logout).
 */

import React, { useState } from 'react';
import { LogIn, AlertCircle, Wifi } from 'lucide-react';
import { Button, TextInput } from '@inven-tory/ui';
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
    if (!deviceId) {
      setError('Device is not registered. Please register this device first.');
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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--it-bg)',
        padding: '24px',
      }}
      data-testid="login-view"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          padding: '40px 32px',
          boxShadow: 'var(--it-shadow-md)',
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'var(--it-green-surface)',
              border: '1px solid var(--it-green-border)',
              borderRadius: 'var(--it-r-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-green-text)',
              fontWeight: 700,
              fontFamily: 'var(--it-font-mono)',
              fontSize: '16px',
            }}
          >
            IT
          </div>
          <div>
            <h1
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--it-text-primary)',
                lineHeight: 1.2,
              }}
            >
              INVENTORY Tory
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)' }}>Desktop Client</p>
          </div>
        </div>

        <h2
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--it-text-primary)',
            marginBottom: '24px',
          }}
        >
          Sign In
        </h2>

        {/* Device ID indicator */}
        {deviceId ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'var(--it-green-surface)',
              border: '1px solid var(--it-green-border)',
              borderRadius: 'var(--it-r-md)',
              marginBottom: '20px',
              fontSize: '12px',
              color: 'var(--it-green-text)',
            }}
            data-testid="device-indicator"
          >
            <Wifi size={14} />
            <span>
              Device registered:{' '}
              <code style={{ fontFamily: 'var(--it-font-mono)' }}>{deviceId.slice(0, 16)}…</code>
            </span>
          </div>
        ) : (
          <div
            className="it-toast it-toast--error"
            style={{ marginBottom: '20px', fontSize: '12px' }}
          >
            <AlertCircle size={14} />
            <span>This device is not registered. Contact your administrator.</span>
          </div>
        )}

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
              disabled={loading || !deviceId}
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
              disabled={loading || !deviceId}
              data-testid="login-password-input"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!deviceId}
            style={{ width: '100%' }}
            data-testid="login-submit-btn"
          >
            <LogIn size={18} />
            <span>Sign In</span>
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
