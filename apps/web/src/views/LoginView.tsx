/**
 * Login view for the web dashboard.
 *
 * The API requires a device_id in the login payload.  For the web dashboard
 * we use a well-known fixed "WEB-DASHBOARD" device ID.  The device must be
 * pre-registered by an admin against a web-dashboard store before login works.
 *
 * This is a deliberate design choice: the web dashboard is a trusted,
 * centrally-managed client — not an end-user device.
 */

import React, { useState } from 'react';
import { Button, TextInput } from '@inven-tory/ui';
import { LogIn } from 'lucide-react';
import { login } from '../services/dashboardService';
import { setToken } from '../services/apiClient';

const WEB_DEVICE_ID = 'WEB-DASHBOARD-DEVICE';

interface LoginViewProps {
  onLoginSuccess: (role: string) => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps): React.ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceId, setDeviceId] = useState(WEB_DEVICE_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !deviceId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await login(username.trim(), password.trim(), deviceId.trim());
      setToken(data.access_token);
      onLoginSuccess(data.role);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Check credentials and device ID.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="web-login-wrap" data-testid="login-view">
      <div className="web-login-card">
        <div className="web-login-brand">
          <div className="brand-icon">IT</div>
          <div>
            <h1 className="web-login-title">INVENTORY Tory</h1>
            <p className="web-login-subtitle">Remote Management Dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="web-login-form" noValidate>
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            disabled={loading}
            data-testid="login-username"
          />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
            data-testid="login-password"
          />
          <TextInput
            label="Device ID"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            hint="The registered web-dashboard device ID assigned by your admin."
            required
            disabled={loading}
            data-testid="login-device-id"
          />

          {error && (
            <div className="it-toast it-toast--error" role="alert" data-testid="login-error">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={loading}
            style={{ width: '100%' }}
            data-testid="login-submit"
          >
            <LogIn size={18} aria-hidden="true" />
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
