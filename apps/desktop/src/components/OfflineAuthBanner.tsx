/**
 * OfflineAuthBanner — Issue 25.
 *
 * Shown when the cached access token has expired while the device is offline
 * (Section 21: "Authentication expired → re-authenticate without deleting
 * queued transactions").
 *
 * Behavior:
 * - The banner informs the user that sync is paused until re-authentication.
 * - Local operations (receiving stock, recording sales, etc.) are NOT blocked.
 * - The outbox keeps queuing transactions normally.
 * - The banner offers a quick re-auth form that posts to the central API when
 *   the device comes back online.
 */

import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button, TextInput } from '@inven-tory/ui';

interface OfflineAuthBannerProps {
  username: string;
  deviceId: string;
  onReauthSuccess: () => void;
}

export const OfflineAuthBanner: React.FC<OfflineAuthBannerProps> = ({
  username,
  deviceId,
  onReauthSuccess,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const handleReauth = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { login } = await import('../services/tauriAuthService');
      await login(username, password, deviceId);
      setSucceeded(true);
      setPassword('');
      setTimeout(() => {
        onReauthSuccess();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (succeeded) {
    return (
      <div
        className="it-toast it-toast--success"
        style={{ margin: '0 0 12px 0' }}
        data-testid="reauth-success-banner"
      >
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>Re-authenticated. Sync will resume shortly.</span>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--it-yellow-surface, #fffbeb)',
        border: '1px solid var(--it-yellow-border, #fde68a)',
        borderRadius: 'var(--it-r-md)',
        padding: '12px 16px',
        marginBottom: '12px',
      }}
      data-testid="offline-auth-banner"
      role="alert"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertTriangle size={18} color="var(--it-yellow-text, #d97706)" aria-hidden="true" />
        <div style={{ flex: 1, fontSize: '13px', color: 'var(--it-text-primary)' }}>
          <strong>Session expired</strong> — sync is paused. Local operations continue normally and
          your queued transactions are safe.
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          data-testid="reauth-expand-btn"
        >
          <RefreshCw size={14} />
          <span>Re-authenticate</span>
        </Button>
      </div>

      {expanded && (
        <form
          onSubmit={handleReauth}
          style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}
          data-testid="reauth-form"
        >
          <div style={{ flex: 1 }}>
            <TextInput
              id="reauth-password"
              label={`Password for ${username}`}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              data-testid="reauth-password-input"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            data-testid="reauth-submit-btn"
          >
            Sign In
          </Button>
        </form>
      )}

      {error && (
        <p
          style={{ marginTop: '8px', fontSize: '12px', color: 'var(--it-red-text)' }}
          data-testid="reauth-error"
        >
          {error}
        </p>
      )}
    </div>
  );
};
