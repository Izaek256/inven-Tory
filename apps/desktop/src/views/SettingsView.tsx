import React from 'react';
import { Settings } from 'lucide-react';
import { Card, ThemeToggle } from '@inven-tory/ui';

export const SettingsView: React.FC = () => {
  return (
    <div className="settings-view" data-testid="settings-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">System Settings</h2>
          <p className="view-subtitle">Device configuration, sync rules, and store parameters</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
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

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Settings size={24} color="var(--it-text-secondary)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                System Information
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                INVENTORY Tory v1.1.0 — Desktop Tauri client. SQLite local engine.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
