/**
 * SettingsView — Issue 25 auth consolidation.
 *
 * Displays device configuration, theme, and current user identity.
 * The logout button calls tauriAuthService.logout() which clears
 * the secure token cache and returns to the login screen.
 */

import React, { useState } from 'react';
import { Settings, LogOut, User } from 'lucide-react';
import { Card, ThemeToggle, Badge, Button } from '@inven-tory/ui';
import type { AuthSession } from '../types/auth';

interface SettingsViewProps {
  currentUser?: AuthSession | null;
  onLogout?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser, onLogout }) => {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async (): Promise<void> => {
    if (!onLogout) return;
    setLoggingOut(true);
    try {
      onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="settings-view" data-testid="settings-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">System Settings</h2>
          <p className="view-subtitle">Device configuration, sync rules, and store parameters</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
        {/* Current User */}
        {currentUser && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: 'var(--it-green-surface)',
                  border: '1px solid var(--it-green-border)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <User size={20} color="var(--it-green-text)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                  {currentUser.full_name ?? currentUser.username}
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--it-text-secondary)',
                    marginTop: '2px',
                    fontFamily: 'var(--it-font-mono)',
                  }}
                >
                  @{currentUser.username}
                </p>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge status="SENT" label={currentUser.role} />
                  {currentUser.assigned_store_id && (
                    <Badge status="ACTIVE" label={`Store: ${currentUser.assigned_store_id}`} />
                  )}
                  {currentUser.token_expired_offline && (
                    <Badge status="INACTIVE" label="Session expired (offline)" />
                  )}
                </div>
              </div>
              {onLogout && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  loading={loggingOut}
                  data-testid="logout-btn"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Theme */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Interface Theme
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                Toggle between light and dark presentation modes.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </Card>

        {/* System info */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Settings size={24} color="var(--it-text-secondary)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                System Information
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                INVENTORY Tory v1.1.0 — Desktop Tauri client. SQLite local engine. Authentication:
                FastAPI JWT (Bearer transport).
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
