/**
 * MobileLoginForm — Mobile companion login component.
 *
 * Issue 25 — Auth consolidation.
 * Authenticates against the central /api/v1/auth/login endpoint.
 * Mobile uses read-only scope (FR-MOBILE-003) enforced server-side.
 */

import React, { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { Button, TextInput } from '@inven-tory/ui';

interface MobileLoginFormProps {
  onLoginSuccess: (session: {
    access_token: string;
    user_id: number;
    username: string;
    role: string;
  }) => void;
  apiBaseUrl?: string;
}

export const MobileLoginForm: React.FC<MobileLoginFormProps> = ({
  onLoginSuccess,
  apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      // Use FastAPI Users standard JWT login for mobile
      const resp = await fetch(`${apiBaseUrl}/auth/jwt/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          username: email,
          password: password,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        const detail = (body as { detail?: string }).detail ?? resp.statusText;
        throw new Error(detail);
      }

      const data = await resp.json();
      onLoginSuccess({
        access_token: data.access_token,
        user_id: data.id, // FastAPI Users returns user ID in the token
        username: email,
        role: 'STORE_CLERK', // Will be updated from /auth/me
      });
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
    <form onSubmit={handleSubmit} data-testid="mobile-login-form">
      <div style={{ marginBottom: '16px' }}>
        <TextInput
          id="mobile-login-email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          data-testid="mobile-login-email-input"
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <TextInput
          id="mobile-login-password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          data-testid="mobile-login-password-input"
        />
      </div>

      {error && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '20px' }}
          data-testid="mobile-login-error"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        loading={loading}
        style={{ width: '100%' }}
        data-testid="mobile-login-submit-btn"
      >
        <LogIn size={18} />
        <span>Sign In</span>
      </Button>
    </form>
  );
};

export default MobileLoginForm;
